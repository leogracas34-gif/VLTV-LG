// VLTV Play - Servidor de parceiros (código de parceiro).
// Sem dependências: só precisa do Node 14 ou mais novo.
//
// Como iniciar:
//   ADMIN_KEY=sua-chave-secreta node servidor.js
//
// Variáveis (opcionais): PORT (padrão 3355), ARQUIVO (padrão parceiros.json).
//
// App da TV (público):
//   GET  /parceiro/resolver?codigo=ABCD2345
// Administração (precisa do cabeçalho x-admin-key):
//   GET    /admin/parceiros                -> lista
//   POST   /admin/parceiros                -> cria  { "nome": "Provedor X", "dns": ["http://dns1.com"] }
//   PATCH  /admin/parceiros/CODIGO         -> edita { "nome", "dns", "ativo" } (ativo=false suspende)
//   DELETE /admin/parceiros/CODIGO         -> apaga

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORTA = parseInt(process.env.PORT, 10) || 3355;
const ARQUIVO = process.env.ARQUIVO || path.join(__dirname, 'parceiros.json');
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// Limite de consultas por IP (evita alguém ficar testando códigos).
const LIMITE_POR_MINUTO = 20;
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sem letras e números parecidos

if (!ADMIN_KEY || ADMIN_KEY.length < 12) {
  console.error('Defina ADMIN_KEY com pelo menos 12 caracteres. Exemplo: ADMIN_KEY=minha-chave-bem-grande node servidor.js');
  process.exit(1);
}

// ── Dados ───────────────────────────────────────────────────────────
function carregar() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    return Array.isArray(dados.parceiros) ? dados : { parceiros: [] };
  } catch (e) {
    return { parceiros: [] };
  }
}

function salvar(dados) {
  const temporario = ARQUIVO + '.tmp';
  fs.writeFileSync(temporario, JSON.stringify(dados, null, 2));
  fs.renameSync(temporario, ARQUIVO);
}

function limparCodigo(texto) {
  return String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function gerarCodigo(existentes) {
  for (;;) {
    const bytes = crypto.randomBytes(8);
    let codigo = '';
    for (let i = 0; i < 8; i++) { codigo += ALFABETO[bytes[i] % ALFABETO.length]; }
    if (!existentes.some(p => p.codigo === codigo)) { return codigo; }
  }
}

function limparDns(lista) {
  if (!Array.isArray(lista)) { return []; }
  const saida = [];
  lista.forEach(item => {
    let u = String(item || '').trim();
    if (!u) { return; }
    if (!/^https?:\/\//i.test(u)) { u = 'http://' + u; }
    u = u.replace(/\/+$/, '');
    if (saida.indexOf(u) === -1) { saida.push(u); }
  });
  return saida;
}

// ── Utilidades de resposta ──────────────────────────────────────────
function responder(res, status, corpo) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-admin-key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', parte => {
      tamanho += parte.length;
      if (tamanho > 10000) { reject(new Error('grande')); req.destroy(); return; }
      partes.push(parte);
    });
    req.on('end', () => {
      try { resolve(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); }
      catch (e) { reject(new Error('json')); }
    });
    req.on('error', reject);
  });
}

function ipDe(req) {
  // Atrás do nginx, o IP real vem no cabeçalho x-forwarded-for.
  const encaminhado = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return encaminhado || req.socket.remoteAddress || 'desconhecido';
}

const consultas = new Map();   // ip -> { inicio, total }

function passouDoLimite(ip) {
  const agora = Date.now();
  const atual = consultas.get(ip);
  if (!atual || agora - atual.inicio > 60000) {
    consultas.set(ip, { inicio: agora, total: 1 });
    return false;
  }
  atual.total++;
  return atual.total > LIMITE_POR_MINUTO;
}

setInterval(() => {
  const agora = Date.now();
  consultas.forEach((v, ip) => { if (agora - v.inicio > 60000) { consultas.delete(ip); } });
}, 60000).unref();

function chaveAdminValida(req) {
  const enviada = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const certa = Buffer.from(ADMIN_KEY);
  return enviada.length === certa.length && crypto.timingSafeEqual(enviada, certa);
}

// ── Rotas ───────────────────────────────────────────────────────────
async function tratar(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rota = url.pathname.replace(/\/+$/, '');

  if (req.method === 'OPTIONS') { return responder(res, 204, {}); }

  // App da TV: descobre os DNS do parceiro.
  if (req.method === 'GET' && rota === '/parceiro/resolver') {
    if (passouDoLimite(ipDe(req))) { return responder(res, 429, { ok: false, erro: 'limite' }); }

    const codigo = limparCodigo(url.searchParams.get('codigo'));
    const parceiro = carregar().parceiros.find(p => p.codigo === codigo);
    if (!parceiro) { return responder(res, 404, { ok: false, erro: 'codigo_invalido' }); }
    if (!parceiro.ativo) { return responder(res, 403, { ok: false, erro: 'suspenso' }); }
    return responder(res, 200, { ok: true, nome: parceiro.nome, dns: parceiro.dns });
  }

  // Administração.
  if (rota === '/admin/parceiros' || rota.indexOf('/admin/parceiros/') === 0) {
    if (!chaveAdminValida(req)) { return responder(res, 401, { ok: false, erro: 'nao_autorizado' }); }

    const dados = carregar();
    const codigo = limparCodigo(rota.split('/')[3]);

    if (req.method === 'GET' && rota === '/admin/parceiros') {
      return responder(res, 200, { ok: true, parceiros: dados.parceiros });
    }

    if (req.method === 'POST' && rota === '/admin/parceiros') {
      const corpo = await lerCorpo(req);
      const dns = limparDns(corpo.dns);
      const nome = String(corpo.nome || '').trim();
      if (!nome || dns.length === 0) { return responder(res, 400, { ok: false, erro: 'informe_nome_e_dns' }); }
      const novo = { codigo: gerarCodigo(dados.parceiros), nome, dns, ativo: true, criado: new Date().toISOString() };
      dados.parceiros.push(novo);
      salvar(dados);
      return responder(res, 201, { ok: true, parceiro: novo });
    }

    const parceiro = dados.parceiros.find(p => p.codigo === codigo);

    if (req.method === 'PATCH' && codigo) {
      if (!parceiro) { return responder(res, 404, { ok: false, erro: 'codigo_invalido' }); }
      const corpo = await lerCorpo(req);
      if (typeof corpo.nome === 'string' && corpo.nome.trim()) { parceiro.nome = corpo.nome.trim(); }
      if (corpo.dns !== undefined) {
        const dns = limparDns(corpo.dns);
        if (dns.length === 0) { return responder(res, 400, { ok: false, erro: 'dns_vazio' }); }
        parceiro.dns = dns;
      }
      if (typeof corpo.ativo === 'boolean') { parceiro.ativo = corpo.ativo; }
      salvar(dados);
      return responder(res, 200, { ok: true, parceiro });
    }

    if (req.method === 'DELETE' && codigo) {
      if (!parceiro) { return responder(res, 404, { ok: false, erro: 'codigo_invalido' }); }
      dados.parceiros = dados.parceiros.filter(p => p.codigo !== codigo);
      salvar(dados);
      return responder(res, 200, { ok: true });
    }
  }

  return responder(res, 404, { ok: false, erro: 'rota_nao_encontrada' });
}

http.createServer((req, res) => {
  tratar(req, res).catch(erro => {
    const status = erro && (erro.message === 'json' || erro.message === 'grande') ? 400 : 500;
    responder(res, status, { ok: false, erro: 'requisicao_invalida' });
  });
}).listen(PORTA, () => console.log('Servidor de parceiros na porta ' + PORTA));

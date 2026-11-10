#!/usr/bin/env python3
"""Gera os arquivos de atualização para subir na VPS (https://vltvplay.tech/apptv/).

Uso (na raiz do repositório):
  python3 ferramentas/publicar.py --versao 1.4.4 --notas "Correção do banner"      # LG
  python3 ferramentas/publicar.py --plataforma samsung --versao 1.4.4               # Samsung

O que faz:
  1) (opcional) --versao: troca o número da versão em config.js, appinfo.json e atualizador.js.
  2) Confere que os três números são iguais.
  3) Junta index.html + CSS + JS num único pacote.json (com soma de conferência).
  4) Escreve publicar/<plataforma>/pacote.json e publicar/<plataforma>/versao.json.

Chaves: se existirem as variáveis TMDB_API_KEY e VPS_APP_KEY (no GitHub vêm dos Secrets), elas são colocadas
no pacote, como o build do .ipk/.wgt faz. Sem elas o script recusa gerar o pacote (use --sem-chaves só para teste).

O pacote sempre sai com o atualizador LIGADO (ATIVO = true), para que a TV continue recebendo as próximas versões.

Suba SEMPRE o pacote.json primeiro e o versao.json por último: é o versao.json que avisa as TVs.
"""
import argparse, hashlib, json, os, re, subprocess, sys, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBOS = os.path.join(RAIZ, 'webos')


def ler(c):
    with open(c, encoding='utf-8') as f:
        return f.read()


def gravar(c, t):
    with open(c, 'w', encoding='utf-8', newline='') as f:
        f.write(t)


def versao_config():
    m = re.search(r"VERSAO:\s*'([^']+)'", ler(os.path.join(WEBOS, 'js', 'config.js')))
    return m.group(1) if m else None


def versao_appinfo():
    return json.load(open(os.path.join(WEBOS, 'appinfo.json'), encoding='utf-8'))['version']


def versao_atualizador():
    m = re.search(r"var VERSAO_APK = '([^']+)'", ler(os.path.join(WEBOS, 'js', 'atualizador.js')))
    return m.group(1) if m else None


def trocar_versao(nova):
    c = os.path.join(WEBOS, 'js', 'config.js')
    gravar(c, re.sub(r"(VERSAO:\s*')[^']+(')", lambda m: m.group(1) + nova + m.group(2), ler(c), count=1))
    a = os.path.join(WEBOS, 'appinfo.json')
    gravar(a, re.sub(r'("version"\s*:\s*")[^"]+(")', lambda m: m.group(1) + nova + m.group(2), ler(a), count=1))
    u = os.path.join(WEBOS, 'js', 'atualizador.js')
    gravar(u, re.sub(r"(var VERSAO_APK = ')[^']+(')", lambda m: m.group(1) + nova + m.group(2), ler(u), count=1))


def fnv1a(texto):
    """Mesma conta do atualizador.js (percorre as unidades UTF-16, como o charCodeAt)."""
    dados = texto.encode('utf-16-le')
    h = 0x811c9dc5
    for i in range(0, len(dados), 2):
        h ^= dados[i] | (dados[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return '%08x' % h


def montar_html(pasta, versao):
    html = ler(os.path.join(pasta, 'index.html'))

    def css(m):
        arq = os.path.join(pasta, m.group(1))
        if not os.path.exists(arq):
            sys.exit('ERRO: CSS não encontrado: ' + m.group(1))
        # O CSS passa a viver dentro do index.html, então os caminhos ../fonts/ viram fonts/.
        return '<style>\n' + ler(arq).replace('../fonts/', 'fonts/') + '\n</style>'

    def js(m):
        arq = os.path.join(pasta, m.group(1))
        if not os.path.exists(arq):
            sys.exit('ERRO: JS não encontrado: ' + m.group(1))
        return '<script>\n' + re.sub(r'</(script)', r'<\\/\1', ler(arq), flags=re.I) + '\n</script>'

    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>', js, html)
    if re.search(r'(src|href)="(js|css)/', html):
        sys.exit('ERRO: sobrou referência a js/ ou css/ sem embutir. Ajuste ferramentas/publicar.py.')
    marca = '<head>'
    if marca not in html:
        sys.exit('ERRO: <head> não encontrado no index.html.')
    # Impede o atualizador de montar o pacote de novo (evita laço) e identifica a versão em uso.
    return html.replace(marca, marca + '\n  <script>window.__VLTV_REMOTO = ' + json.dumps(versao) + ';</script>', 1)


def injetar_chaves(html, exigir):
    """Troca os marcadores do config.js pelas chaves reais (mesma regra dos workflows de build)."""
    tmdb = re.sub(r'[\s"\']', '', os.environ.get('TMDB_API_KEY', ''))
    vps = os.environ.get('VPS_APP_KEY', '').strip().replace('\\', '\\\\').replace("'", "\\'")
    if tmdb:
        html = html.replace('__TMDB_API_KEY__', tmdb)
    if vps:
        html = html.replace('__VPS_APP_KEY__', vps)
    faltam = [m for m in ('__TMDB_API_KEY__', '__VPS_APP_KEY__') if m in html]
    if faltam and exigir:
        sys.exit('ERRO: faltam as chaves %s. Defina as variáveis TMDB_API_KEY e VPS_APP_KEY '
                 '(no GitHub: Secrets) ou use --sem-chaves para um teste.' % ', '.join(faltam))
    if faltam:
        print('AVISO: pacote SEM as chaves %s (modo --sem-chaves). Não suba este pacote para as TVs.' % ', '.join(faltam))
    return html


def ligar_atualizador(html):
    """O pacote precisa carregar o atualizador ligado, senão a TV para de receber as versões seguintes."""
    novo = html.replace('var ATIVO = false;', 'var ATIVO = true;', 1)
    if 'var ATIVO = true;' not in novo:
        sys.exit('ERRO: não achei "var ATIVO" no atualizador.js. Ajuste ferramentas/publicar.py.')
    return novo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plataforma', choices=['lg', 'samsung'], default='lg')
    ap.add_argument('--versao', help='nova versão (ex.: 1.4.4)')
    ap.add_argument('--notas', default='', help='texto curto mostrado no pop-up')
    ap.add_argument('--saida', default=os.path.join(RAIZ, 'publicar'))
    ap.add_argument('--sem-chaves', action='store_true', help='só para teste: aceita pacote sem as chaves do TMDB/app')
    a = ap.parse_args()

    if a.versao:
        if not re.fullmatch(r'\d+(\.\d+){1,3}', a.versao):
            sys.exit('ERRO: versão inválida (use algo como 1.4.4).')
        trocar_versao(a.versao)

    v = {versao_config(), versao_appinfo(), versao_atualizador()}
    if len(v) != 1 or None in v:
        sys.exit('ERRO: versões diferentes em config.js / appinfo.json / atualizador.js: %s' % sorted(map(str, v)))
    versao = v.pop()

    pasta = WEBOS
    if a.plataforma == 'samsung':
        subprocess.check_call([sys.executable, os.path.join(RAIZ, 'tizen', 'montar.py')])
        pasta = os.path.join(RAIZ, 'tizen-build')

    html = ligar_atualizador(injetar_chaves(montar_html(pasta, versao), not a.sem_chaves))
    pacote = {'versao': versao, 'hash': fnv1a(html), 'html': html}
    saida = os.path.join(a.saida, a.plataforma)
    os.makedirs(saida, exist_ok=True)
    gravar(os.path.join(saida, 'pacote.json'), json.dumps(pacote, ensure_ascii=True, separators=(',', ':')))
    gravar(os.path.join(saida, 'versao.json'), json.dumps(
        {'versao': versao, 'notas': a.notas, 'data': datetime.date.today().isoformat()}, ensure_ascii=False, indent=2))
    tam = os.path.getsize(os.path.join(saida, 'pacote.json')) // 1024
    print('Pronto: versão %s (%s), pacote de %d KB em %s' % (versao, a.plataforma, tam, saida))
    print('Suba primeiro pacote.json e depois versao.json para https://vltvplay.tech/apptv/%s/' % a.plataforma)


if __name__ == '__main__':
    main()

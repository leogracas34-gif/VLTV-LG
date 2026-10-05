// VLTV Play - webOS | Configuração central.
// Tudo que pode mudar fica aqui, para não espalhar valores pelo código.
window.VLTV = window.VLTV || {};

VLTV.config = {
  // Versão mostrada em Configurações (mantenha igual ao appinfo.json).
  VERSAO: '1.0.0',

  // Arquivo com a lista de DNS, hospedado na sua VPS (o mesmo que o app Android usa).
  DNS_CONFIG_URL: 'https://vltvplay.tech/dns_config.json',

  // Lista de emergência: só vale se a VPS não responder e o aparelho
  // nunca tiver baixado a lista (mesma lista embutida no app Android).
  DNS_FALLBACK: [
    'http://fibercdn.sbs',
    'http://ranos.sbs',
    'http://cmdtv.casa',
    'http://cmdtv.pro',
    'http://cmdtv.sbs',
    'http://cmdtv.top',
    'http://cmdbr.life',
    'http://supertv.red',
    'http://kodexk.click',
    'http://maisplaytech.space',
    'http://pthdtv.sbs',
    'http://pthdtv.top',
    'http://cdnsec.cyou',
    'http://fx12.sbs',
    'http://anotaai.lol',
    'http://brtx.beauty',
    'http://fuiali.vip',
    'http://dogshow.club',
    'http://cdnsec.click',
    'http://sivimcdn.click',
    'http://cybertronplay.space'
  ],

  // Compatibilidade: TVs LG de 2018 em diante (webOS 4.0 ou mais novo, navegador Chrome 53+).
  MIN_WEBOS_YEAR: 2018,
  MIN_WEBOS_SDK: 4,
  MIN_CHROME: 53,

  // Servidor de parceiros (código de parceiro). Troque pelo endereço onde você publicar
  // o servidor da pasta vps-parceiros.
  PARCEIRO_URL: 'https://api.vltvplay.tech/parceiro/resolver',

  // Backend da VPS (o mesmo HomeApiClient do Android). Créditos aprendidos do botão "Próximo episódio":
  //   GET  {VPS_URL}/credits?domain=DNS&series=ID_DO_1o_EPISODIO  ->  { remaining_sec: N }
  //   POST {VPS_URL}/credits  { domain, series, remaining_sec }  (cabeçalho x-app-key)
  // Atenção: o servidor precisa liberar CORS (Access-Control-Allow-Origin e, para o POST,
  // Access-Control-Allow-Headers: Content-Type, x-app-key), senão a TV só usa o valor salvo nela.
  VPS_URL: 'http://51.222.26.119:3344',
  VPS_APP_KEY: 'L468983c@',

  // TMDB (logos no lugar do nome na tela de detalhes). A chave NÃO fica no código: o GitHub Actions
  // troca o texto abaixo pelo Secret TMDB_API_KEY na hora de gerar o .ipk (veja build-webos.yml).
  // Sem o Secret, tudo funciona normalmente, só que sem logos (aparece o nome limpo).
  TMDB_API_KEY: '__TMDB_API_KEY__',
  // Imagens do TMDB servidas pela sua VPS (mesmo endereço do app Android).
  TMDB_IMAGENS_URL: 'https://cdn.vltvplay.tech',
  TMDB_TAMANHO_LOGO: 'w500',

  // Lista M3U: tamanho máximo aceito (a TV tem pouca memória).
  M3U_MAX_BYTES: 60000000,

  // Tempos de espera (milissegundos).
  DNS_CONFIG_TIMEOUT_MS: 5000,
  LOGIN_TIMEOUT_MS: 8000,
  PARCEIRO_TIMEOUT_MS: 8000,
  M3U_TIMEOUT_MS: 45000
};

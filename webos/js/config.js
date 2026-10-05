// VLTV Play - webOS | Configuração central.
// Tudo que pode mudar fica aqui, para não espalhar valores pelo código.
window.VLTV = window.VLTV || {};

VLTV.config = {
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

  // Compatibilidade: TVs LG de 2020 em diante (webOS 5.0 ou mais novo).
  MIN_WEBOS_YEAR: 2020,
  MIN_WEBOS_SDK: 5,
  MIN_CHROME: 79,

  // Servidor de parceiros (código de parceiro). Troque pelo endereço onde você publicar
  // o servidor da pasta vps-parceiros.
  PARCEIRO_URL: 'https://api.vltvplay.tech/parceiro/resolver',

  // Lista M3U: tamanho máximo aceito (a TV tem pouca memória).
  M3U_MAX_BYTES: 60000000,

  // Tempos de espera (milissegundos).
  DNS_CONFIG_TIMEOUT_MS: 5000,
  LOGIN_TIMEOUT_MS: 8000,
  PARCEIRO_TIMEOUT_MS: 8000,
  M3U_TIMEOUT_MS: 45000
};

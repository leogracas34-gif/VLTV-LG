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

  // Tempos de espera (milissegundos).
  DNS_CONFIG_TIMEOUT_MS: 5000,
  LOGIN_TIMEOUT_MS: 8000
};

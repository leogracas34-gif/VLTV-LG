// VLTV Play - webOS | Configuração central.
// Tudo que pode mudar fica aqui, para não espalhar valores pelo código.
window.VLTV = window.VLTV || {};

VLTV.config = {
  // Versão mostrada em Configurações (mantenha igual ao appinfo.json).
  VERSAO: '1.2.7',

  // Contato de suporte mostrado em Configurações > Sobre (ex: 'suporte@seudominio.com'). Vazio = não mostra.
  SUPORTE: 'leandro_gracas@yahoo.com.br',

  // WhatsApp de suporte mostrado em Configurações > Sobre (ex: '+55 11 99999-9999'). Vazio = não mostra.
  SUPORTE_WHATSAPP: '',

  // Gateway (DNS mascarado): o app fala SÓ com este endereço. Os DNS reais dos servidores
  // ficam escondidos na VPS (arquivo origens.json) e nunca chegam ao app.
  // Para trocar o nome (ex: tv.vltvplay.tech), mude aqui, em VPS_URL e no nginx da VPS.
  GATEWAY_URL: 'https://tv.vltvplay.tech',

  // Banner de destaques na Home. false = só os três botões grandes (sem banner).
  BANNER_ATIVO: true,

  // Compatibilidade: TVs LG de 2018 em diante (webOS 4.0 ou mais novo, navegador Chrome 53+).
  MIN_WEBOS_YEAR: 2018,
  MIN_WEBOS_SDK: 4,
  MIN_CHROME: 53,

  // Ajuste de fuso do guia de programação (EPG), em horas. 0 = usa o horário que o painel manda.
  // Se TODOS os canais estiverem com a hora errada pelo mesmo tanto, ajuste aqui (ex.: -3 se o guia está 3 h adiantado).
  EPG_AJUSTE_HORAS: 0,

  // Player (só Samsung): true = usa o player nativo da Samsung (AVPlay) ANTES do da tag <video>.
  // Deixe false até testar numa TV Samsung de verdade; com false, o AVPlay entra só como reserva
  // quando a TV não consegue abrir o vídeo pelo caminho normal.
  AVPLAY_PRIMEIRO: false,

  // Motor de reprodução. false = igual ao app antigo (só a tag <video>): é o modo seguro.
  // true = liga hls.js, mpegts.js, AVPlay (Samsung) e reconexão automática. Só ligue depois de testar na TV do cliente.
  MOTOR_AVANCADO: false,

  // true = quando um vídeo não toca, a mensagem mostra o que foi tentado e o motivo (ajuda no suporte).
  DIAGNOSTICO: false,

  // Licença (teste grátis de 7 dias + ativação anual) e visual remoto: mesma VPS, por HTTPS.
  LICENCA_URL: 'https://api.vltvplay.tech',

  // A cada quantos segundos o app confere a licença/parceiro com a VPS enquanto está aberto (bloqueio na hora).
  LICENCA_VIGIA_S: 30,

  // Quantos dias antes do vencimento a TV começa a avisar (licença do app e plano de canais).
  AVISO_VENCIMENTO_DIAS: 7,

  // Servidor de parceiros (código de parceiro). Troque pelo endereço onde você publicar
  // o servidor da pasta vps-parceiros.
  PARCEIRO_URL: 'https://api.vltvplay.tech/parceiro/resolver',

  // Backend da VPS (o mesmo HomeApiClient do Android). Créditos aprendidos do botão "Próximo episódio":
  //   GET  {VPS_URL}/credits?domain=DNS&series=ID_DO_1o_EPISODIO  ->  { remaining_sec: N }
  //   POST {VPS_URL}/credits  { domain, series, remaining_sec }  (cabeçalho x-app-key)
  // A chave NÃO fica no código: o GitHub Actions troca o texto marcado abaixo pelo Secret VPS_APP_KEY ao gerar o .ipk.
  // Atenção: o servidor precisa liberar CORS (Access-Control-Allow-Origin e, para o POST,
  // Access-Control-Allow-Headers: Content-Type, x-app-key), senão a TV só usa o valor salvo nela.
  // Passa pelo gateway, que troca o "painel:ID" pelo DNS real antes de falar com o backend.
  VPS_URL: 'https://tv.vltvplay.tech',
  VPS_APP_KEY: '__VPS_APP_KEY__',

  // TMDB (logos no lugar do nome na tela de detalhes). A chave NÃO fica no código: o GitHub Actions
  // troca o texto abaixo pelo Secret TMDB_API_KEY na hora de gerar o .ipk (veja build-webos.yml).
  // Sem o Secret, tudo funciona normalmente, só que sem logos (aparece o nome limpo).
  TMDB_API_KEY: '__TMDB_API_KEY__',
  // Imagens do TMDB servidas pela sua VPS (mesmo endereço do app Android).
  TMDB_IMAGENS_URL: 'https://cdn.vltvplay.tech',
  TMDB_TAMANHO_LOGO: 'w500',
  // Imagem dos episódios que o painel não manda com imagem.
  TMDB_TAMANHO_EPISODIO: 'w300',
  // Fundo dos filmes que o painel não manda com imagem de fundo (tela de detalhes).
  TMDB_TAMANHO_FUNDO: 'w1280',
  // Quanto esperar (ms) pelo fundo do TMDB antes de usar a capa desfocada. Decide UMA vez, sem trocar depois.
  TMDB_FUNDO_ESPERA_MS: 1800,

  // Cache do catálogo na TV: dentro desse tempo (ms) a TV nem confere o painel de novo.
  // Fora dele ela mostra o que está guardado e confere por trás.
  CACHE_VALIDADE_MS: 600000,

  // Lista M3U: tamanho máximo aceito (a TV tem pouca memória).
  M3U_MAX_BYTES: 60000000,

  // Tempos de espera (milissegundos).
  LOGIN_TIMEOUT_MS: 15000,
  PARCEIRO_TIMEOUT_MS: 8000,
  M3U_TIMEOUT_MS: 45000
};

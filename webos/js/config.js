// VLTV Play - webOS | Configuração central.
// Tudo que pode mudar fica aqui, para não espalhar valores pelo código.
window.VLTV = window.VLTV || {};

VLTV.config = {
  // Versão mostrada em Configurações (mantenha igual ao appinfo.json).
  VERSAO: '1.4.7',

  // Contato de suporte mostrado em Configurações > Sobre (ex: 'suporte@seudominio.com'). Vazio = não mostra.
  SUPORTE: 'leandro_gracas@yahoo.com.br',

  // Endereço da política de privacidade, mostrado em Configurações > Sobre (as lojas pedem esse link dentro do app).
  // Troque pelo endereço real da página no seu site.
  POLITICA_PRIVACIDADE_URL: 'https://vltvplay.tech/privacidade',

  // WhatsApp de suporte mostrado em Configurações > Sobre (ex: '+55 11 99999-9999'). Vazio = não mostra.
  SUPORTE_WHATSAPP: '+55 31 99849-1711',

  // Gateway (DNS mascarado): o app fala SÓ com este endereço. Os DNS reais dos servidores
  // ficam escondidos na VPS (arquivo origens.json) e nunca chegam ao app.
  // Para trocar o nome (ex: tv.vltvplay.tech), mude aqui, em VPS_URL e no nginx da VPS.
  GATEWAY_URL: 'https://tv.vltvplay.tech',

  // Banner de destaques na Home. false = só os três botões grandes (sem banner).
  BANNER_ATIVO: true,

  // Destaque da semana: um segundo banner, ao lado do banner de destaques (que fica menor enquanto ele estiver ligado).
  // Desligado, a Home fica exatamente como era. Normalmente é ligado/desligado pelo painel (campos destaque_* de /lg/config);
  // estes valores valem só quando o painel não manda nada. tipo: 'filmes' ou 'series'. nome: nome do título (o app procura no painel da conta). imagem: JPEG próprio, usado só se o TMDB não achar fundo. sinopse: texto que aparece embaixo do título (vazio = usa a do TMDB). tmdb: ID do título no TMDB (opcional; com ele logo e fundo vêm direto do título certo).
  // true = mostra na Home, em letras amarelas pequenas, por que o destaque da semana apareceu ou não (para testar).
  // Depois que estiver funcionando, troque para false.
  DESTAQUE_DIAGNOSTICO: false,
  DESTAQUE_SEMANA: { ativo: false, tipo: 'filmes', nome: '', imagem: '', tmdb: '', sinopse: '' },

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

  // Canal ao vivo: qual formato o app tenta PRIMEIRO. 'ts' = sinal original do provedor (costuma ser mais nítido);
  // 'm3u8' = HLS (o que o app usava antes). Se o 'ts' não abrir na TV, o app cai no m3u8 sozinho e, depois de 2 vezes
  // seguidas, passa a começar pelo m3u8 nessa TV (para o canal não demorar a abrir).
  FORMATO_LIVE: 'm3u8',

  // true = mostra, junto do nome do canal, o formato e a resolução real do sinal (ex.: TS · 1920x1080 Full HD).
  // Bom para testar a qualidade; coloque false na versão de clientes.
  MOSTRAR_QUALIDADE: false,

  // true = quando um vídeo não toca, a mensagem mostra o que foi tentado e o motivo (ajuda no suporte).
  DIAGNOSTICO: false,

  // Canal ao vivo: quantos segundos a imagem pode ficar parada antes de o app derrubar a conexão e abrir o canal de novo.
  // Baixo demais (era 6) causa o ciclo "carregando / reconectando" quando o servidor engasga por um instante.
  LIVE_TRAVOU_S: 25,

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

  // Proteção de tela estilo Netflix: com a TV parada (Home, Filmes, Séries, detalhes, Configurações ou player pausado),
  // passam capas de filmes e séries do TMDB com logo, gêneros e data de estreia. Qualquer tecla do controle fecha.
  // PROTETOR_SEGUNDOS = quantos segundos parado até começar (0 = desligada). PROTETOR_TAMANHO_FUNDO = qualidade da capa
  // ('w1280' é leve e segura para todas as TVs; 'w1920' fica mais nítida, só use se a sua TV aguentar).
  // Medidor de travadas (só para testes): true mostra, no canto de cima da tela, as últimas vezes em que o app ficou preso.
  DIAGNOSTICO_TRAVADAS: false,

  PROTETOR_SEGUNDOS: 90,
  PROTETOR_TAMANHO_FUNDO: 'w1280',

  // Trabalho em segundo plano (deixa tudo pronto antes de você pedir). Para descobrir o que pesa na TV:
  // coloque false numa chave, gere o app e compare. Com false, nada disso roda sozinho (o app busca só quando você abre).
  PREPARO_PESQUISA: true,    // monta o índice de Filmes e Séries logo depois que a Home abre (a pesquisa já abre pronta)
  // true = como antes: nas primeiras aberturas o controle pode ficar preso por alguns segundos enquanto a TV carrega e guarda tudo;
  // depois disso Filmes e Séries abrem quase na hora, do que ficou guardado. false = trabalho espalhado, esperando o controle parar (mais lento).
  PREPARO_RAPIDO: true,
  PREPARO_CATALOGO: true,    // deixa as primeiras categorias de Filmes e Séries já baixadas
  PREPARO_CANAIS: true,      // deixa categorias e canais de TV ao vivo prontos
  // Quantas categorias de TV ao vivo são baixadas sozinhas em segundo plano (as outras carregam quando você abre). 0 = todas (como era antes).
  LIVE_SYNC_MAX_CATEGORIAS: 8,
  // Quanto tempo (ms) o controle precisa ficar parado para o trabalho PESADO em segundo plano (índice da pesquisa) andar.
  OCIOSO_MS: 5000,
  // Folga (ms) sem tecla para os passos leves (listas de categorias) andarem mesmo com o controle em uso.
  OCIOSO_LEVE_MS: 2500,
  // Logo que o app abre, nada roda em segundo plano por este tempo (ms): a TV está ocupada abrindo o app e o controle fica livre.
  GRACA_INICIAL_MS: 1500,
  // Durante filme, série ou canal em tela cheia o carregamento em segundo plano continua, só bem mais devagar (1 passo a cada ~4 s).
  // Se notar travadinha na imagem nessa hora, troque por false: aí ele espera o vídeo terminar.
  SEGUNDO_PLANO_DURANTE_VIDEO: false,

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

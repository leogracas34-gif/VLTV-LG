// VLTV Play | Idioma: português do Brasil (padrão) e inglês.
// Como funciona: o aplicativo continua escrito em português por dentro. Quando o idioma é inglês, este arquivo
// traduz na tela cada texto do aplicativo (os que já estão na página e os que aparecem depois).
// Categorias e gêneros (vindos do provedor) são traduzidos pelas palavras conhecidas; títulos, sinopses, logos e nomes de
// episódios em inglês vêm do TMDB (tmdb.js). Nomes de canais ficam como são (são marcas).
// Escolha do idioma: Configurações > Idioma. A escolha fica guardada na TV.
window.VLTV = window.VLTV || {};

(function () {
  'use strict';

  var CHAVE = 'vltv_idioma';
  var LISTA = [
    { codigo: 'pt-BR', nome: 'Português (Brasil)', curto: 'PT' },
    { codigo: 'en', nome: 'English', curto: 'EN' }
  ];

  function ler() {
    try {
      var v = window.localStorage.getItem(CHAVE);
      if (v === 'en' || v === 'pt-BR') { return v; }
    } catch (e) { /* TV sem armazenamento: fica no padrão */ }
    return 'pt-BR';
  }

  var atual = ler();
  var INGLES = atual === 'en';

  // ── Bandeiras (desenhadas aqui, sem arquivo de imagem) ────────────
  var BANDEIRAS = {
    'pt-BR':
      '<rect width="28" height="20" fill="#009c3b"/>' +
      '<path d="M14 2.2L25.4 10 14 17.8 2.6 10z" fill="#ffdf00"/>' +
      '<circle cx="14" cy="10" r="4.3" fill="#002776"/>' +
      '<path d="M9.8 9.1c2.9-.8 5.7-.3 8.4 1.2" stroke="#fff" stroke-width="1" fill="none"/>',
    'en': (function () {
      var s = '<rect width="28" height="20" fill="#fff"/>';
      var i;
      for (i = 0; i < 13; i += 2) { s += '<rect y="' + (i * 20 / 13).toFixed(3) + '" width="28" height="' + (20 / 13).toFixed(3) + '" fill="#b22234"/>'; }
      s += '<rect width="12" height="10.77" fill="#3c3b6e"/>';
      var r, c;
      for (r = 0; r < 4; r++) {
        for (c = 0; c < 5; c++) { s += '<circle cx="' + (1.5 + c * 2.25) + '" cy="' + (1.6 + r * 2.3) + '" r=".55" fill="#fff"/>'; }
      }
      return s;
    })()
  };

  // Devolve um <svg> pronto da bandeira do idioma (para a tela de Configurações).
  function bandeira(codigo) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 28 20');
    svg.setAttribute('width', '64');
    svg.setAttribute('height', '46');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'vertical-align:middle;margin-right:24px;border-radius:5px;box-shadow:0 0 0 2px rgba(255,255,255,0.25);flex:none');
    svg.innerHTML = BANDEIRAS[codigo] || '';
    return svg;
  }

  // ── Texto inteiro (chave = texto em português, sem espaços nas pontas) ──
  var EXATO = Object.create(null);
  function dic(obj) { for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) { EXATO[k] = obj[k]; } } }

  dic({
    // ── Telas fixas (index.html) ──
    'Iniciando...': 'Starting...',
    'Aparelho não compatível': 'Device not supported',
    'Ative o seu VLTV Play': 'Activate your VLTV Play',
    'Código desta TV': 'This TV’s code',
    'Já ativei — verificar': 'I’ve activated it — check',
    'Usar outra lista': 'Use another list',
    'Usuário': 'User',
    'Lista M3U': 'M3U list',
    'Servidor ou código de parceiro': 'Server or partner code',
    'http://servidor.com:8080  ou  código': 'http://server.com:8080  or  code',
    'Senha': 'Password',
    'Mostrar senha': 'Show password',
    'Ocultar senha': 'Hide password',
    'Endereço da lista M3U': 'M3U list address',
    'http://servidor.com/lista.m3u': 'http://server.com/list.m3u',
    'Entrar': 'Sign in',
    'Configurações': 'Settings',
    'Destaque': 'Featured',
    'ASSISTIR': 'WATCH',
    'TV ao vivo': 'Live TV',
    'Canais e programação': 'Channels and guide',
    'Filmes': 'Movies',
    'Catálogo de filmes': 'Movie catalog',
    'Séries': 'Series',
    'Temporadas e episódios': 'Seasons and episodes',
    'Listas': 'Lists',
    'Sair': 'Sign out',
    'Deseja sair?': 'Do you want to sign out?',
    'A lista que está em uso será removida desta TV.': 'The list in use will be removed from this TV.',
    'Cancelar': 'Cancel',
    'Minhas listas': 'My lists',
    'Categorias': 'Categories',
    'Canais': 'Channels',
    'Digite o nome e aperte OK para abrir o teclado': 'Type the name and press OK to open the keyboard',
    'Temporada': 'Season',
    'REINICIAR': 'RESTART',
    'MINHA LISTA': 'MY LIST',
    'Esqueci a senha': 'Forgot password',
    'Sua resposta': 'Your answer',
    'Salvar': 'Save',
    'Próximo episódio': 'Next episode',
    'Aperte OK para assistir agora': 'Press OK to watch now',

    // ── Configurações ──
    'Informação geral': 'General information',
    'Idioma': 'Language',
    'Controle parental': 'Parental controls',
    'Limpar cache': 'Clear cache',
    'Atualizar o aplicativo': 'Update the app',
    'Sobre o aplicativo': 'About the app',
    'Canais, filmes e séries': 'Channels, movies and series',
    'Ativo': 'Active',
    'Expirado': 'Expired',
    'Plano de canais, filmes e séries vence em': 'Channels, movies and series plan expires on',
    'Sem vencimento': 'No expiration',
    'Parceiro': 'Partner',
    'Endereço MAC': 'MAC address',
    'Indisponível nesta TV': 'Not available on this TV',
    'Versão do produto': 'Product version',
    'Chave do dispositivo': 'Device key',
    'Aparelho': 'Device',
    'Código da TV (ativação)': 'TV code (activation)',
    'Licença do aplicativo': 'App license',
    'Carregando...': 'Loading...',
    'Bloqueia canais, filmes e séries adultos (+18) com uma senha de 4 dígitos. A senha padrão é 0000: crie a sua e escolha uma pergunta secreta para recuperar. Pressione OK para abrir (pede a senha).':
      'Blocks adult (+18) channels, movies and series with a 4-digit password. The default password is 0000: create your own and choose a secret question to recover it. Press OK to open (asks for the password).',
    'O que será apagado': 'What will be deleted',
    'Listas, banner e logos guardados': 'Saved lists, banner and logos',
    'O que continua salvo': 'What stays saved',
    'Login, favoritos e "continuar assistindo"': 'Login, favorites and "continue watching"',
    'Depois de limpar': 'After clearing',
    'O aplicativo reinicia sozinho': 'The app restarts by itself',
    'Use quando algo estiver desatualizado ou lento. Pressione OK para limpar.': 'Use this when something is out of date or slow. Press OK to clear.',
    'Versão instalada': 'Installed version',
    'Seu login e seus favoritos': 'Your login and your favorites',
    'Continuam salvos': 'Stay saved',
    'Reinicia o aplicativo e carrega tudo de novo (lista, categorias e licença). Novas versões do aplicativo chegam pela loja de aplicativos da TV. Pressione OK para atualizar.':
      'Restarts the app and loads everything again (list, categories and license). New versions of the app arrive through the TV’s app store. Press OK to update.',
    'Aplicativo': 'App',
    'Tipo': 'Type',
    'Reprodutor de mídia': 'Media player',
    'Versão': 'Version',
    'Código da TV': 'TV code',
    'Licença': 'License',
    'Suporte': 'Support',
    'O VLTV Play é um reprodutor de mídia. Ele não inclui nenhum canal, filme, série ou lista: o conteúdo vem do serviço que você contratou por conta própria, e o aplicativo apenas reproduz.':
      'VLTV Play is a media player. It does not include any channel, movie, series or list: the content comes from the service you subscribed to on your own, and the app only plays it.',
    'Bloqueio de conteúdo adulto': 'Adult content block',
    'Ativado': 'On',
    'Desativado': 'Off',
    'Conteúdo bloqueado': 'Blocked content',
    'Ocultar': 'Hide',
    'Pedir senha': 'Ask for password',
    'Padrão (0000) - alterar': 'Default (0000) - change',
    'Personalizada - alterar': 'Custom - change',
    'Pergunta secreta': 'Secret question',
    'Definida - alterar': 'Set - change',
    'Não definida - criar': 'Not set - create',
    'Você ainda usa a senha padrão (0000). Crie a sua para proteger de verdade.': 'You are still using the default password (0000). Create your own to really protect the content.',
    'Com o bloqueio ativado, categorias, canais e filmes adultos pedem a senha (ou ficam ocultos). Depois de digitada, a senha libera o conteúdo até voltar para a tela inicial.':
      'With the block on, adult categories, channels and movies ask for the password (or are hidden). Once typed, the password unlocks the content until you go back to the home screen.',
    'Digite a senha para abrir.': 'Enter the password to open.',
    'Limpando...': 'Clearing...',
    'Cache limpo. Reiniciando o aplicativo...': 'Cache cleared. Restarting the app...',
    'Atualizando...': 'Updating...',
    'Escolha o idioma do aplicativo. A mudança vale na hora: o aplicativo reinicia sozinho.': 'Choose the app language. The change applies right away: the app restarts by itself.',

    // ── Login, listas, licença (app.js, listas.js, licenca.js) ──
    'Não há na lista': 'Not in the list',
    'O teste desta lista terminou. Entre em contato com o fornecedor do serviço.': 'The trial of this list has ended. Contact your service provider.',
    'Esta lista venceu. Entre em contato com o fornecedor do serviço para renovar.': 'This list has expired. Contact your service provider to renew it.',
    'Seu teste expirou. Entre em contato com o suporte para assinar o VLTV Play.': 'Your trial has expired. Contact support to subscribe to VLTV Play.',
    'Sua assinatura expirou. Entre em contato com o suporte para renovar.': 'Your subscription has expired. Contact support to renew it.',
    'Usuário ou senha incorretos. Se a lista venceu, fale com o fornecedor do serviço.': 'Wrong user or password. If the list has expired, talk to your service provider.',
    'Código de parceiro inválido. Confira com o seu provedor.': 'Invalid partner code. Check with your provider.',
    'Este código de parceiro está suspenso. Fale com o seu provedor.': 'This partner code is suspended. Talk to your provider.',
    'Muitas tentativas. Aguarde um minuto e tente de novo.': 'Too many attempts. Wait a minute and try again.',
    'A lista é grande demais para esta TV. Use uma lista menor.': 'The list is too large for this TV. Use a smaller list.',
    'Nenhum canal, filme ou série encontrado nessa lista.': 'No channel, movie or series found in this list.',
    'Não foi possível baixar a lista. Confira o endereço e a internet da TV.': 'Could not download the list. Check the address and the TV’s internet.',
    'Não foi possível entrar. Verifique a internet da TV. Se continuar assim, a lista pode ter vencido: fale com o fornecedor do serviço.':
      'Could not sign in. Check the TV’s internet. If this continues, the list may have expired: talk to your service provider.',
    'O código de parceiro desta lista não está mais ativo. Para continuar, ative a licença desta TV.': 'The partner code of this list is no longer active. To continue, activate this TV’s license.',
    'Digite o endereço da lista.': 'Enter the list address.',
    'Digite o endereço do servidor ou o código de parceiro.': 'Enter the server address or the partner code.',
    'Digite o usuário e a senha.': 'Enter the user and the password.',
    'Baixando a lista... isso pode demorar.': 'Downloading the list... this may take a while.',
    'Conectando...': 'Connecting...',
    'Escolha uma lista para entrar.': 'Choose a list to sign in.',
    'Carregando a lista...': 'Loading the list...',
    'Entrando...': 'Signing in...',
    'Não foi possível carregar a lista. Tentando de novo...': 'Could not load the list. Trying again...',
    'Não foi possível conectar à lista. Tentando de novo...': 'Could not connect to the list. Trying again...',
    'Aperte OK para ver as suas listas.': 'Press OK to see your lists.',
    'Aparelho bloqueado': 'Device blocked',
    'Sem conexão com o servidor': 'No connection to the server',
    'Este aparelho foi bloqueado. Fale com o suporte informando o código abaixo.': 'This device has been blocked. Talk to support and give the code below.',
    'Conecte a TV à internet e aperte OK para tentar de novo.': 'Connect the TV to the internet and press OK to try again.',
    'Para continuar assistindo, ative a licença desta TV.': 'To keep watching, activate this TV’s license.',
    'No celular ou computador, acesse': 'On your phone or computer, go to',
    'e informe o código.': 'and enter the code.',
    'Tentar novamente': 'Try again',
    'Verificando licença...': 'Checking license...',
    'Todas': 'All',
    'Em uso': 'In use',
    'Confirmar?': 'Confirm?',
    'Remover': 'Remove',
    '+  Adicionar nova lista': '+  Add new list',
    'Esta lista está em uso. Aperte OK de novo para remover e sair dela.': 'This list is in use. Press OK again to remove it and sign out of it.',
    'Aperte OK de novo para remover esta lista.': 'Press OK again to remove this list.',
    'Lista removida.': 'List removed.',
    'Usuário e senha': 'User and password',
    'Vitalícia (sem vencimento)': 'Lifetime (no expiration)',
    'O plano de canais, filmes e séries venceu. Fale com o seu provedor.': 'The channels, movies and series plan has expired. Talk to your provider.',
    'Sem nome': 'No name',
    'Sem grupo': 'No group',

    // ── Home e banner ──
    'TOP 10 FILMES': 'TOP 10 MOVIES',
    'TOP 10 SÉRIES': 'TOP 10 SERIES',
    'FILME EM DESTAQUE': 'FEATURED MOVIE',
    'SÉRIE EM DESTAQUE': 'FEATURED SERIES',
    'Série': 'Series',
    'Filme': 'Movie',
    'ABRINDO...': 'OPENING...',
    'Este título não está disponível no seu servidor': 'This title is not available on your server',
    'LANÇAMENTO': 'NEW RELEASE',

    // ── Catálogo, TV ao vivo ──
    'Pesquisar': 'Search',
    'Favoritos': 'Favorites',
    'Continuar assistindo': 'Continue watching',
    'Nenhum título nesta categoria.': 'No titles in this category.',
    'Nenhum favorito ainda. Abra um título e escolha MINHA LISTA para ele aparecer aqui.': 'No favorites yet. Open a title and choose MY LIST for it to show up here.',
    'Nada para continuar assistindo.': 'Nothing to continue watching.',
    'Não foi possível carregar. Pressione OK para tentar de novo.': 'Could not load. Press OK to try again.',
    'Sem conexão com o catálogo. Alguns títulos podem não aparecer.': 'No connection to the catalog. Some titles may not show up.',
    'Pesquisar filmes': 'Search movies',
    'Pesquisar séries': 'Search series',
    'Carregando categorias...': 'Loading categories...',
    'Nenhum canal favorito ainda. Em qualquer canal, aperte → e depois OK na estrela (ou a tecla amarela).': 'No favorite channels yet. On any channel, press → and then OK on the star (or the yellow key).',
    'Nenhum canal nesta categoria.': 'No channels in this category.',
    'Não foi possível carregar os canais. Pressione OK para tentar de novo.': 'Could not load the channels. Press OK to try again.',
    'Carregando canais...': 'Loading channels...',
    'Agora': 'Now',
    'Sem informação de programação.': 'No program information.',
    'Nenhuma categoria encontrada.': 'No category found.',
    'Categoria +18': 'Category +18',

    // ── Detalhes, episódios ──
    'Restam menos de 1min': 'Less than 1 min left',
    'Sem sinopse disponível.': 'No synopsis available.',
    'CONTINUAR': 'CONTINUE',
    'EPISÓDIOS': 'EPISODES',
    'SUGESTÕES': 'SUGGESTIONS',
    'DETALHES': 'DETAILS',
    'Assistido': 'Watched',
    'Sem sugestões por enquanto.': 'No suggestions for now.',
    'Temporadas': 'Seasons',
    'Duração': 'Duration',
    'Data de lançamento': 'Release date',
    'Gênero': 'Genre',
    'Direção': 'Director',
    'Elenco': 'Cast',
    'Nenhum episódio disponível.': 'No episodes available.',
    'Não foi possível carregar os episódios. Pressione OK em "Temporada" para tentar de novo.': 'Could not load the episodes. Press OK on "Season" to try again.',
    'Episódios': 'Episodes',

    // ── Player ──
    'Desativada': 'Off',
    '▼  Áudio e legenda': '▼  Audio and subtitles',
    'Áudio e legenda': 'Audio and subtitles',
    'Este vídeo não tem outras faixas de áudio ou legenda (ou a TV não permite escolher).': 'This video has no other audio or subtitle tracks (or the TV does not allow choosing).',
    'Áudio': 'Audio',
    'Legenda': 'Subtitles',
    'Apenas o áudio padrão': 'Default audio only',
    'Sem legendas neste vídeo': 'No subtitles in this video',
    'Pausado': 'Paused',
    'Esta TV não conseguiu pular neste vídeo.': 'This TV could not skip in this video.',
    'Aguarde o vídeo carregar...': 'Wait for the video to load...',

    // ── Erros de reprodução (sem o número do erro) ──
    'Este conteúdo não foi encontrado no servidor (erro 404).': 'This content was not found on the server (error 404).',
    'A TV não conseguiu decodificar este vídeo ou o áudio dele (ex.: DTS).': 'The TV could not decode this video or its audio (e.g. DTS).',
    'O servidor demorou demais para responder. Tente de novo.': 'The server took too long to respond. Try again.',
    'Sem resposta do servidor. Confira a internet da TV.': 'No response from the server. Check the TV’s internet.',
    'Não foi possível reproduzir: formato não aceito pela TV ou conteúdo indisponível no servidor.': 'Could not play: format not supported by the TV or content unavailable on the server.',
    'Não foi possível reproduzir este vídeo.': 'Could not play this video.',

    // ── Senha (controle parental) ──
    'Qual o nome do seu primeiro animal de estimação?': 'What was the name of your first pet?',
    'Em que cidade você nasceu?': 'In which city were you born?',
    'Qual o nome da sua primeira escola?': 'What was the name of your first school?',
    'Qual o nome da sua melhor amiga ou do seu melhor amigo de infância?': 'What was the name of your best childhood friend?',
    'Qual o seu filme favorito?': 'What is your favorite movie?',
    'Conteúdo +18': 'Adult content +18',
    'Digite a senha para assistir.': 'Enter the password to watch.',
    'Apagar': 'Delete',
    'Confirmar': 'Confirm',
    'Conteúdo protegido': 'Protected content',
    'Digite a senha de 4 dígitos.': 'Enter the 4-digit password.',
    'Criar nova senha': 'Create new password',
    'Digite 4 números.': 'Enter 4 numbers.',
    'Recuperar senha': 'Recover password',
    'Responda a pergunta secreta.': 'Answer the secret question.',
    'Senha incorreta.': 'Wrong password.',
    'Escolha uma senha diferente de 0000.': 'Choose a password other than 0000.',
    'Confirmar senha': 'Confirm password',
    'Digite a mesma senha de novo.': 'Enter the same password again.',
    'Ajuda a recuperar a senha se você esquecer.': 'Helps you recover the password if you forget it.',
    'As senhas não conferem. Tente de novo.': 'The passwords do not match. Try again.',
    'Digite a resposta.': 'Enter the answer.',
    'Resposta incorreta.': 'Wrong answer.',

    // ── Diagnóstico de idioma (Informação geral) ──
    'Conectado': 'Connected',
    'Sem chave': 'No key',
    'Títulos e sinopses (TMDB)': 'Titles and synopses (TMDB)',

    // ── Plataforma ──
    'Navegador (modo de teste)': 'Browser (test mode)'
  });

  var DIAS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var DIAS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dataEn(dd, mm, aaaa) {
    var m = parseInt(mm, 10) - 1;
    if (m < 0 || m > 11) { return dd + '/' + mm + '/' + aaaa; }
    return MESES_EN[m] + ' ' + parseInt(dd, 10) + ', ' + aaaa;
  }
  function dias(n) { return n + (parseInt(n, 10) === 1 ? ' day' : ' days'); }
  function quando(q) {
    if (q === 'hoje') { return 'today'; }
    if (q === 'amanhã') { return 'tomorrow'; }
    var m = /^em (\d+) dias$/.exec(q);
    return m ? 'in ' + dias(m[1]) : q;
  }

  // ── Textos com números ou pedaços variáveis ──
  var REGRAS = [
    [/^(dom|seg|ter|qua|qui|sex|sáb), (\d{2})\/(\d{2})\/(\d{4})$/, function (m) { return DIAS_EN[DIAS_PT.indexOf(m[1])] + ', ' + dataEn(m[2], m[3], m[4]); }],
    [/^(\d{2})\/(\d{2})\/(\d{4})(?: \((\d+) (?:dia|dias)\))?$/, function (m) { return dataEn(m[1], m[2], m[3]) + (m[4] !== undefined ? ' (' + dias(m[4]) + ')' : ''); }],
    [/^Ativa até (\d{2})\/(\d{2})\/(\d{4})$/, function (m) { return 'Active until ' + dataEn(m[1], m[2], m[3]); }],
    [/^Teste grátis: (\d+) (?:dia|dias) \(até (\d{2})\/(\d{2})\/(\d{4})\)$/, function (m) { return 'Free trial: ' + dias(m[1]) + ' (until ' + dataEn(m[2], m[3], m[4]) + ')'; }],
    [/^Seu teste grátis do aplicativo termina (hoje|amanhã|em \d+ dias)$/, function (m) { return 'Your app free trial ends ' + quando(m[1]); }],
    [/^A licença do aplicativo vence (hoje|amanhã|em \d+ dias)$/, function (m) { return 'The app license expires ' + quando(m[1]); }],
    [/^O plano de canais, filmes e séries vence (hoje|amanhã|em \d+ dias)$/, function (m) { return 'The channels, movies and series plan expires ' + quando(m[1]); }],
    [/^Restam (.+)$/, function (m) { return m[1] + ' left'; }],
    [/^Episódio (\d+)$/, function (m) { return 'Episode ' + m[1]; }],
    [/^(\d+)\. Episódio (\d+)$/, function (m) { return m[1] + '. Episode ' + m[2]; }],
    [/^Temporada (\d+)$/, function (m) { return 'Season ' + m[1]; }],
    [/^(\d+) (temporada|temporadas)$/, function (m) { return m[1] + (m[1] === '1' ? ' season' : ' seasons'); }],
    [/^Ir para (.+)$/, function (m) { return 'Go to ' + m[1]; }],
    [/^Último episódio da temporada — a seguir: Temporada (\d+)$/, function (m) { return 'Last episode of the season — up next: Season ' + m[1]; }],
    [/^Faltam (\d+) episódios para a próxima temporada$/, function (m) { return m[1] + ' episodes left until the next season'; }],
    [/^Próximo episódio em (.+)$/, function (m) { return 'Next episode in ' + m[1]; }],
    [/^Reconectando\.\.\. \((\d+)\)$/, function (m) { return 'Reconnecting... (' + m[1] + ')'; }],
    [/^Agora( \(\d{1,2}:\d{2}(?: - \d{1,2}:\d{2})?\).*)$/, function (m) { return 'Now' + m[1]; }],
    [/^código de parceiro: (.*)$/, function (m) { return 'partner code: ' + m[1]; }],
    [/^Digite o nome de (um filme|uma série) para pesquisar\.$/, function (m) { return 'Type the name of a ' + (m[1] === 'um filme' ? 'movie' : 'series') + ' to search.'; }],
    [/^Nenhum (filme|série) encontrado( até agora)? para "([\s\S]*)"\.$/, function (m) { return 'No ' + (m[1] === 'filme' ? 'movies' : 'series') + ' found' + (m[2] ? ' so far' : '') + ' for "' + m[3] + '".'; }],
    [/^O servidor recusou o acesso \(erro (\d+)\)\. Confira se o plano está ativo\.$/, function (m) { return 'The server refused access (error ' + m[1] + '). Check that the plan is active.'; }],
    [/^O servidor está com problema \(erro (\d+)\)\. Tente de novo em instantes\.$/, function (m) { return 'The server has a problem (error ' + m[1] + '). Try again in a moment.'; }],
    [/^O servidor respondeu com erro (\d+)\.$/, function (m) { return 'The server responded with error ' + m[1] + '.'; }],
    [/^O VLTV Play funciona em TVs (LG|Samsung) de (\d+) em diante \((webOS|Tizen) ([\d.]+) ou mais novo\)\.(?: Detectado: (.*))?$/, function (m) {
      return 'VLTV Play works on ' + m[1] + ' TVs from ' + m[2] + ' onwards (' + m[3] + ' ' + m[4] + ' or newer).' + (m[5] !== undefined ? ' Detected: ' + m[5].replace(/^ano /, 'year ') : '');
    }],
    // Nomes de idioma das faixas de áudio/legenda ("Português (estéreo)", "Faixa 2"...)
    [/^(Português \(Brasil\)|Português|Inglês|Espanhol|Francês|Italiano|Alemão|Japonês|Coreano|Chinês|Russo|Desconhecido|Faixa \d+)( \(.*\))?$/, function (m) {
      var N = { 'Português (Brasil)': 'Portuguese (Brazil)', 'Português': 'Portuguese', 'Inglês': 'English', 'Espanhol': 'Spanish', 'Francês': 'French', 'Italiano': 'Italian',
        'Alemão': 'German', 'Japonês': 'Japanese', 'Coreano': 'Korean', 'Chinês': 'Chinese', 'Russo': 'Russian', 'Desconhecido': 'Unknown' };
      var base = N[m[1]] || m[1].replace(/^Faixa /, 'Track ');
      return base + (m[2] ? m[2].replace('estéreo', 'stereo') : '');
    }]
  ];

  var memoria = Object.create(null);
  var memoriaTamanho = 0;
  var PONTOS = /(\s+•\s+)/;            // "  •  " separa pedaços na mesma linha (banner, avisos, listas)

  function traduzirNucleo(s) {
    if (s in EXATO) { return EXATO[s]; }
    // Rótulos com dois-pontos ("Gênero:", "Elenco:")
    if (s.length > 2 && s.charAt(s.length - 1) === ':' && (s.slice(0, -1) in EXATO)) { return EXATO[s.slice(0, -1)] + ':'; }
    var i, m;
    for (i = 0; i < REGRAS.length; i++) {
      m = REGRAS[i][0].exec(s);
      if (m) { return REGRAS[i][1](m); }
    }
    return s;
  }

  function traduzirSemBordas(s) {
    // Texto de erro do player pode terminar com o rastro técnico: "... [m3u8: formato | ts: tempo]". O rastro fica como está.
    var rastro = /^([\s\S]*?\S)( \[[^\]]*\])$/.exec(s);
    if (rastro) { return traduzirNucleo(rastro[1]) + rastro[2]; }
    if (PONTOS.test(s)) {
      var partes = s.split(PONTOS);
      var out = '';
      for (var j = 0; j < partes.length; j++) { out += j % 2 === 1 ? partes[j] : traduzirNucleo(partes[j]); }
      return out;
    }
    return traduzirNucleo(s);
  }

  // Traduz uma frase. Em português devolve a própria frase.
  function t(texto) {
    if (!INGLES || typeof texto !== 'string' || texto.length === 0 || texto.length > 600) { return texto; }
    var guardada = memoria[texto];
    if (guardada !== undefined) { return guardada; }
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(texto);
    var miolo = m[2];
    var r = texto;
    if (miolo) {
      var tr = traduzirSemBordas(miolo);
      if (tr !== miolo) { r = m[1] + tr + m[3]; }
    }
    if (memoriaTamanho > 4000) { memoria = Object.create(null); memoriaTamanho = 0; }
    memoria[texto] = r;
    memoriaTamanho++;
    return r;
  }


  // ── Categorias e gêneros (vêm do servidor do provedor, em português) ──
  // Traduz só as palavras conhecidas; o que não estiver aqui fica como o provedor escreveu.
  var PALAVRAS = Object.create(null);
  (function () {
    var v = {
      'filmes': 'movies', 'filme': 'movie', 'series': 'series', 'serie': 'series', 'novelas': 'soap operas', 'novela': 'soap opera',
      'acao': 'action', 'aventura': 'adventure', 'aventuras': 'adventure', 'comedia': 'comedy', 'comedias': 'comedies', 'drama': 'drama', 'dramas': 'dramas',
      'terror': 'horror', 'suspense': 'thriller', 'ficcao': 'fiction', 'romance': 'romance', 'romantico': 'romance', 'animacao': 'animation',
      'animacoes': 'animation', 'animes': 'anime', 'anime': 'anime', 'infantil': 'kids', 'infantis': 'kids', 'desenho': 'cartoon', 'desenhos': 'cartoons',
      'documentario': 'documentary', 'documentarios': 'documentaries', 'familia': 'family', 'fantasia': 'fantasy', 'guerra': 'war', 'crime': 'crime',
      'policial': 'crime', 'musical': 'musical', 'misterio': 'mystery', 'faroeste': 'western', 'historia': 'history', 'historico': 'history',
      'biografia': 'biography', 'esporte': 'sport', 'esportes': 'sports', 'esportivos': 'sports', 'futebol': 'soccer', 'lutas': 'fights', 'luta': 'fight',
      'noticias': 'news', 'jornalismo': 'news', 'variedades': 'variety', 'entretenimento': 'entertainment', 'religiosos': 'religious',
      'religiosas': 'religious', 'religioso': 'religious', 'adultos': 'adult', 'adulto': 'adult', 'educativo': 'educational', 'educativos': 'educational',
      'cultura': 'culture', 'musica': 'music', 'musicas': 'music', 'radio': 'radio', 'radios': 'radios', 'cinema': 'cinema', 'classicos': 'classics',
      'classico': 'classic', 'premiados': 'award winners', 'lancamentos': 'new releases', 'lancamento': 'new release', 'nacionais': 'brazilian',
      'nacional': 'brazilian', 'internacionais': 'international', 'internacional': 'international', 'estrangeiros': 'foreign', 'dublado': 'dubbed',
      'dublados': 'dubbed', 'dubladas': 'dubbed', 'dublada': 'dubbed', 'legendadas': 'subtitled', 'legendada': 'subtitled', 'legendado': 'subtitled', 'legendados': 'subtitled', 'canais': 'channels', 'canal': 'channel', 'abertos': 'open',
      'fechados': 'pay', 'favoritos': 'favorites', 'todos': 'all', 'todas': 'all', 'outros': 'others', 'outras': 'others', 'geral': 'general',
      'populares': 'popular', 'destaques': 'highlights', 'destaque': 'highlight', 'automobilismo': 'motorsport', 'basquete': 'basketball',
      'tenis': 'tennis', 'volei': 'volleyball', 'culinaria': 'cooking', 'viagem': 'travel', 'natureza': 'nature', 'ciencia': 'science',
      'tecnologia': 'technology', 'negocios': 'business', 'humor': 'humor', 'terrir': 'horror comedy', 'e': 'and', 'ao': 'to', 'vivo': 'live',
      'temporada': 'season', 'temporadas': 'seasons', 'episodio': 'episode', 'episodios': 'episodes', 'pesquisar': 'search',
      'novos': 'new', 'novas': 'new', 'novo': 'new', 'nova': 'new', 'recentes': 'recent', 'melhores': 'best', 'mais': 'most', 'vistos': 'watched',
      'assistidos': 'watched', 'maratona': 'marathon', 'maratonas': 'marathons', 'pipoca': 'popcorn', 'cine': 'cinema', 'turcas': 'turkish',
      'turcos': 'turkish', 'coreanas': 'korean', 'coreano': 'korean', 'doramas': 'k-dramas', 'dorama': 'k-drama', 'indianas': 'indian',
      'asiaticas': 'asian', 'asiaticos': 'asian', 'mexicanas': 'mexican', 'brasileiros': 'brazilian', 'brasileiras': 'brazilian', 'brasileiro': 'brazilian',
      'brasil': 'brazil', 'portugal': 'portugal', 'portugueses': 'portuguese', 'ingles': 'english', 'espanhol': 'spanish', 'frances': 'french',
      'alemao': 'german', 'japones': 'japanese', 'concursos': 'game shows', 'sertanejo': 'country', 'sertanejas': 'country', 'pagode': 'pagode',
      'forro': 'forro', 'gospel': 'gospel', 'evangelicos': 'christian', 'evangelico': 'christian', 'catolicos': 'catholic', 'catolico': 'catholic',
      'cristao': 'christian', 'cristaos': 'christian', 'erotico': 'adult', 'eroticos': 'adult', 'shows': 'shows', 'show': 'show', 'eventos': 'events',
      'jogos': 'games', 'jogo': 'game', 'campeonatos': 'championships', 'campeonato': 'championship', 'copa': 'cup', 'brasileirao': 'brasileirao',
      'saude': 'health', 'moda': 'fashion', 'casa': 'home', 'decoracao': 'decor', 'arte': 'art', 'artes': 'arts', 'telejornal': 'news', 'jornais': 'news',
      'clima': 'weather', 'tempo': 'weather', 'sem': 'no', 'categoria': 'category', 'categorias': 'categories', 'abertas': 'open', 'aberta': 'open',
      'cabo': 'cable', 'fechada': 'pay', 'lives': 'live', 'televisao': 'television', 'programas': 'shows', 'programa': 'show', 'serial': 'serial',
      'seriados': 'series', 'seriado': 'series', 'miniserie': 'miniseries', 'minisseries': 'miniseries', 'miniseries': 'miniseries', 'curtas': 'shorts',
      'curta': 'short', 'metragem': 'length', 'longa': 'feature', 'antigos': 'classic', 'antigo': 'classic', 'antigas': 'classic', 'cult': 'cult',
      'indicados': 'nominees', 'oscar': 'oscar', 'plataformas': 'platforms', 'streaming': 'streaming', 'amor': 'love', 'amizade': 'friendship',
      'familiares': 'family', 'juvenil': 'teen', 'juvenis': 'teen', 'teen': 'teen', 'jovem': 'young', 'jovens': 'young', 'adolescentes': 'teen',
      'bebes': 'baby', 'educacao': 'education', 'aulas': 'classes', 'cursos': 'courses', 'idiomas': 'languages', 'religiao': 'religion',
      'espiritualidade': 'spirituality', 'politica': 'politics', 'economia': 'economy', 'financas': 'finance', 'mundo': 'world', 'planeta': 'planet',
      'animais': 'animals', 'animal': 'animal', 'carros': 'cars', 'motos': 'motorcycles', 'caminhoes': 'trucks', 'aviao': 'aviation', 'militar': 'military'
    };
    for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) { PALAVRAS[k] = v[k]; } }
  })();
  var FRASES = [
    ['ficcao cientifica', 'sci-fi'], ['ao vivo', 'live'], ['canais abertos', 'open channels'], ['canais fechados', 'pay channels'],
    ['artes marciais', 'martial arts'], ['reality show', 'reality shows'], ['stand up', 'stand-up'], ['stand-up', 'stand-up'],
    ['filmes e series', 'movies and series'], ['tv ao vivo', 'live tv']
  ];

  function semAcento(s) {
    var r = s.toLowerCase();
    try { r = r.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* TV sem normalize */ }
    return r;
  }
  function estilo(orig, en) {
    if (orig.length > 1 && orig === orig.toUpperCase() && orig !== orig.toLowerCase()) { return en.toUpperCase(); }
    if (orig.charAt(0) !== orig.charAt(0).toLowerCase()) {
      return en.replace(/(^|[\s-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    }
    return en;
  }

  var memCat = Object.create(null);
  function categoria(texto) {
    if (!INGLES || typeof texto !== 'string' || texto.length === 0 || texto.length > 200) { return texto; }
    var guardada = memCat[texto];
    if (guardada !== undefined) { return guardada; }
    var r = traduzirCategoria(texto);
    memCat[texto] = r;
    return r;
  }

  function traduzirCategoria(texto) {
    var exato = t(texto);               // textos fixos do app (Favoritos, Pesquisar...) já têm tradução própria
    if (exato !== texto) { return exato; }
    var n = semAcento(texto);
    // "Filmes de Ação" -> "Action Movies"
    var m = /^(\s*)(filmes|series|desenhos|documentarios|canais) (?:de|do|da|dos|das) (.+?)(\s*)$/.exec(n);
    if (m && n.length === texto.length) {
      var cab = texto.substr(m[1].length, m[2].length);
      var resto = texto.substr(texto.length - m[3].length - m[4].length, m[3].length);
      return m[1] + traduzirCategoria(resto) + ' ' + estilo(cab, PALAVRAS[m[2]]) + m[4];
    }
    var saida = '';
    var i = 0;
    var palavra = /[a-z0-9+]+/g;
    var partes = [];     // [inicio, fim] de cada palavra
    var x;
    while ((x = palavra.exec(n)) !== null) { partes.push([x.index, x.index + x[0].length]); }
    var usado = 0;
    var p = 0;
    while (p < partes.length) {
      var ini = partes[p][0];
      var fim = partes[p][1];
      saida += texto.slice(usado, ini);
      var trocou = false;
      // frases de duas ou três palavras
      for (var f = 0; f < FRASES.length && !trocou; f++) {
        var nf = FRASES[f][0];
        var cnt = nf.split(' ').length;
        if (p + cnt - 1 < partes.length && n.slice(ini, partes[p + cnt - 1][1]) === nf) {
          saida += estilo(texto.slice(ini, partes[p + cnt - 1][1]), FRASES[f][1]);
          fim = partes[p + cnt - 1][1];
          p += cnt - 1;
          trocou = true;
        }
      }
      if (!trocou) {
        var palavraN = n.slice(ini, fim);
        var en = PALAVRAS[palavraN];
        saida += en !== undefined ? estilo(texto.slice(ini, fim), en) : texto.slice(ini, fim);
      }
      usado = fim;
      p++;
    }
    saida += texto.slice(usado);
    return saida;
  }

  // ── Tradução da tela ──────────────────────────────────────────────
  var ATRIBUTOS = ['placeholder', 'aria-label', 'title'];

  function saltar(no) {
    var p = no.parentNode;
    if (!p) { return true; }
    var tag = p.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') { return true; }
    return !!(p.hasAttribute && p.hasAttribute('data-i18n-nao'));
  }

  function textoDoNo(no) {
    if (saltar(no)) { return; }
    var v = no.nodeValue;
    if (!v) { return; }
    var n = t(v);
    if (n !== v) { no.nodeValue = n; }
  }

  function atributosDe(el) {
    if (!el.getAttribute || (el.hasAttribute('data-i18n-nao'))) { return; }
    for (var i = 0; i < ATRIBUTOS.length; i++) {
      var v = el.getAttribute(ATRIBUTOS[i]);
      if (v) {
        var n = t(v);
        if (n !== v) { el.setAttribute(ATRIBUTOS[i], n); }
      }
    }
  }

  function arvore(raiz) {
    if (raiz.nodeType === 3) { textoDoNo(raiz); return; }
    if (raiz.nodeType !== 1) { return; }
    atributosDe(raiz);
    var tw = document.createTreeWalker(raiz, 1 | 4, null, false);   // elementos e textos
    var no = tw.nextNode();
    while (no) {
      if (no.nodeType === 3) { textoDoNo(no); } else { atributosDe(no); }
      no = tw.nextNode();
    }
  }

  var vigia = null;
  function ligar() {
    document.documentElement.setAttribute('lang', 'en');
    if (document.title) { document.title = t(document.title); }
    arvore(document.body);
    if (typeof MutationObserver === 'undefined') { return; }
    vigia = new MutationObserver(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        var r = lista[i];
        if (r.type === 'characterData') { textoDoNo(r.target); }
        else if (r.type === 'attributes') { atributosDe(r.target); }
        else {
          for (var j = 0; j < r.addedNodes.length; j++) { arvore(r.addedNodes[j]); }
        }
      }
      vigia.takeRecords();      // ignora as mudanças que o próprio tradutor acabou de fazer
    });
    vigia.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
    reforcar();
  }

  // Reforço: além do vigia, passa a tela inteira de novo algumas vezes depois de abrir e logo depois de cada
  // tecla (a tela muda quando se navega). Se alguma TV deixar o vigia perder um texto, o reforço pega.
  function reforcar() {
    var temporizador = null;
    function passar() { try { arvore(document.body); } catch (e) { /* ignora */ } }
    [300, 1200, 3000, 6000].forEach(function (ms) { setTimeout(passar, ms); });
    document.addEventListener('keyup', function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(passar, 350);
    }, true);
  }

  // ── Trocar o idioma ───────────────────────────────────────────────
  // Guarda a escolha, apaga o que foi guardado no idioma anterior (logos e fundos do TMDB, banner) e reinicia o app.
  function definir(codigo) {
    if (codigo !== 'en' && codigo !== 'pt-BR') { return; }
    if (codigo === atual) { return; }
    try {
      window.localStorage.setItem(CHAVE, codigo);
      var apagar = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && (k.indexOf('vltv_logo') === 0 || k.indexOf('vltv_fundo') === 0 || k.indexOf('vltv_banner_cache') === 0 || k.indexOf('vltv_txt1_') === 0)) { apagar.push(k); }
      }
      apagar.forEach(function (k) { window.localStorage.removeItem(k); });
    } catch (e) { /* ignora */ }
    window.location.reload();
  }

  VLTV.idioma = {
    codigo: function () { return atual; },
    ehIngles: function () { return INGLES; },
    lista: function () { return LISTA.slice(); },
    bandeira: bandeira,
    definir: definir,
    t: t,
    categoria: categoria,
    nomeAtual: function () { return INGLES ? 'English (en-US)' : 'Português (pt-BR)'; },
    // Idioma e região para as consultas ao TMDB (sinopses, logos, pesquisa).
    tmdb: function () { return INGLES ? { lingua: 'en-US', regiao: 'US', logos: 'en' } : { lingua: 'pt-BR', regiao: 'BR', logos: 'pt' }; }
  };

  if (INGLES) { ligar(); }
})();

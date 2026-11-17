(function () {
  'use strict';

  var LS_STATE = 'revolts_crowdsource_state';
  var LS_THEME = 'revolts_theme';

  function defaultState() {
    return {
      name: "Agente_" + Math.random().toString(36).substring(2, 6),
      xp: 140,
      completed: 4,
      streak: 2,
      stats: { handwriting: 1, translation: 1, vision: 1, sentiment: 1 },
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      uid: null,
      email: '',
      photo: null,
      board: []
    };
  }

  var state;
  try {
    var raw = localStorage.getItem(LS_STATE);
    state = raw ? (JSON.parse(raw) || defaultState()) : defaultState();
  } catch (e) {
    state = defaultState();
  }
  state.uid = state.uid || null;
  state.email = state.email || '';
  state.photo = state.photo || null;
  state.board = state.board || [];

  function saveState() {
    try { localStorage.setItem(LS_STATE, JSON.stringify(state)); } catch (e) {}
  }

  var missionsData = [
    { id: 'm1', type: 'handwriting', title: 'Reconhecimento de Escrita Manual',
      desc: 'Decifre palavras manuscritas em formulários antigos para treinar o OCR neural.',
      xp: 60, icon: 'draw', promptText: 'Analise o texto manuscrito borrado na imagem abaixo:', sample: '[amostra #4928: "Tecnologia_Sustentável"]' },
    { id: 'm2', type: 'translation', title: 'Tradução de Expressões Regionais',
      desc: 'Traduza gírias e expressões regionalizadas do Português (BR) para o Inglês técnico.',
      xp: 50, icon: 'translate', promptText: 'Traduza com precisão contextual a frase:', sample: '"O sistema caiu bem no meio do pico de acesso."' },
    { id: 'm3', type: 'vision', title: 'Reconhecimento de Imagem e Objetos',
      desc: 'Identifique sinalizações de trânsito e obstáculos urbanos em capturas de rua.',
      xp: 75, icon: 'image_search', promptText: 'Selecione a categoria correta para o objeto destacado:', sample: '[Objeto: Placa de Limite de Velocidade 60km/h]' },
    { id: 'm4', type: 'sentiment', title: 'Análise de Sentimento PT-BR',
      desc: 'Classifique avaliações de aplicativos entre Neutro, Positivo ou Crítico.',
      xp: 40, icon: 'psychology', promptText: 'Qual o sentimento predominante na avaliação?', sample: '"O app é rápido, mas trava ao abrir o perfil."' }
  ];

  var MOCK_AGENTS = [
    { name: 'V. Kessler', xp: 9420 },
    { name: 'Nyx_07', xp: 7310 },
    { name: 'GhostByte', xp: 5680 },
    { name: 'Aria-9', xp: 4120 },
    { name: 'K4IRO', xp: 2870 }
  ];

  var MOCK_FORUM_POSTS = [
    { id: 'demo1', title: 'Como vocês lidam com o OCR de escritas muito cursivas?',
      body: 'Estou validando um lote e notei que o modelo erra bastante em letras "e" e "l" juntas. Alguma dica de contexto para melhorar a rotulagem?',
      category: 'duvidas', authorName: 'Nyx_07', authorPhoto: null, replyCount: 3,
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    { id: 'demo2', title: 'Dica: sempre confira o contexto da frase antes de traduzir',
      body: 'Traduzir gíria por gíria literalmente costuma dar ruim. Leia o parágrafo inteiro, adapte o sentido e só depois escreva a versão em inglês técnico.',
      category: 'dicas', authorName: 'GhostByte', authorPhoto: null, replyCount: 5,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() },
    { id: 'demo3', title: 'Projeto pessoal: dashboard de métricas para o Revolts',
      body: 'Estou montando um dashboard que lê os dados do meu agente e mostra gráficos de evolução. Quem quiser colaborar, chama aqui no tópico.',
      category: 'projetos', authorName: 'Aria-9', authorPhoto: null, replyCount: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() }
  ];

  var forumPosts = MOCK_FORUM_POSTS.slice();
  var forumRepliesByPost = {};
  var currentPostId = null;
  var currentCategory = 'all';
  var isFirebaseReady = false;
  var pendingAction = null;
  var missionSubmitting = false;

  function $(id) { return document.getElementById(id); }

  function initials(name) {
    if (!name) return 'A';
    var p = String(name).trim().split(/\s+/).slice(0, 2);
    return p.map(function (s) { return s.charAt(0).toUpperCase(); }).join('') || 'A';
  }
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
      .replace(/"/g, '"').replace(/'/g, ''');
  }
  function timeAgo(iso) {
    if (!iso) return 'agora';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'agora';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'agora';
    var m = Math.floor(s / 60);
    if (m < 60) return 'há ' + m + 'min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'há ' + h + 'h';
    var day = Math.floor(h / 24);
    if (day < 30) return 'há ' + day + 'd';
    var mo = Math.floor(day / 30);
    if (mo < 12) return 'há ' + mo + (mo > 1 ? ' meses' : ' mês');
    return 'há ' + Math.floor(mo / 12) + ' ano(s)';
  }

  var toastTimer = null;
  function showToast(msg, icon) {
    var t = $('toast');
    if (!t) return;
    $('toastMsg').textContent = msg;
    var ic = t.querySelector('.material-symbols-rounded');
    if (ic) ic.textContent = icon || 'verified';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function renderDashboard() {
    var level = Math.floor(state.xp / 150) + 1;
    var xpInLevel = state.xp % 150;
    var circ = 2 * Math.PI * 42;
    if ($('userLevel')) $('userLevel').textContent = level;
    if ($('userXp')) $('userXp').textContent = state.xp;
    if ($('userName')) $('userName').textContent = state.name;
    if ($('chipCompleted')) $('chipCompleted').textContent = state.completed + ' Validações';
    if ($('chipStreak')) $('chipStreak').textContent = 'Streak ' + state.streak + 'x';
    if ($('ringProgress')) $('ringProgress').style.strokeDashoffset = (circ * (1 - xpInLevel / 150)).toFixed(2);
    if ($('xpBarFill')) $('xpBarFill').style.width = Math.round((xpInLevel / 150) * 100) + '%';
    if ($('statHandwriting')) $('statHandwriting').textContent = state.stats.handwriting;
    if ($('statTranslation')) $('statTranslation').textContent = state.stats.translation;
    if ($('statVision')) $('statVision').textContent = state.stats.vision;
    if ($('statSentiment')) $('statSentiment').textContent = state.stats.sentiment;
  }

  function renderMissionsGrids() {
    var html = missionsData.map(function (m) {
      return '' +
        '<div class="card mission-card">' +
          '<div class="mission-top">' +
            '<div class="mission-icon"><span class="material-symbols-rounded">' + m.icon + '</span></div>' +
            '<span class="xp-badge">+' + m.xp + ' XP</span>' +
          '</div>' +
          '<h3>' + m.title + '</h3>' +
          '<p class="muted">' + m.desc + '</p>' +
          '<div class="mission-foot">' +
            '<span class="chip chip-outline">Crowdsource AI</span>' +
            '<button class="btn btn-filled" data-mission="' + m.id + '">Executar Missão</button>' +
          '</div>' +
        '</div>';
    }).join('');
    if ($('homeMissionsGrid')) $('homeMissionsGrid').innerHTML = html;
    if ($('fullMissionsGrid')) $('fullMissionsGrid').innerHTML = html;
  }

  function buildLeaderboard() {
    var list;
    if (state.board && state.board.length) {
      list = state.board.map(function (a) {
        return {
          name: a.displayName || 'Agente',
          xp: Number(a.xp) || 0,
          photo: a.photoURL || null,
          uid: a.uid || null,
          self: !!(state.uid && a.uid === state.uid),
          level: Math.floor((Number(a.xp) || 0) / 150) + 1
        };
      });
    } else {
      list = MOCK_AGENTS.map(function (a) {
        return { name: a.name, xp: a.xp, level: Math.floor(a.xp / 150) + 1, photo: null, uid: null, self: false };
      });
    }
    var me = {
      name: state.name, xp: state.xp, level: Math.floor(state.xp / 150) + 1,
      photo: state.photo, uid: state.uid, self: true
    };
    var hasMe = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].self || (state.uid && list[i].uid === state.uid)) {
        list[i] = me; hasMe = true; break;
      }
    }
    if (!hasMe) list.push(me);
    list.sort(function (a, b) { return b.xp - a.xp; });
    return list;
  }

  function renderRanking() {
    var c = $('rankContainer');
    if (!c) return;
    var list = buildLeaderboard();
    c.innerHTML = list.map(function (r, i) {
      var av = r.photo
        ? '<div class="rank-avatar" style="background-image:url(' + escapeHtml(r.photo) + ')"></div>'
        : '<div class="rank-avatar">' + initials(r.name) + '</div>';
      return '' +
        '<div class="rank-row ' + (r.self ? 'self' : '') + '">' +
          '<div class="rank-pos">#' + (i + 1) + '</div>' +
          av +
          '<div class="rank-info">' +
            '<span class="rank-name">' + escapeHtml(r.name) + (r.self ? ' (Você)' : '') + '</span>' +
            '<span class="rank-meta">Nível ' + r.level + ' • validador neural</span>' +
          '</div>' +
          '<div class="rank-xp">' + r.xp + ' XP</div>' +
        '</div>';
    }).join('');
  }

  function renderAuthUI() {
    var logged = !!state.uid;
    if ($('authGuest')) $('authGuest').hidden = logged;
    if ($('authUser')) $('authUser').hidden = !logged;

    var btn = $('authBtn');
    if (btn) {
      btn.classList.remove('user-photo');
      btn.style.backgroundImage = '';
      if (logged && state.photo) {
        btn.classList.add('user-photo');
        btn.style.backgroundImage = 'url("' + state.photo + '")';
        if ($('authBtnIcon')) $('authBtnIcon').textContent = '';
      } else {
        if ($('authBtnIcon')) $('authBtnIcon').textContent = logged ? 'person' : 'login';
      }
    }

    if (logged) {
      if ($('authUserName')) $('authUserName').textContent = state.name || 'Agente';
      if ($('authUserEmail')) $('authUserEmail').textContent = state.email || '—';
      if ($('profileLevel')) $('profileLevel').textContent = Math.floor(state.xp / 150) + 1;
      if ($('profileXp')) $('profileXp').textContent = state.xp;
      if ($('profileMissions')) $('profileMissions').textContent = state.completed;

      var av = $('authUserAvatar');
      if (av) {
        if (state.photo) { av.style.backgroundImage = 'url("' + state.photo + '")'; av.textContent = ''; }
        else { av.style.backgroundImage = ''; av.textContent = initials(state.name); }
      }
    }
  }

  function renderForumBanner() {
    var b = $('forumBanner');
    if (!b) return;
    if (isFirebaseReady) { b.innerHTML = ''; return; }
    b.innerHTML =
      '<div class="forum-banner">' +
        '<span class="material-symbols-rounded">info</span>' +
        '<span>Conectando ao fórum… Os tópicos exibidos abaixo são exemplos enquanto a nuvem não responde.</span>' +
      '</div>';
  }

  function filteredPosts() {
    if (currentCategory === 'all') return forumPosts;
    return forumPosts.filter(function (p) { return p.category === currentCategory; });
  }

  function renderForumList() {
    var wrap = $('forumList');
    if (!wrap) return;
    var list = filteredPosts();
    if (!list.length) {
      wrap.innerHTML = '' +
        '<div class="forum-empty">' +
          '<span class="material-symbols-rounded">forum</span>' +
          '<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:var(--on-surface)">Ainda não há tópicos aqui</p>' +
          '<p style="margin:0;font-size:13px">Seja o primeiro a iniciar uma conversa na categoria.</p>' +
        '</div>';
      return;
    }
    wrap.innerHTML = list.map(function (p) {
      var catLabel = ({ geral: 'Geral', duvidas: 'Dúvidas', dicas: 'Dicas', projetos: 'Projetos' })[p.category] || 'Geral';
      var av = p.authorPhoto
        ? '<div class="forum-author-av" style="background-image:url(' + escapeHtml(p.authorPhoto) + ')"></div>'
        : '<div class="forum-author-av">' + initials(p.authorName) + '</div>';
      return '' +
        '<article class="card forum-card" data-post="' + escapeHtml(p.id) + '">' +
          '<div class="forum-card-top">' +
            '<span class="forum-cat cat-' + p.category + '">' + catLabel + '</span>' +
            '<span class="muted" style="font-size:12px">' + timeAgo(p.createdAt) + '</span>' +
          '</div>' +
          '<h3>' + escapeHtml(p.title) + '</h3>' +
          '<p>' + escapeHtml(p.body) + '</p>' +
          '<div class="forum-card-foot">' +
            '<div class="forum-author">' + av + '<span>' + escapeHtml(p.authorName || 'Agente') + '</span></div>' +
            '<span class="forum-replies"><span class="material-symbols-rounded">chat_bubble</span>' +
              (p.replyCount || 0) + ' ' + ((p.replyCount === 1) ? 'resposta' : 'respostas') +
            '</span>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  function renderPostDetail(postId) {
    var content = $('postDetailContent');
    if (!content) return;
    var post = null;
    for (var i = 0; i < forumPosts.length; i++) {
      if (forumPosts[i].id === postId) { post = forumPosts[i]; break; }
    }
    if (!post) {
      content.innerHTML = '<p class="muted">Tópico não encontrado.</p>';
      return;
    }
    var replies = forumRepliesByPost[postId] || [];
    var catLabel = ({ geral: 'Geral', duvidas: 'Dúvidas', dicas: 'Dicas', projetos: 'Projetos' })[post.category] || 'Geral';

    var repliesHtml = '';
    if (!replies.length) {
      repliesHtml = '<p class="muted" style="font-size:13px;text-align:center;padding:14px">Nenhuma resposta ainda. Seja o primeiro.</p>';
    } else {
      repliesHtml = '<div class="reply-list">' + replies.map(function (r) {
        var av = r.authorPhoto
          ? '<div class="forum-author-av" style="background-image:url(' + escapeHtml(r.authorPhoto) + ')"></div>'
          : '<div class="forum-author-av">' + initials(r.authorName) + '</div>';
        return '' +
          '<div class="reply-item">' +
            '<div class="reply-head">' + av +
              '<b>' + escapeHtml(r.authorName || 'Agente') + '</b>' +
              '<span>· ' + timeAgo(r.createdAt) + '</span>' +
            '</div>' +
            '<div class="reply-body">' + escapeHtml(r.body) + '</div>' +
          '</div>';
      }).join('') + '</div>';
    }

    var replyForm = '';
    if (state.uid) {
      replyForm = '' +
        '<div class="reply-form">' +
          '<textarea id="replyBody" maxlength="1000" placeholder="Escreva sua resposta..."></textarea>' +
          '<button class="btn btn-filled" id="replySubmit" type="button">' +
            '<span class="material-symbols-rounded">send</span> Responder' +
          '</button>' +
        '</div>';
    } else {
      replyForm = '<p class="muted" style="font-size:13px;text-align:center;margin-top:18px">' +
        'Entre na sua conta para responder.</p>';
    }

    content.innerHTML = '' +
      '<div class="post-detail-head">' +
        '<span class="forum-cat cat-' + post.category + '">' + catLabel + '</span>' +
        '<h2 id="detailTitle">' + escapeHtml(post.title) + '</h2>' +
        '<div class="muted" style="font-size:12.5px">' +
          'Por <b>' + escapeHtml(post.authorName || 'Agente') + '</b> · ' + timeAgo(post.createdAt) +
        '</div>' +
      '</div>' +
      '<div class="post-detail-body">' + escapeHtml(post.body) + '</div>' +
      '<div class="replies-title">Respostas <span>' + replies.length + '</span></div>' +
      repliesHtml +
      replyForm;
  }

  function completeMission(id) {
    var m = null;
    for (var i = 0; i < missionsData.length; i++) {
      if (missionsData[i].id === id) { m = missionsData[i]; break; }
    }
    if (!m) return;

    state.xp += m.xp;
    state.completed += 1;
    state.streak += 1;
    if (m.type === 'handwriting') state.stats.handwriting++;
    if (m.type === 'translation') state.stats.translation++;
    if (m.type === 'vision') state.stats.vision++;
    if (m.type === 'sentiment') state.stats.sentiment++;

    saveState();
    renderDashboard();
    renderRanking();
    renderAuthUI();

    if (window.Revolts && window.Revolts.hooks && typeof window.Revolts.hooks.onProgressChanged === 'function') {
      try { window.Revolts.hooks.onProgressChanged(window.Revolts.getState()); } catch (e) {}
    }

    showToast('Missão validada! +' + m.xp + ' XP', 'verified');
  }

  function goTo(view) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
    document.querySelectorAll('.rail-item[data-view]').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(LS_THEME, t); } catch (e) {}
    state.theme = t; saveState();
    if ($('themeIcon')) $('themeIcon').textContent = t === 'dark' ? 'light_mode' : 'dark_mode';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#1C1B1F' : '#FFFBFE');
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function openOverlay(id) { var el = $(id); if (el) el.classList.add('open'); }
  function closeOverlay(id) { var el = $(id); if (el) el.classList.remove('open'); }

  function openMissionModal(id) {
    missionSubmitting = false;
    var m = null;
    for (var i = 0; i < missionsData.length; i++) {
      if (missionsData[i].id === id) { m = missionsData[i]; break; }
    }
    if (!m) return;
    if ($('modalIcon')) $('modalIcon').textContent = m.icon;
    if ($('modalTitle')) $('modalTitle').textContent = m.title;
    if ($('modalDesc')) $('modalDesc').textContent = m.desc;

    var html = '' +
      '<div class="crowdsource-box">' +
        '<h4><span class="material-symbols-rounded">terminal</span> Validação Humana Obrigatória</h4>' +
        '<div class="crowdsource-preview">' + escapeHtml(m.promptText) + '<br><br><b>' + escapeHtml(m.sample) + '</b></div>';

    if (m.type === 'handwriting' || m.type === 'translation') {
      html += '' +
        '<input type="text" id="apiInputVal" class="crowdsource-input" placeholder="Digite a resposta exata..." autocomplete="off" />' +
        '<button class="btn btn-filled full" style="margin-top:8px;" data-submit="' + m.id + '">Submeter Resposta à API</button>';
    } else {
      var opts = m.type === 'vision'
        ? ['Placa de Trânsito', 'Semáforo', 'Faixa de Pedestre', 'Outro']
        : ['Positivo', 'Neutro', 'Crítico'];
      html += '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">';
      opts.forEach(function (o) {
        html += '<button class="btn btn-tonal" style="flex:1; min-width:120px;" data-submit="' + m.id + '" data-choice="' + o + '">' + o + '</button>';
      });
      html += '</div>';
    }
    html += '</div>';
    if ($('modalBody')) $('modalBody').innerHTML = html;
    openOverlay('missionOverlay');
  }

  function validateAndSubmit(id, choice) {
    if (missionSubmitting) return;
    missionSubmitting = true;
    try {
      var m = null;
      for (var i = 0; i < missionsData.length; i++) {
        if (missionsData[i].id === id) { m = missionsData[i]; break; }
      }
      if (!m) { missionSubmitting = false; return; }

      var inputEl = $('apiInputVal');
      var userText = choice || (inputEl ? inputEl.value.trim() : '');
      if (!userText) {
        showToast('Preencha o campo antes de enviar.', 'warning');
        missionSubmitting = false;
        return;
      }

      closeOverlay('missionOverlay');
      completeMission(id);
    } catch (e) {
      console.error(e);
      showToast('Erro ao validar.', 'error');
    } finally {
      setTimeout(function () { missionSubmitting = false; }, 300);
    }
  }

  function openAuth(pendingMessage) {
    if ($('authPendingMsg')) {
      if (pendingMessage) {
        $('authPendingMsg').textContent = pendingMessage;
        $('authPendingMsg').hidden = false;
      } else {
        $('authPendingMsg').hidden = true;
      }
    }
    openOverlay('authOverlay');
  }

  function openNewPost() {
    if (!state.uid) {
      pendingAction = 'new-post';
      openAuth('Faça login para criar um tópico no fórum.');
      return;
    }
    if (!isFirebaseReady) {
      showToast('Conectando ao Firebase, aguarde…', 'info');
      return;
    }
    if ($('postTitle')) $('postTitle').value = '';
    if ($('postBody')) $('postBody').value = '';
    if ($('postCategory')) $('postCategory').value = 'geral';
    if ($('newPostError')) $('newPostError').textContent = '';
    openOverlay('newPostOverlay');
  }

  function submitNewPost() {
    var title = (($('postTitle') || {}).value || '').trim();
    var body = (($('postBody') || {}).value || '').trim();
    var category = ($('postCategory') || {}).value || 'geral';
    var errEl = $('newPostError');
    if (errEl) errEl.textContent = '';

    if (title.length < 4) { if (errEl) errEl.textContent = 'Título muito curto (mín. 4 caracteres).'; return; }
    if (body.length < 10) { if (errEl) errEl.textContent = 'Mensagem muito curta (mín. 10 caracteres).'; return; }

    if (!window.Revolts.hooks.createPost) {
      if (errEl) errEl.textContent = 'Firebase não configurado.';
      return;
    }

    var btn = $('postSubmit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-rounded">hourglass</span> Publicando...'; }

    Promise.resolve(window.Revolts.hooks.createPost({ title: title, body: body, category: category }))
      .then(function () {
        closeOverlay('newPostOverlay');
        showToast('Tópico publicado com sucesso!', 'verified');
      })
      .catch(function (err) {
        console.error('[Revolts] Falha ao publicar tópico:', err);
        if (errEl) errEl.textContent = 'Não foi possível publicar. Tente novamente.';
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded">send</span> Publicar Tópico'; }
      });
  }

  function openPostDetail(postId) {
    currentPostId = postId;
    renderPostDetail(postId);
    openOverlay('postDetailOverlay');
    if (window.Revolts.hooks.openPost) {
      Promise.resolve(window.Revolts.hooks.openPost(postId)).catch(function (err) {
        console.warn('Erro ao abrir post:', err);
      });
    }
  }
  function closePostDetail() {
    closeOverlay('postDetailOverlay');
    currentPostId = null;
    if (window.Revolts.hooks.closePost) {
      try { window.Revolts.hooks.closePost(); } catch (e) {}
    }
  }

  function submitReply() {
    if (!currentPostId) return;
    var body = (($('replyBody') || {}).value || '').trim();
    if (body.length < 2) { showToast('Escreva algo antes de responder.', 'warning'); return; }
    if (!window.Revolts.hooks.createReply) { showToast('Firebase não configurado.', 'error'); return; }

    var btn = $('replySubmit');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Enviando...'; }

    Promise.resolve(window.Revolts.hooks.createReply({ postId: currentPostId, body: body }))
      .then(function () {
        if ($('replyBody')) $('replyBody').value = '';
        showToast('Resposta enviada!', 'verified');
      })
      .catch(function (err) {
        console.error('[Revolts] Falha ao responder:', err);
        showToast('Não foi possível responder.', 'error');
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded">send</span> Responder'; }
      });
  }

  window.Revolts = {
    getState: function () {
      return {
        xp: state.xp,
        level: Math.floor(state.xp / 150) + 1,
        completed: state.completed,
        streak: state.streak,
        stats: Object.assign({}, state.stats)
      };
    },
    applyRemote: function (d) {
      if (!d) return;
      if (typeof d.xp === 'number' && isFinite(d.xp)) state.xp = Math.max(0, Math.floor(d.xp));
      if (typeof d.completed === 'number') state.completed = d.completed;
      if (typeof d.streak === 'number') state.streak = d.streak;
      if (d.stats && typeof d.stats === 'object') state.stats = d.stats;
      if (d.displayName) state.name = d.displayName;
      if (d.photoURL) state.photo = d.photoURL;
      saveState();
      renderDashboard();
      renderRanking();
      renderAuthUI();
    },
    applyLeaderboard: function (list) {
      state.board = Array.isArray(list) ? list : [];
      saveState();
      renderRanking();
    },
    applyAuthUser: function (u) {
      if (u) {
        state.uid = u.uid || null;
        state.name = u.name || state.name || 'Agente';
        state.photo = u.photo || null;
        state.email = u.email || '';
      } else {
        state.uid = null; state.photo = null; state.email = '';
      }
      saveState();
      renderAuthUI();
      renderRanking();
      renderForumList();
      if (currentPostId) renderPostDetail(currentPostId);
    },
    applyForumPosts: function (posts) {
      forumPosts = Array.isArray(posts) ? posts : [];
      renderForumList();
    },
    applyForumReplies: function (postId, replies) {
      forumRepliesByPost[postId] = Array.isArray(replies) ? replies : [];
      if (currentPostId === postId) renderPostDetail(postId);
    },
    setSyncStatus: function (kind, label) {
      if ($('railSyncDot')) $('railSyncDot').className = 'sync-dot ' + kind;
      if ($('railSyncText')) $('railSyncText').textContent = (label || 'LOCAL').toUpperCase().slice(0, 12);
      if ($('syncLabel')) $('syncLabel').textContent = label || 'Modo Local';
      if ($('syncIcon')) {
        $('syncIcon').textContent =
          kind === 'online' ? 'cloud_done' :
          kind === 'connecting' ? 'cloud_sync' : 'cloud_off';
      }
    },
    setFirebaseReady: function (ready) {
      isFirebaseReady = !!ready;
      renderForumBanner();
    },
    hooks: {
      onProgressChanged: null,
      createPost: null,
      createReply: null,
      openPost: null,
      closePost: null
    },
    isLoggedIn: function () { return !!state.uid; }
  };

  function boot() {
    applyTheme(currentTheme());
    renderDashboard();
    renderMissionsGrids();
    renderRanking();
    renderAuthUI();
    renderForumBanner();
    renderForumList();

    document.querySelectorAll('.rail-item[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { goTo(b.dataset.view); });
    });
    document.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { goTo(b.dataset.goto); });
    });

    if ($('themeBtn')) $('themeBtn').addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });

    if ($('authBtn')) $('authBtn').addEventListener('click', function () { openAuth(); });
    if ($('authClose')) $('authClose').addEventListener('click', function () { closeOverlay('authOverlay'); });
    if ($('authOverlay')) $('authOverlay').addEventListener('click', function (e) {
      if (e.target === $('authOverlay')) closeOverlay('authOverlay');
    });

    var authMode = 'login';
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        authMode = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
        if ($('nameField')) $('nameField').hidden = (authMode !== 'register');
        if ($('authSubmit')) $('authSubmit').textContent = authMode === 'register' ? 'Criar conta' : 'Entrar';
        if ($('authError')) $('authError').textContent = '';
      });
    });

    var authForm = $('authForm');
    if (authForm) {
      authForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var errEl = $('authError'); if (errEl) errEl.textContent = '';
        if (!isFirebaseReady || !window.RevoltsAuth) {
          if (errEl) errEl.textContent = 'Firebase não configurado.';
          return;
        }
        var email = (($('authEmail') || {}).value || '').trim();
        var pass = (($('authPass') || {}).value || '');
        var name = (($('authName') || {}).value || '').trim();

        if (!email || !pass) { if (errEl) errEl.textContent = 'Preencha e-mail e senha.'; return; }
        if (pass.length < 6) { if (errEl) errEl.textContent = 'Senha com no mínimo 6 caracteres.'; return; }

        var submit = $('authSubmit');
        if (submit) { submit.disabled = true; submit.textContent = 'Conectando...'; }

        var promise = authMode === 'register'
          ? window.RevoltsAuth.signUpEmail(email, pass, name || email.split('@')[0])
          : window.RevoltsAuth.signInEmail(email, pass);

        Promise.resolve(promise)
          .then(function () {
            closeOverlay('authOverlay');
            showToast('Bem-vindo, agente.', 'verified_user');
            if (pendingAction === 'new-post') {
              pendingAction = null;
              setTimeout(openNewPost, 500);
            }
          })
          .catch(function (err) {
            if (errEl) errEl.textContent = translateAuthError(err);
          })
          .then(function () {
            if (submit) { submit.disabled = false; submit.textContent = authMode === 'register' ? 'Criar conta' : 'Entrar'; }
          });
      });
    }

    if ($('googleBtn')) $('googleBtn').addEventListener('click', function () {
      var errEl = $('authError'); if (errEl) errEl.textContent = '';
      if (!isFirebaseReady || !window.RevoltsAuth) {
        if (errEl) errEl.textContent = 'Firebase não configurado.';
        return;
      }
      var btn = $('googleBtn'); btn.disabled = true;
      Promise.resolve(window.RevoltsAuth.signInGoogle())
        .then(function () {
          closeOverlay('authOverlay');
          showToast('Login com Google concluído.', 'verified_user');
          if (pendingAction === 'new-post') {
            pendingAction = null;
            setTimeout(openNewPost, 500);
          }
        })
        .catch(function (err) {
          if (errEl) errEl.textContent = translateAuthError(err);
        })
        .then(function () { btn.disabled = false; });
    });

    if ($('logoutBtn')) $('logoutBtn').addEventListener('click', function () {
      if (window.RevoltsAuth) {
        Promise.resolve(window.RevoltsAuth.signOutUser()).catch(function () {});
      }
      closeOverlay('authOverlay');
      showToast('Sessão encerrada.', 'logout');
    });

    if ($('missionClose')) $('missionClose').addEventListener('click', function () { closeOverlay('missionOverlay'); });
    if ($('missionOverlay')) $('missionOverlay').addEventListener('click', function (e) {
      if (e.target === $('missionOverlay')) closeOverlay('missionOverlay');
    });

    if ($('newPostBtn')) $('newPostBtn').addEventListener('click', openNewPost);
    if ($('newPostClose')) $('newPostClose').addEventListener('click', function () { closeOverlay('newPostOverlay'); });
    if ($('newPostOverlay')) $('newPostOverlay').addEventListener('click', function (e) {
      if (e.target === $('newPostOverlay')) closeOverlay('newPostOverlay');
    });
    if ($('postSubmit')) $('postSubmit').addEventListener('click', submitNewPost);

    if ($('postDetailClose')) $('postDetailClose').addEventListener('click', closePostDetail);
    if ($('postDetailOverlay')) $('postDetailOverlay').addEventListener('click', function (e) {
      if (e.target === $('postDetailOverlay')) closePostDetail();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('missionOverlay') && $('missionOverlay').classList.contains('open')) closeOverlay('missionOverlay');
      if ($('newPostOverlay') && $('newPostOverlay').classList.contains('open')) closeOverlay('newPostOverlay');
      if ($('postDetailOverlay') && $('postDetailOverlay').classList.contains('open')) closePostDetail();
      if ($('authOverlay') && $('authOverlay').classList.contains('open')) closeOverlay('authOverlay');
    });

    document.addEventListener('click', function (ev) {
      var missionBtn = ev.target.closest('[data-mission]');
      if (missionBtn) { openMissionModal(missionBtn.dataset.mission); return; }

      var submitBtn = ev.target.closest('[data-submit]');
      if (submitBtn) {
        ev.preventDefault();
        submitBtn.disabled = true;
        validateAndSubmit(submitBtn.dataset.submit, submitBtn.dataset.choice || null);
        return;
      }

      var forumCard = ev.target.closest('[data-post]');
      if (forumCard) { openPostDetail(forumCard.dataset.post); return; }

      var replySubmit = ev.target.closest('#replySubmit');
      if (replySubmit) { ev.preventDefault(); submitReply(); return; }

      var filterBtn = ev.target.closest('.forum-filter');
      if (filterBtn) {
        document.querySelectorAll('.forum-filter').forEach(function (f) { f.classList.toggle('active', f === filterBtn); });
        currentCategory = filterBtn.dataset.cat;
        renderForumList();
        return;
      }
    });
  }

  function translateAuthError(error) {
    var code = (error && error.code) || '';
    var map = {
      'auth/invalid-email': 'E-mail inválido.',
      'auth/user-disabled': 'Conta desativada.',
      'auth/user-not-found': 'Agente não encontrado. Crie uma conta.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/invalid-credential': 'Credenciais inválidas.',
      'auth/email-already-in-use': 'Este e-mail já está registrado.',
      'auth/weak-password': 'Senha muito fraca (mín. 6 caracteres).',
      'auth/popup-closed-by-user': 'Login cancelado.',
      'auth/popup-blocked': 'Popup bloqueado. Permita popups para este site.',
      'auth/operation-not-allowed': 'Provedor desativado no Firebase Console.',
      'auth/network-request-failed': 'Falha de rede.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
      'auth/unauthorized-domain': 'Domínio não autorizado no Firebase Console.'
    };
    return map[code] || ('Erro: ' + (error && error.message ? error.message : 'desconhecido'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

// ============================================================
// FIREBASE MODULE
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyAAwOZScnWyjXXuLlLlY5cQRIRwHMS0-_0",
  authDomain:        "revolts-b8c77.firebaseapp.com",
  projectId:         "revolts-b8c77",
  storageBucket:     "revolts-b8c77.firebasestorage.app",
  messagingSenderId: "554456699154",
  appId:             "1:554456699154:web:f379970293c67b0fbf23cb",
  measurementId:     "G-BYH8V44QHD"
};

(function bootstrapFirebase() {
  'use strict';
  const UI = window.Revolts;
  if (!UI) return;

  UI.setSyncStatus('connecting', 'Conectando...');

  Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ])
    .then(([appMod, authMod, fsMod]) => {
      const { initializeApp } = appMod;
      const {
        getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
        signInWithEmailAndPassword, createUserWithEmailAndPassword,
        updateProfile, signOut
      } = authMod;
      const {
        getFirestore, doc, getDoc, setDoc, onSnapshot,
        collection, query, orderBy, limit, serverTimestamp, addDoc, updateDoc, increment
      } = fsMod;

      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const db = getFirestore(app);
      const googleProvider = new GoogleAuthProvider();

      let currentUser = null;
      let unsubAgent = null;
      let unsubReplies = null;
      let pushTimer = null;

      UI.setFirebaseReady(true);

      function pushAgent() {
        if (!currentUser) return Promise.resolve();
        const s = UI.getState();
        const name = currentUser.displayName ||
          (currentUser.email ? currentUser.email.split('@')[0] : 'Agente');
        return setDoc(doc(db, 'agents', currentUser.uid), {
          uid: currentUser.uid,
          displayName: name,
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
          xp: s.xp,
          level: s.level,
          completed: s.completed,
          streak: s.streak,
          stats: s.stats,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      function schedulePush() {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(function () {
          pushAgent().catch(function (e) { console.warn('[Revolts] pushAgent:', e); });
        }, 600);
      }
      UI.hooks.onProgressChanged = schedulePush;

      window.RevoltsAuth = {
        signInGoogle: () => signInWithPopup(auth, googleProvider),
        signInEmail: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
        signUpEmail: async (email, pass, name) => {
          const cred = await createUserWithEmailAndPassword(auth, email, pass);
          if (name) {
            try { await updateProfile(cred.user, { displayName: name }); }
            catch (e) { console.warn('[Revolts] updateProfile:', e); }
          }
          return cred;
        },
        signOutUser: () => signOut(auth)
      };

      UI.hooks.createPost = async function ({ title, body, category }) {
        if (!currentUser) throw new Error('not-authenticated');
        const name = currentUser.displayName ||
          (currentUser.email ? currentUser.email.split('@')[0] : 'Agente');
        await addDoc(collection(db, 'forum_posts'), {
          title: String(title).slice(0, 120),
          body: String(body).slice(0, 2000),
          category: category || 'geral',
          authorId: currentUser.uid,
          authorName: name,
          authorPhoto: currentUser.photoURL || null,
          replyCount: 0,
          createdAt: serverTimestamp()
        });
      };

      UI.hooks.createReply = async function ({ postId, body }) {
        if (!currentUser) throw new Error('not-authenticated');
        const name = currentUser.displayName ||
          (currentUser.email ? currentUser.email.split('@')[0] : 'Agente');
        await addDoc(collection(db, 'forum_posts', postId, 'replies'), {
          body: String(body).slice(0, 1000),
          authorId: currentUser.uid,
          authorName: name,
          authorPhoto: currentUser.photoURL || null,
          createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'forum_posts', postId), {
          replyCount: increment(1)
        });
      };

      const postsQuery = query(collection(db, 'forum_posts'), orderBy('createdAt', 'desc'), limit(50));
      onSnapshot(postsQuery, function (qs) {
        const list = [];
        qs.forEach(function (d) {
          const v = d.data() || {};
          list.push({
            id: d.id,
            title: v.title || '',
            body: v.body || '',
            category: v.category || 'geral',
            authorName: v.authorName || 'Agente',
            authorPhoto: v.authorPhoto || null,
            replyCount: v.replyCount || 0,
            createdAt: v.createdAt && v.createdAt.toDate ? v.createdAt.toDate().toISOString() : null
          });
        });
        UI.applyForumPosts(list);
      }, function (err) {
        console.warn('[Revolts] Listener do fórum falhou:', err);
      });

      UI.hooks.openPost = function (postId) {
        if (unsubReplies) { unsubReplies(); unsubReplies = null; }
        const repliesQuery = query(
          collection(db, 'forum_posts', postId, 'replies'),
          orderBy('createdAt', 'asc'),
          limit(100)
        );
        unsubReplies = onSnapshot(repliesQuery, function (qs) {
          const list = [];
          qs.forEach(function (d) {
            const v = d.data() || {};
            list.push({
              id: d.id,
              body: v.body || '',
              authorName: v.authorName || 'Agente',
              authorPhoto: v.authorPhoto || null,
              createdAt: v.createdAt && v.createdAt.toDate ? v.createdAt.toDate().toISOString() : null
            });
          });
          UI.applyForumReplies(postId, list);
        }, function (err) {
          console.warn('[Revolts] Listener de respostas falhou:', err);
        });
      };

      UI.hooks.closePost = function () {
        if (unsubReplies) { unsubReplies(); unsubReplies = null; }
      };

      const boardQuery = query(collection(db, 'agents'), orderBy('xp', 'desc'), limit(50));
      onSnapshot(boardQuery, function (qs) {
        const list = [];
        qs.forEach(function (d) {
          const v = d.data() || {};
          list.push({
            uid: d.id,
            displayName: v.displayName || 'Agente',
            xp: Number(v.xp) || 0,
            photoURL: v.photoURL || null
          });
        });
        UI.applyLeaderboard(list);
      }, function (err) {
        console.warn('[Revolts] Listener do ranking falhou:', err);
      });

      onAuthStateChanged(auth, async function (user) {
        if (unsubAgent) { unsubAgent(); unsubAgent = null; }
        if (unsubReplies) { unsubReplies(); unsubReplies = null; }
        clearTimeout(pushTimer);
        currentUser = user;

        if (!user) {
          UI.applyAuthUser(null);
          UI.setSyncStatus('local', 'Modo Local');
          return;
        }

        const name = user.displayName ||
          (user.email ? user.email.split('@')[0] : 'Agente');

        UI.applyAuthUser({
          uid: user.uid,
          name: name,
          photo: user.photoURL || null,
          email: user.email || ''
        });

        UI.setSyncStatus('online', 'Sincronizado');

        const ref = doc(db, 'agents', user.uid);
        try {
          const snap = await getDoc(ref);
          const local = UI.getState();

          if (!snap.exists()) {
            await setDoc(ref, {
              uid: user.uid,
              displayName: name,
              email: user.email || '',
              photoURL: user.photoURL || '',
              xp: local.xp,
              level: local.level,
              completed: local.completed,
              streak: local.streak,
              stats: local.stats,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } else {
            const cloud = snap.data() || {};
            if (local.xp > (Number(cloud.xp) || 0)) {
              await setDoc(ref, {
                xp: local.xp,
                level: local.level,
                completed: local.completed,
                streak: local.streak,
                stats: local.stats,
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        } catch (err) {
          console.warn('[Revolts] Verificação inicial do agente falhou:', err);
        }

        unsubAgent = onSnapshot(ref, function (snap) {
          if (!snap.exists()) return;
          const data = snap.data() || {};
          UI.applyRemote({
            xp: typeof data.xp === 'number' ? data.xp : undefined,
            completed: typeof data.completed === 'number' ? data.completed : undefined,
            streak: typeof data.streak === 'number' ? data.streak : undefined,
            stats: data.stats,
            displayName: data.displayName,
            photoURL: data.photoURL
          });
        }, function (err) {
          console.warn('[Revolts] Listener do agente falhou:', err);
          UI.setSyncStatus('offline', 'Sem conexão');
        });
      });
    })
    .catch(function (err) {
      console.error('[Revolts] Falha ao carregar Firebase via CDN:', err);
      if (window.Revolts) window.Revolts.setSyncStatus('offline', 'Offline');
    });
})();
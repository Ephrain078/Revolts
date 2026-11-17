/* =========================================================
   Revolts — Rede de Agentes
   script.js (ES module)
   - Inicialização segura do DOM
   - Delegação de eventos em document
   - localStorage + Firebase (carregado de forma opcional)
   - Anúncios isolados e controlados por CONFIG
   ========================================================= */

/* ---------- CONFIG ---------- */
const CONFIG = {
  storageKey: 'revolts_state_v1',
  themeKey: 'revolts_theme',
  xpPerLevel: 100,

  firebase: {
    apiKey: 'AIzaSyAAwOZScnWyjXXuLlLlY5cQRIRwHMS0-_0',
    authDomain: 'revolts-b8c77.firebaseapp.com',
    projectId: 'revolts-b8c77',
    storageBucket: 'revolts-b8c77.firebasestorage.app',
    messagingSenderId: '554456699154',
    appId: '1:554456699154:web:f379970293c67b0fbf23cb',
    measurementId: 'G-BYH8V44QHD'
  },
  firebaseVersion: '10.12.2',

  ads: {
    enabled: true,
    // Banners 160x600 e 160x300: rodam dentro de iframes sandbox (sem acesso ao seu DOM)
    banners: [
      { key: '4f5f3d1a4257905c1064e17d129103ec', w: 160, h: 600 },
      { key: 'c424702e3f6d17018d1227c2caf49eb4', w: 160, h: 300 }
    ],
    nativeScript: 'https://bicea.org/21/49aad8a40bd8169df8356c5cc12133d5',
    // Este script costuma abrir pop-ups e sobrepor a página (principal causa de "cliques bloqueados").
    // Deixe false enquanto testa. Mude para true só quando o resto estiver estável.
    intrusiveScript: false,
    intrusiveSrc: 'https://afders.org/1/d05e557033e43bd174cbf0f24996f75a'
  }
};

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0, 10);

function toast(msg, type = '') {
  try {
    const box = $('#toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  } catch (e) { console.warn('[Revolts] toast falhou', e); }
}

/** Envolve uma função para que nenhum erro quebre o app inteiro. */
function guard(label, fn) {
  return (...args) => {
    try {
      const r = fn(...args);
      if (r && typeof r.catch === 'function') r.catch((e) => reportError(label, e));
      return r;
    } catch (e) { reportError(label, e); }
  };
}
function reportError(label, e) {
  console.error(`[Revolts] ${label}`, e);
  toast(`Algo deu errado (${label}).`, 'error');
}

/* ---------- Dados ---------- */
const MISSIONS = [
  { id: 'm1', icon: 'translate', title: 'Validar tradução', xp: 10,
    desc: 'Confira se a tradução de uma frase curta está correta.',
    question: '"Good morning" foi traduzido como "Bom dia". A tradução está correta?',
    options: ['Correta', 'Incorreta'], answer: 0, why: 'Está correta: "Good morning" é "Bom dia".' },
  { id: 'm2', icon: 'spellcheck', title: 'Caçar erro de ortografia', xp: 15,
    desc: 'Encontre a palavra escrita corretamente.',
    question: 'Qual das opções está escrita corretamente?',
    options: ['Exceção', 'Excessão', 'Esseção'], answer: 0, why: 'A forma correta é "exceção".' },
  { id: 'm3', icon: 'image_search', title: 'Classificar imagem', xp: 10,
    desc: 'Diga o que uma descrição representa.',
    question: 'Uma foto mostra um tucano pousado em um galho. Qual a melhor categoria?',
    options: ['Animal', 'Veículo', 'Alimento'], answer: 0, why: 'Tucano é uma ave, portanto um animal.' },
  { id: 'm4', icon: 'record_voice_over', title: 'Checar transcrição', xp: 20,
    desc: 'Avalie se um texto transcrito faz sentido.',
    question: 'Áudio: "Vou ao mercado comprar pão." Transcrição: "Vou ao mercado comprar pão." Está fiel ao áudio?',
    options: ['Sim, está fiel', 'Não, tem erro'], answer: 0, why: 'A transcrição é idêntica ao que foi dito.' },
  { id: 'm5', icon: 'place', title: 'Verificar local', xp: 15,
    desc: 'Confirme informações simples sobre lugares.',
    question: 'Palmas é a capital de qual estado brasileiro?',
    options: ['Tocantins', 'Goiás', 'Pará'], answer: 0, why: 'Palmas é a capital do Tocantins.' },
  { id: 'm6', icon: 'sentiment_satisfied', title: 'Sentimento do texto', xp: 10,
    desc: 'Identifique se a frase é positiva ou negativa.',
    question: '"Adorei o atendimento, voltarei com certeza!" é uma frase…',
    options: ['Positiva', 'Negativa', 'Neutra'], answer: 0, why: 'Há elogio e intenção de voltar: sentimento positivo.' }
];

const DEFAULTS = { done: {}, posts: [], user: null, lastDay: null, streak: 0 };

let state = loadState();
let remotePosts = [];
let currentMission = null;
let answered = false;
let cloud = null;            // preenchido quando o Firebase carrega
let unsubPosts = null;
let saveTimer = null;

/* ---------- Persistência local ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return { ...clone(DEFAULTS), ...parsed, done: parsed.done || {}, posts: Array.isArray(parsed.posts) ? parsed.posts : [] };
  } catch (e) {
    console.warn('[Revolts] estado local inválido, reiniciando', e);
    return clone(DEFAULTS);
  }
}
function persist() {
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); }
  catch (e) { console.warn('[Revolts] localStorage indisponível', e); }
  scheduleCloudSave();
}

/* ---------- Cálculos ---------- */
const totalXp = () => MISSIONS.reduce((sum, m) => sum + (state.done[m.id] ? m.xp : 0), 0);
const levelOf = (xp) => Math.floor(xp / CONFIG.xpPerLevel) + 1;
const doneCount = () => MISSIONS.filter((m) => state.done[m.id]).length;

/* ---------- Navegação ---------- */
function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'ranking') renderRanking();
  if (name === 'forum') renderForum();
  window.scrollTo({ top: 0 });
}

/* ---------- Renderização ---------- */
function renderHero() {
  const xp = totalXp();
  const level = levelOf(xp);
  const inLevel = xp % CONFIG.xpPerLevel;
  const pct = (inLevel / CONFIG.xpPerLevel) * 100;
  const C = 2 * Math.PI * 96;

  const ring = $('#ringProgress');
  if (ring) {
    ring.style.strokeDasharray = String(C);
    ring.style.strokeDashoffset = String(C * (1 - pct / 100));
  }
  $('#ringLevel').textContent = level;
  $('#heroXp').textContent = xp;
  $('#xpBar').style.width = `${pct}%`;
  $('#heroNext').textContent = `Faltam ${CONFIG.xpPerLevel - inLevel} XP para o nível ${level + 1}`;
  $('#heroChips').innerHTML = `
    <span class="chip">Nível ${level}</span>
    <span class="chip chip-secondary">${doneCount()} de ${MISSIONS.length} missões</span>
    <span class="chip chip-outline">${state.streak || 0} dia(s) seguidos</span>`;

  const stat = (icon, value, label) => `
    <div class="card stat"><div class="stat-icon"><span class="material-symbols-rounded">${icon}</span></div>
    <div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
  const myPosts = (cloud && state.user ? remotePosts : state.posts).filter((p) => isMine(p)).length;
  $('#stats').innerHTML =
    stat('bolt', xp, 'XP total') +
    stat('task_alt', doneCount(), 'Missões concluídas') +
    stat('local_fire_department', state.streak || 0, 'Dias seguidos') +
    stat('forum', myPosts, 'Suas publicações');
}

function missionCard(m) {
  const done = !!state.done[m.id];
  return `
  <article class="card mission-card ${done ? 'done' : ''}">
    <div class="mission-top">
      <div class="mission-icon"><span class="material-symbols-rounded">${done ? 'check_circle' : m.icon}</span></div>
      <span class="xp-badge">+${m.xp} XP</span>
    </div>
    <h3>${esc(m.title)}</h3>
    <p>${esc(m.desc)}</p>
    <div class="mission-foot">
      <span class="chip chip-outline">${done ? 'Concluída' : 'Disponível'}</span>
      <button class="btn ${done ? 'btn-outline' : 'btn-filled'}" data-action="open-mission" data-id="${m.id}" type="button">${done ? 'Rever' : 'Começar'}</button>
    </div>
  </article>`;
}
function renderMissions() {
  const pending = MISSIONS.filter((m) => !state.done[m.id]);
  const featured = (pending.length ? pending : MISSIONS).slice(0, 3);
  $('#missionsHome').innerHTML = featured.map(missionCard).join('');
  $('#missionsAll').innerHTML = MISSIONS.map(missionCard).join('');
}

/* Fórum */
function isMine(p) {
  if (state.user) return p.uid === state.user.uid;
  return p.uid === 'local';
}
function activePosts() { return cloud && state.user ? remotePosts : state.posts; }
function renderForum() {
  const list = activePosts();
  const online = !!(cloud && state.user);
  $('#forumHint').textContent = online
    ? 'Publicações compartilhadas com todos os agentes.'
    : 'Você está offline ou sem login: as publicações ficam só neste aparelho.';
  const me = state.user ? state.user.uid : 'local';
  $('#posts').innerHTML = list.length ? list.map((p) => {
    const liked = (p.likes || []).includes(me);
    const initial = esc((p.author || '?').trim().charAt(0).toUpperCase());
    const avatar = p.photo ? `style="background-image:url('${esc(p.photo)}')"` : '';
    return `
    <article class="card post">
      <div class="post-head">
        <div class="avatar" ${avatar}>${p.photo ? '' : initial}</div>
        <strong>${esc(p.author || 'Agente')}</strong>
        <span class="chip chip-outline">${esc(p.tag || 'Ideia')}</span>
        <span class="muted">${new Date(p.ts || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      <p class="post-body">${esc(p.text)}</p>
      <div class="post-actions">
        <button class="btn ${liked ? 'btn-filled' : 'btn-tonal'}" data-action="like-post" data-id="${esc(p.id)}" type="button">
          <span class="material-symbols-rounded" style="font-size:18px">thumb_up</span>${(p.likes || []).length}
        </button>
        ${isMine(p) ? `<button class="btn btn-outline" data-action="delete-post" data-id="${esc(p.id)}" type="button">Excluir</button>` : ''}
      </div>
    </article>`;
  }).join('') : '<div class="card empty">Nenhuma publicação ainda. Seja o primeiro a escrever.</div>';
}

/* Ranking */
async function renderRanking() {
  const board = $('#board');
  const myRow = { name: state.user ? state.user.name : 'Você', xp: totalXp(), me: true };
  const draw = (rows) => {
    board.innerHTML = rows.map((r, i) => `
      <div class="board-row ${r.me ? 'me' : ''}">
        <span class="board-pos">${i + 1}</span>
        <span class="board-name">${esc(r.name)}${r.me ? ' (você)' : ''}</span>
        <span class="board-xp">${r.xp} XP</span>
      </div>`).join('');
  };
  draw([myRow]);
  $('#rankHint').textContent = 'Entre com sua conta para aparecer no ranking global.';
  if (!(cloud && state.user)) return;
  try {
    const { collection, query, orderBy, limit, getDocs } = cloud.fs;
    const snap = await getDocs(query(collection(cloud.db, 'users'), orderBy('xp', 'desc'), limit(10)));
    const rows = snap.docs.map((d) => ({ name: d.data().name || 'Agente', xp: d.data().xp || 0, me: d.id === state.user.uid }));
    if (rows.length) { draw(rows); $('#rankHint').textContent = 'Os 10 agentes com mais XP.'; }
  } catch (e) {
    console.warn('[Revolts] ranking indisponível', e);
    $('#rankHint').textContent = 'Ranking global indisponível (verifique as regras do Firestore).';
  }
}

/* Perfil / status */
function renderProfile() {
  const u = state.user;
  $('#profileName').textContent = u ? u.name : 'Visitante';
  $('#profileSub').textContent = u ? (u.email || 'Conta Google conectada') : 'Progresso salvo só neste aparelho.';
  const av = $('#profileAvatar');
  av.textContent = u && !u.photo ? u.name.charAt(0).toUpperCase() : (u ? '' : '?');
  av.style.backgroundImage = u && u.photo ? `url('${u.photo}')` : '';
  $('#loginBtn').hidden = !!u;
  $('#logoutBtn').hidden = !u;

  const btn = $('#userBtn');
  if (u && u.photo) { btn.classList.add('user-photo'); btn.style.backgroundImage = `url('${u.photo}')`; }
  else { btn.classList.remove('user-photo'); btn.style.backgroundImage = ''; }
}
function setSync(status, text) {
  const dot = $('#railDot');
  if (dot) dot.className = `sync-dot ${status}`;
  const t = $('#syncText'); if (t) t.textContent = text;
  const r = $('#railSync'); if (r) r.textContent = status === 'online' ? 'Online' : status === 'offline' ? 'Local' : 'Sync';
}
function renderAll() {
  renderHero(); renderMissions(); renderForum(); renderProfile();
  if ($('#view-ranking').classList.contains('active')) renderRanking();
}

/* ---------- Tema ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(CONFIG.themeKey, theme); } catch (e) { /* ignora */ }
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1C1B1F' : '#FFFBFE');
  const icon = $('#themeIcon'); if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ---------- Missões (modal) ---------- */
function openMission(id) {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return;
  currentMission = m; answered = false;
  $('#modalTitle').textContent = m.title;
  $('#modalBody').innerHTML = `
    <p class="modal-q">${esc(m.question)}</p>
    <div class="opts" style="margin-top:14px">
      ${m.options.map((o, i) => `<button class="opt" data-action="answer" data-index="${i}" type="button">${esc(o)}</button>`).join('')}
    </div>
    <p class="modal-feedback" id="modalFeedback" style="margin-top:14px"></p>`;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; currentMission = null; }

function answerMission(index) {
  if (!currentMission || answered) return;
  const m = currentMission;
  const btns = $$('#modalBody .opt');
  const correct = index === m.answer;
  btns[index].classList.add(correct ? 'ok' : 'bad');
  const fb = $('#modalFeedback');

  if (correct) {
    answered = true;
    btns.forEach((b) => { b.disabled = true; });
    const first = !state.done[m.id];
    if (first) {
      state.done[m.id] = true;
      bumpStreak();
      persist();
      renderAll();
    }
    fb.textContent = first ? `Correto! +${m.xp} XP. ${m.why}` : `Correto. ${m.why} (XP já recebido antes.)`;
    if (first) toast(`+${m.xp} XP`, 'success');
  } else {
    btns[index].disabled = true;
    fb.textContent = 'Resposta incorreta. Tente outra opção.';
  }
}
function bumpStreak() {
  const t = today();
  if (state.lastDay === t) return;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  state.streak = state.lastDay === y ? (state.streak || 0) + 1 : 1;
  state.lastDay = t;
}

/* ---------- Fórum (ações) ---------- */
async function newPost() {
  const ta = $('#postText');
  const text = ta.value.trim();
  if (text.length < 3) { toast('Escreva pelo menos 3 caracteres.', 'error'); return; }
  const tag = $('#postTag').value;

  if (cloud && state.user) {
    try {
      const { collection, addDoc, serverTimestamp } = cloud.fs;
      await addDoc(collection(cloud.db, 'posts'), {
        text, tag, uid: state.user.uid, author: state.user.name, photo: state.user.photo || '',
        likes: [], ts: serverTimestamp()
      });
      ta.value = ''; toast('Publicado!', 'success');
    } catch (e) {
      console.error(e);
      toast('Sem permissão para publicar. Confira as regras do Firestore.', 'error');
    }
    return;
  }
  state.posts.unshift({ id: `p_${Date.now()}`, text, tag, uid: 'local', author: 'Você', likes: [], ts: Date.now() });
  state.posts = state.posts.slice(0, 100);
  ta.value = '';
  persist(); renderAll(); toast('Publicado neste aparelho.', 'success');
}

async function likePost(id) {
  const me = state.user ? state.user.uid : 'local';
  if (cloud && state.user) {
    const p = remotePosts.find((x) => x.id === id);
    if (!p) return;
    try {
      const { doc, updateDoc, arrayUnion, arrayRemove } = cloud.fs;
      await updateDoc(doc(cloud.db, 'posts', id), { likes: (p.likes || []).includes(me) ? arrayRemove(me) : arrayUnion(me) });
    } catch (e) { console.error(e); toast('Não foi possível curtir.', 'error'); }
    return;
  }
  const p = state.posts.find((x) => x.id === id);
  if (!p) return;
  p.likes = p.likes || [];
  p.likes = p.likes.includes(me) ? p.likes.filter((u) => u !== me) : [...p.likes, me];
  persist(); renderForum();
}

async function deletePost(id) {
  if (!confirm('Excluir esta publicação?')) return;
  if (cloud && state.user) {
    try { await cloud.fs.deleteDoc(cloud.fs.doc(cloud.db, 'posts', id)); toast('Excluída.'); }
    catch (e) { console.error(e); toast('Não foi possível excluir.', 'error'); }
    return;
  }
  state.posts = state.posts.filter((p) => p.id !== id);
  persist(); renderAll();
}

function resetProgress() {
  if (!confirm('Zerar todo o seu progresso de missões?')) return;
  state.done = {}; state.streak = 0; state.lastDay = null;
  persist(); renderAll(); toast('Progresso zerado.');
}

/* ---------- Firebase (opcional, nunca bloqueia a interface) ---------- */
async function initFirebase() {
  setSync('connecting', 'Conectando…');
  try {
    const base = `https://www.gstatic.com/firebasejs/${CONFIG.firebaseVersion}/`;
    const [app, auth, fs] = await Promise.all([
      import(`${base}firebase-app.js`),
      import(`${base}firebase-auth.js`),
      import(`${base}firebase-firestore.js`)
    ]);
    const fbApp = app.initializeApp(CONFIG.firebase);
    cloud = { app: fbApp, auth: auth.getAuth(fbApp), authApi: auth, db: fs.getFirestore(fbApp), fs };

    auth.onAuthStateChanged(cloud.auth, guard('auth', async (u) => {
      if (u) {
        state.user = { uid: u.uid, name: u.displayName || 'Agente', photo: u.photoURL || '', email: u.email || '' };
        setSync('online', 'Sincronizado');
        await pullProfile();
        subscribePosts();
      } else {
        state.user = null;
        remotePosts = [];
        if (unsubPosts) { unsubPosts(); unsubPosts = null; }
        setSync('offline', 'Modo local');
      }
      persist(); renderAll();
    }));
    setSync('offline', 'Modo local');
  } catch (e) {
    console.warn('[Revolts] Firebase indisponível, seguindo em modo local', e);
    cloud = null;
    setSync('offline', 'Modo local');
  }
}

async function pullProfile() {
  try {
    const { doc, getDoc } = cloud.fs;
    const snap = await getDoc(doc(cloud.db, 'users', state.user.uid));
    if (snap.exists()) {
      const remote = snap.data();
      state.done = { ...(remote.done || {}), ...state.done };   // une local + nuvem
      state.streak = Math.max(state.streak || 0, remote.streak || 0);
      state.lastDay = [state.lastDay, remote.lastDay].filter(Boolean).sort().pop() || null;
    }
    await saveProfile();
  } catch (e) { console.warn('[Revolts] perfil na nuvem indisponível', e); }
}

async function saveProfile() {
  if (!(cloud && state.user)) return;
  try {
    const { doc, setDoc, serverTimestamp } = cloud.fs;
    await setDoc(doc(cloud.db, 'users', state.user.uid), {
      name: state.user.name, photo: state.user.photo || '', xp: totalXp(),
      done: state.done, streak: state.streak || 0, lastDay: state.lastDay || null, updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) { console.warn('[Revolts] não foi possível salvar na nuvem', e); }
}
function scheduleCloudSave() {
  if (!(cloud && state.user)) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProfile, 800);
}

function subscribePosts() {
  if (unsubPosts) unsubPosts();
  try {
    const { collection, query, orderBy, limit, onSnapshot } = cloud.fs;
    unsubPosts = onSnapshot(
      query(collection(cloud.db, 'posts'), orderBy('ts', 'desc'), limit(50)),
      guard('posts', (snap) => {
        remotePosts = snap.docs.map((d) => {
          const v = d.data();
          return { id: d.id, ...v, ts: v.ts && v.ts.toMillis ? v.ts.toMillis() : Date.now() };
        });
        renderForum(); renderHero();
      }),
      (err) => { console.warn('[Revolts] posts sem permissão', err); toast('Fórum compartilhado indisponível (regras do Firestore).', 'error'); }
    );
  } catch (e) { console.warn('[Revolts] falha ao assinar posts', e); }
}

async function login() {
  if (!cloud) { toast('Firebase indisponível. Use um servidor local (http://localhost).', 'error'); return; }
  try {
    await cloud.authApi.signInWithPopup(cloud.auth, new cloud.authApi.GoogleAuthProvider());
  } catch (e) {
    console.warn(e);
    toast(e.code === 'auth/popup-closed-by-user' ? 'Login cancelado.' : 'Não foi possível entrar. Verifique os domínios autorizados no Firebase.', 'error');
  }
}
async function logout() {
  if (!cloud) return;
  try { await cloud.authApi.signOut(cloud.auth); toast('Você saiu.'); }
  catch (e) { reportError('logout', e); }
}

/* ---------- Anúncios (isolados; falha nunca derruba o app) ---------- */
function bannerDoc(key, w, h) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent">` +
    `<script>atOptions={'key':'${key}','format':'iframe','height':${h},'width':${w},'params':{}};<\/script>` +
    `<script src="https://bicea.org/22/${key}"><\/script></body></html>`;
}
function loadAds() {
  if (!CONFIG.ads.enabled) { const c = $('#sponsorCard'); if (c) c.hidden = true; return; }
  try {
    const row = $('#adBanners');
    CONFIG.ads.banners.forEach(({ key, w, h }) => {
      const f = document.createElement('iframe');
      f.className = 'ad-slot';
      f.title = 'Publicidade';
      f.width = w; f.height = h;
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      // sandbox: o anúncio roda, mas não consegue redirecionar nem cobrir a página principal
      f.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
      f.srcdoc = bannerDoc(key, w, h);
      row.appendChild(f);
    });
  } catch (e) { console.warn('[Revolts] banners falharam', e); }

  try {
    const s = document.createElement('script');
    s.async = true; s.src = CONFIG.ads.nativeScript; s.setAttribute('data-cfasync', 'false');
    document.body.appendChild(s);
  } catch (e) { console.warn('[Revolts] anúncio nativo falhou', e); }

  if (CONFIG.ads.intrusiveScript) {
    try {
      const s = document.createElement('script');
      s.src = CONFIG.ads.intrusiveSrc; s.setAttribute('data-cfasync', 'false');
      document.body.appendChild(s);
    } catch (e) { console.warn('[Revolts] script de anúncio falhou', e); }
  }
}

/* ---------- Delegação de eventos (um único ouvinte no document) ---------- */
const actions = {
  'nav': (el) => showView(el.dataset.view),
  'toggle-theme': () => toggleTheme(),
  'open-mission': (el) => openMission(el.dataset.id),
  'close-modal': () => closeModal(),
  'answer': (el) => answerMission(Number(el.dataset.index)),
  'new-post': () => newPost(),
  'like-post': (el) => likePost(el.dataset.id),
  'delete-post': (el) => deletePost(el.dataset.id),
  'login': () => login(),
  'logout': () => logout(),
  'reset': () => resetProgress()
};

function bindEvents() {
  document.addEventListener('click', (e) => {
    try {
      if (e.target && e.target.id === 'modal') { closeModal(); return; }   // clique no fundo escuro
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      const fn = actions[el.dataset.action];
      if (fn) guard(el.dataset.action, fn)(el);
    } catch (err) { reportError('click', err); }
  });

  document.addEventListener('keydown', (e) => {
    try {
      if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target && e.target.id === 'postText') guard('new-post', newPost)();
    } catch (err) { reportError('keydown', err); }
  });
}

/* ---------- Inicialização segura ---------- */
function init() {
  try {
    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    bindEvents();
    renderAll();
    setSync('connecting', 'Conectando…');
  } catch (e) { reportError('init', e); }

  // Itens opcionais iniciam depois, sem poder travar a interface
  initFirebase();
  setTimeout(loadAds, 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

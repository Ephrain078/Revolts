import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
   CONFIG
   Sem Firebase configurado, o mundo salva só no navegador (localStorage).
   Para multiplayer: crie um projeto no Firebase, ative Firestore +
   Authentication (Anônimo) e cole as chaves abaixo.

   Regras do Firestore sugeridas:
   rules_version = '2';
   service cloud.firestore { match /databases/{db}/documents {
     match /chunks/{id} { allow read: if true; allow write: if request.auth != null; }
   } }
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: 'COLE_AQUI',
  authDomain: 'SEU_PROJETO.firebaseapp.com',
  projectId: 'SEU_PROJETO',
  appId: 'SEU_APP_ID',
};
const FB_VER = '10.12.2';
const CHUNK = 16;      // tamanho do chunk (blocos 1x1)
const RADIUS = 5;      // raio de chunks carregados
const MAX_Y = 47;      // altura máxima de construção
const PALETTE = [0x00f0ff, 0xff7a00, 0xff2bd6, 0xeaffff, 0x7dff4a];

/* ============================================================
   MUNDO: terreno procedural determinístico + edições
   ============================================================ */
const hash = (x, z) => {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const hk = (x, z) => (x + 1048576) * 2097152 + (z + 1048576);
const bk = (x, y, z) => hk(x, z) * 64 + y;

const heightCache = new Map();
function terrainH(x, z) {
  const k = hk(x, z);
  let h = heightCache.get(k);
  if (h !== undefined) return h;
  const n = .6 * vnoise(x / 26, z / 26) + .3 * vnoise(x / 10, z / 10) + .1 * vnoise(x / 4, z / 4);
  const plaza = smooth(Math.min(1, Math.max(0, (Math.hypot(x, z) - 14) / 26))); // centro plano p/ construir
  h = Math.floor(Math.max(0, n - .38) * 18 * plaza);
  heightCache.set(k, h);
  return h;
}

const edits = new Map();     // chave numérica -> índice de cor (-1 = removido)
const store = new Map();     // "x_y_z" -> cor (persistência)
const chunkTop = new Map();  // "cx,cz" -> maior y editado
const dirty = new Set();

function solid(x, y, z) {
  if (y < 0 || y > MAX_Y) return false;
  const e = edits.get(bk(x, y, z));
  return e !== undefined ? e >= 0 : y <= terrainH(x, z);
}
const opaque = (x, y, z) => y < 0 || solid(x, y, z);

function setBlock(x, y, z, c, save = true) {
  if (y < 0 || y > MAX_Y) return;
  const k = bk(x, y, z);
  if (edits.get(k) === c) return;
  edits.set(k, c);
  store.set(`${x}_${y}_${z}`, c);
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), ck = cx + ',' + cz;
  chunkTop.set(ck, Math.max(chunkTop.get(ck) || 0, y));
  dirty.add(ck);
  const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
  if (lx === 0) dirty.add((cx - 1) + ',' + cz);
  if (lx === CHUNK - 1) dirty.add((cx + 1) + ',' + cz);
  if (lz === 0) dirty.add(cx + ',' + (cz - 1));
  if (lz === CHUNK - 1) dirty.add(cx + ',' + (cz + 1));
  if (save) net.save(x, y, z, c);
}

/* ============================================================
   CENA, RENDER, BLOOM
   ============================================================ */
const BG = 0x02050a;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.016);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 600);
camera.position.set(26, 22, 26);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 110;
controls.maxPolarAngle = Math.PI / 2.05;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .85, .55, .55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* Grade infinita: plano que segue a câmera; linhas calculadas em coordenadas de mundo */
const gridMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0x00f0ff) } },
  vertexShader: `varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz;
    gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `varying vec2 vW; uniform vec3 uCam; uniform vec3 uColor;
    float line(vec2 c){ vec2 g = abs(fract(c-.5)-.5)/fwidth(c); return 1.-min(min(g.x,g.y),1.); }
    void main(){
      vec2 c = vW + .5;
      float a = line(c)*.45 + line(c/8.)*.9;
      float d = length(vW - uCam.xz)/260.;
      a *= 1. - smoothstep(.15, 1., d);
      gl_FragColor = vec4(uColor*(.6+a), a);
    }`,
});
const grid = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), gridMat);
grid.rotation.x = -Math.PI / 2;
grid.position.y = -.52;
scene.add(grid);

/* ============================================================
   BLOCOS: 1 geometria + 1 material compartilhados, 1 InstancedMesh por chunk
   ============================================================ */
function blockTexture() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#0a121c'; g.fillRect(0, 0, s, s);
  const grad = g.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, 'rgba(255,255,255,.10)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const boxMat = new THREE.MeshBasicMaterial({ map: blockTexture() });
const chunkGroup = new THREE.Group();
scene.add(chunkGroup);

const chunks = new Map(); // "cx,cz" -> { mesh|null }
let totalInstances = 0;

function buildChunk(cx, cz) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  let top = chunkTop.get(cx + ',' + cz) || 0;
  for (let i = 0; i < CHUNK; i++) for (let j = 0; j < CHUNK; j++) top = Math.max(top, terrainH(x0 + i, z0 + j));

  const pos = [], cols = [];
  for (let i = 0; i < CHUNK; i++) for (let j = 0; j < CHUNK; j++) {
    const x = x0 + i, z = z0 + j;
    for (let y = 0; y <= top; y++) {
      if (!solid(x, y, z)) continue;
      if (opaque(x + 1, y, z) && opaque(x - 1, y, z) && opaque(x, y + 1, z) &&
          opaque(x, y - 1, z) && opaque(x, y, z + 1) && opaque(x, y, z - 1)) continue; // bloco enterrado
      pos.push(x, y, z);
      const e = edits.get(bk(x, y, z));
      cols.push(e !== undefined ? e : -1);
    }
  }
  const n = cols.length;
  if (!n) return null;

  const mesh = new THREE.InstancedMesh(boxGeo, boxMat, n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    m.makeTranslation(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    mesh.setMatrixAt(k, m);
    if (cols[k] >= 0) c.setHex(PALETTE[cols[k]]);
    else c.setHex(0x00e5ff).multiplyScalar(Math.min(1, .5 + .07 * pos[k * 3 + 1])); // terreno: ciano
    mesh.setColorAt(k, c);
  }
  mesh.computeBoundingSphere();
  return mesh;
}

function loadChunk(cx, cz) {
  const ck = cx + ',' + cz;
  const mesh = buildChunk(cx, cz);
  if (mesh) { chunkGroup.add(mesh); totalInstances += mesh.count; }
  chunks.set(ck, { mesh });
  net.watch(ck);
}
function dropMesh(entry) {
  if (!entry.mesh) return;
  chunkGroup.remove(entry.mesh);
  totalInstances -= entry.mesh.count;
  entry.mesh.dispose();
  entry.mesh = null;
}
function unloadChunk(ck) {
  dropMesh(chunks.get(ck));
  chunks.delete(ck);
  net.unwatch(ck);
}
function rebuildChunk(ck) {
  const entry = chunks.get(ck);
  if (!entry) return;
  dropMesh(entry);
  const [cx, cz] = ck.split(',').map(Number);
  entry.mesh = buildChunk(cx, cz);
  if (entry.mesh) { chunkGroup.add(entry.mesh); totalInstances += entry.mesh.count; }
}

let lastCenter = '', pending = [];
function refreshChunks() {
  const ccx = Math.floor(controls.target.x / CHUNK), ccz = Math.floor(controls.target.z / CHUNK);
  const key = ccx + ',' + ccz;
  if (key === lastCenter) return;
  lastCenter = key;
  pending = [];
  for (let dx = -RADIUS; dx <= RADIUS; dx++) for (let dz = -RADIUS; dz <= RADIUS; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > RADIUS + .5) continue;
    if (!chunks.has((ccx + dx) + ',' + (ccz + dz))) pending.push({ cx: ccx + dx, cz: ccz + dz, d });
  }
  pending.sort((a, b) => a.d - b.d);
  for (const ck of [...chunks.keys()]) {
    const [cx, cz] = ck.split(',').map(Number);
    if (Math.hypot(cx - ccx, cz - ccz) > RADIUS + 1.5) unloadChunk(ck);
  }
}
function pumpChunks() {
  const t0 = performance.now();
  while (pending.length && performance.now() - t0 < 8) {
    const p = pending.shift();
    if (!chunks.has(p.cx + ',' + p.cz)) loadChunk(p.cx, p.cz);
  }
  let n = 0;
  for (const ck of dirty) {
    dirty.delete(ck);
    rebuildChunk(ck);
    if (++n >= 6) break;
  }
}

/* ============================================================
   PERSISTÊNCIA: localStorage (offline) ou Firebase Firestore (online)
   Um documento por chunk: chunks/{cx_cz} = { "x_y_z": corIndex, ... }
   ============================================================ */
const statusEl = document.getElementById('status');
let netLabel = 'offline (local)';
let db = null, fb = null;
const subs = new Map();
let saveTimer = 0;

const net = {
  async init() {
    const ok = FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('COLE');
    if (ok) {
      try {
        const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
        const [app, auth, fs] = await Promise.all([
          import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
        ]);
        const a = app.initializeApp(FIREBASE_CONFIG);
        await auth.signInAnonymously(auth.getAuth(a));
        db = fs.getFirestore(a); fb = fs;
        netLabel = 'online (Firebase)';
        return;
      } catch (err) { console.warn('Firebase falhou, usando modo local:', err); }
    }
    try {
      const saved = JSON.parse(localStorage.getItem('gridcity_edits') || '{}');
      for (const f in saved) { const [x, y, z] = f.split('_').map(Number); setBlock(x, y, z, saved[f], false); }
    } catch (_) {}
  },
  watch(ck) {
    if (!db || subs.has(ck)) return;
    const [cx, cz] = ck.split(',');
    subs.set(ck, fb.onSnapshot(fb.doc(db, 'chunks', cx + '_' + cz), snap => {
      const d = snap.data();
      if (!d) return;
      for (const f in d) { const [x, y, z] = f.split('_').map(Number); setBlock(x, y, z, d[f], false); }
    }));
  },
  unwatch(ck) { const u = subs.get(ck); if (u) { u(); subs.delete(ck); } },
  save(x, y, z, c) {
    if (db) {
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      fb.setDoc(fb.doc(db, 'chunks', cx + '_' + cz), { [`${x}_${y}_${z}`]: c }, { merge: true })
        .catch(e => console.warn('Erro ao salvar:', e));
    } else {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try { localStorage.setItem('gridcity_edits', JSON.stringify(Object.fromEntries(store))); } catch (_) {}
      }, 400);
    }
  },
};

/* ============================================================
   INTERAÇÃO: construir / destruir
   ============================================================ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), .5);
let mode = 'build', colorIdx = 0;

const cursor = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
  new THREE.LineBasicMaterial({ color: 0xffffff, fog: false }));
cursor.visible = false;
scene.add(cursor);

function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(chunkGroup.children, false)[0];
}
function hitPos(h) {
  h.object.getMatrixAt(h.instanceId, tmpM);
  return tmpV.setFromMatrixPosition(tmpM).clone();
}
function targetCell(e, destroy) {
  const h = pick(e);
  if (h) {
    const p = hitPos(h);
    if (destroy) return p;
    const n = h.face.normal;
    return p.add(new THREE.Vector3(Math.round(n.x), Math.round(n.y), Math.round(n.z)));
  }
  if (destroy) return null;
  const hit = raycaster.ray.intersectPlane(floorPlane, tmpV);   // buraco no chão
  return hit ? new THREE.Vector3(Math.round(hit.x), 0, Math.round(hit.z)) : null;
}

const el = renderer.domElement;
let down = null, lastMove = 0;
el.addEventListener('contextmenu', e => e.preventDefault());
el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button }; });
el.addEventListener('pointerup', e => {
  if (!down) return;
  const { x, y, t, b } = down; down = null;
  if (b === 1 || Math.hypot(e.clientX - x, e.clientY - y) > 6 || performance.now() - t > 400) return; // era arrasto
  const destroy = b === 2 || e.shiftKey || mode === 'destroy';
  const p = targetCell(e, destroy);
  if (!p) return;
  if (destroy) setBlock(p.x, p.y, p.z, -1);
  else if (!solid(p.x, p.y, p.z)) setBlock(p.x, p.y, p.z, colorIdx);
});
el.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || performance.now() - lastMove < 50) return;
  lastMove = performance.now();
  const p = e.buttons ? null : targetCell(e, mode === 'destroy' || e.shiftKey);
  cursor.visible = !!p;
  if (p) { cursor.position.copy(p); cursor.material.color.set(mode === 'destroy' || e.shiftKey ? 0xff2b4a : 0xffffff); }
});
el.addEventListener('pointerleave', () => { cursor.visible = false; });

/* UI */
const paletteEl = document.getElementById('palette');
const modeBtn = document.getElementById('mode');
PALETTE.forEach((hex, i) => {
  const b = document.createElement('button');
  b.className = 'sw' + (i === 0 ? ' on' : '');
  b.style.setProperty('--c', '#' + hex.toString(16).padStart(6, '0'));
  b.setAttribute('aria-label', 'Cor ' + (i + 1));
  b.onclick = () => selectColor(i);
  paletteEl.appendChild(b);
});
function selectColor(i) {
  colorIdx = i; mode = 'build'; syncUI();
}
function toggleMode() { mode = mode === 'build' ? 'destroy' : 'build'; syncUI(); }
function syncUI() {
  [...paletteEl.children].forEach((b, i) => b.classList.toggle('on', i === colorIdx && mode === 'build'));
  modeBtn.textContent = mode === 'build' ? 'Construir' : 'Destruir';
  modeBtn.classList.toggle('destroy', mode === 'destroy');
}
modeBtn.onclick = toggleMode;
addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= String(PALETTE.length)) selectColor(+e.key - 1);
  else if (e.key.toLowerCase() === 'x') toggleMode();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

/* ============================================================
   LOOP
   ============================================================ */
let frames = 0, lastHud = performance.now(), fps = 0;
function loop() {
  requestAnimationFrame(loop);
  controls.update();
  refreshChunks();
  pumpChunks();
  grid.position.x = camera.position.x;
  grid.position.z = camera.position.z;
  gridMat.uniforms.uCam.value.copy(controls.target);
  composer.render();

  frames++;
  const now = performance.now();
  if (now - lastHud > 500) {
    fps = Math.round(frames * 1000 / (now - lastHud)); frames = 0; lastHud = now;
    statusEl.textContent = `${netLabel} · ${totalInstances.toLocaleString('pt-BR')} blocos · ${fps} fps`;
  }
}

net.init().then(() => { syncUI(); loop(); });

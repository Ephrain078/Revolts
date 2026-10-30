import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
   REVOLTS · Light Cycle
   Arena 96x96 em células. Cada moto anda célula a célula e deixa
   uma parede de luz. Os prédios vêm de public/mapa_bit.json (Palmas).
   ============================================================ */
const N = 96, H = N / 2;
const COLORS = [0x00f0ff, 0xff7a00, 0xff2bd6, 0xffe600]; // jogador + 3 rivais
const SPAWNS = [[-34, -34, 1, 0], [34, 34, -1, 0], [-34, 34, 0, -1], [34, -34, 0, 1]];
const MAP_SCALE = 2.2; // coordenadas do mapa -> células
const FALLBACK = { chunks: { a: { bounds: { x: 0, z: 0 } }, b: { bounds: { x: 50, z: 50 } }, c: { bounds: { x: -50, z: -50 } },
  d: { bounds: { x: 100, z: 0 } }, e: { bounds: { x: 0, z: 100 } }, f: { bounds: { x: -100, z: 20 } }, g: { bounds: { x: 30, z: -80 } } } };

const $ = id => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const left = d => ({ x: d.z, z: -d.x }), right = d => ({ x: -d.z, z: d.x });
const inb = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
const wc = g => g - H + .5; // célula -> coordenada de mundo

/* ---------- cena ---------- */
const BG = 0x02050a;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, .011);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .1, 800);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .9, .5, .5));
composer.addPass(new OutputPass());

scene.add(new THREE.GridHelper(600, 600, 0x00f0ff, 0x053340));
const cageGeo = new THREE.BoxGeometry(N, 4, N);
const cage = new THREE.LineSegments(new THREE.EdgesGeometry(cageGeo), new THREE.LineBasicMaterial({ color: 0x00f0ff }));
cage.position.y = 2;
const cageFill = new THREE.Mesh(cageGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: .06, side: THREE.BackSide, depthWrite: false }));
cageFill.position.y = 2;
scene.add(cage, cageFill);

/* ---------- cidade (Palmas) ---------- */
const occ = new Uint8Array(N * N); // 0 livre · 255 prédio · 1..4 trilha da moto
const boxGeo = new THREE.BoxGeometry(1, 1, 1), boxEdges = new THREE.EdgesGeometry(boxGeo);
const bldMat = new THREE.MeshBasicMaterial({ color: 0x07131f }), edgeMat = new THREE.LineBasicMaterial({ color: 0x00b8d4 });

function addBuilding(cx, cz, w, d, h) {
  const x0 = cx - (w >> 1), z0 = cz - (d >> 1);
  if (x0 < 1 || z0 < 1 || x0 + w > N - 1 || z0 + d > N - 1) return;
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) occ[z * N + x] = 255;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(boxGeo, bldMat), new THREE.LineSegments(boxEdges, edgeMat));
  g.scale.set(w, h, d);
  g.position.set(wc(x0) + (w - 1) / 2, h / 2, wc(z0) + (d - 1) / 2);
  scene.add(g);
}
const ready = (async () => {
  let data;
  try { data = await (await fetch('public/mapa_bit.json')).json(); } catch (_) { data = FALLBACK; }
  Object.values(data.chunks).forEach((c, i) => {
    const gx = Math.round(c.bounds.x / MAP_SCALE) + H, gz = Math.round(c.bounds.z / MAP_SCALE) + H;
    addBuilding(gx, gz, 3, 3, 6 + ((i * 37 + 11) % 9));
    addBuilding(gx + 5, gz + 2, 2, 2, 3 + (i % 4));
    addBuilding(gx - 4, gz - 3, 2, 2, 4 + (i % 3));
  });
})();

/* ---------- partículas ---------- */
const P = 500, pPos = new Float32Array(P * 3).fill(-1000), pCol = new Float32Array(P * 3), pVel = new Float32Array(P * 3), pLife = new Float32Array(P);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
points.frustumCulled = false;
scene.add(points);
let pi = 0;
function burst(x, z, color) {
  const c = new THREE.Color(color);
  for (let n = 0; n < 60; n++) {
    const i = pi++ % P;
    pPos.set([x, .6, z], i * 3);
    pVel.set([(Math.random() - .5) * 16, 2 + Math.random() * 9, (Math.random() - .5) * 16], i * 3);
    pCol.set([c.r, c.g, c.b], i * 3);
    pLife[i] = 1;
  }
}
function stepParticles(dt) {
  for (let i = 0; i < P; i++) {
    if (pLife[i] <= 0) continue;
    const k = i * 3;
    pPos[k] += pVel[k] * dt; pPos[k + 1] += pVel[k + 1] * dt; pPos[k + 2] += pVel[k + 2] * dt;
    pVel[k + 1] -= 18 * dt;
    if (pPos[k + 1] < 0) { pPos[k + 1] = 0; pVel[k + 1] *= -.4; }
    if ((pLife[i] -= dt * .9) <= 0) pPos[k + 1] = -1000;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

/* ---------- motos ---------- */
const WALL_CAP = 3000;
class Bike {
  constructor(id, color, isPlayer) {
    Object.assign(this, { id, color, isPlayer, alive: false, queue: [], yaw: 0, gx: 0, gz: 0, pgx: 0, pgz: 0 });
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.55, .45, 1.5), new THREE.MeshBasicMaterial({ color: 0x04080d }));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.6, .12, 1.55), new THREE.MeshBasicMaterial({ color }));
    strip.position.y = .3;
    this.mesh.add(body, strip);
    this.mesh.visible = false;
    this.walls = new THREE.InstancedMesh(boxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85 }), WALL_CAP);
    this.walls.frustumCulled = false;
    this.walls.count = 0;
    scene.add(this.mesh, this.walls);
  }
  reset(x, z, dx, dz) {
    this.gx = this.pgx = H + x; this.gz = this.pgz = H + z;
    this.dir = this.lastDir = { x: dx, z: dz };
    this.yaw = Math.atan2(dx, dz);
    this.queue = []; this.alive = true; this.walls.count = 0; this.mesh.visible = true;
    occ[this.gz * N + this.gx] = this.id;
    this.wall(this.dir);
  }
  wall(d) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(wc(this.gx), .6, wc(this.gz)), new THREE.Quaternion(),
      new THREE.Vector3(d.x ? 1.02 : .16, 1.2, d.z ? 1.02 : .16));
    if (this.walls.count < WALL_CAP) this.walls.setMatrixAt(this.walls.count++, m);
    this.walls.instanceMatrix.needsUpdate = true;
  }
  free(d) { // quantas células livres existem à frente nessa direção
    let n = 0, x = this.gx + d.x, z = this.gz + d.z;
    while (n < 16 && inb(x, z) && occ[z * N + x] === 0) { n++; x += d.x; z += d.z; }
    return n;
  }
  steer() {
    if (this.isPlayer) {
      const t = this.queue.shift();
      if (t) this.dir = t === 'L' ? left(this.dir) : right(this.dir);
      return;
    }
    const L = left(this.dir), R = right(this.dir), ahead = this.free(this.dir), fl = this.free(L), fr = this.free(R);
    if (ahead <= 3 || (Math.random() < .012 && Math.max(fl, fr) > 8)) {
      if (fl === 0 && fr === 0) return;
      this.dir = fl === fr ? (Math.random() < .5 ? L : R) : fl > fr ? L : R;
    }
  }
  advance() {
    this.pgx = this.gx; this.pgz = this.gz;
    this.gx = this.nx; this.gz = this.nz;
    occ[this.gz * N + this.gx] = this.id;
    if (this.lastDir.x !== this.dir.x || this.lastDir.z !== this.dir.z) this.wall(this.lastDir); // preenche a quina
    this.wall(this.dir);
    this.lastDir = this.dir;
  }
  kill() {
    this.alive = false; this.mesh.visible = false; this.walls.count = 0;
    for (let i = 0; i < occ.length; i++) if (occ[i] === this.id) occ[i] = 0; // a trilha se desfaz
    burst(wc(this.gx), wc(this.gz), this.color);
  }
  update(alpha, dt) {
    if (!this.alive) return;
    this.mesh.position.set(lerp(wc(this.pgx), wc(this.gx), alpha), .35, lerp(wc(this.pgz), wc(this.gz), alpha));
    let dy = Math.atan2(this.dir.x, this.dir.z) - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 14);
    this.mesh.rotation.y = this.yaw;
  }
}
const bikes = COLORS.map((c, i) => new Bike(i + 1, c, i === 0));
const player = bikes[0];

/* ---------- jogo ---------- */
let state = 'menu', acc = 0, time = 0, kills = 0, snap = false, last = performance.now();
const tickDur = () => Math.max(.06, .1 - time * .0004); // acelera aos poucos
const score = () => Math.floor(time * 10) + kills * 100;
let best = 0;
try { best = +localStorage.getItem('revolts_best') || 0; } catch (_) {}

function tick() {
  const live = bikes.filter(b => b.alive), dead = new Set();
  live.forEach(b => { b.steer(); b.nx = b.gx + b.dir.x; b.nz = b.gz + b.dir.z; });
  live.forEach(b => { if (!inb(b.nx, b.nz) || occ[b.nz * N + b.nx] !== 0) dead.add(b); });
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++)
    if (live[i].nx === live[j].nx && live[i].nz === live[j].nz) { dead.add(live[i]); dead.add(live[j]); } // colisão frontal
  live.forEach(b => { if (!dead.has(b)) b.advance(); });
  dead.forEach(b => { b.kill(); if (!b.isPlayer) kills++; });
  const rivals = bikes.filter(b => !b.isPlayer && b.alive).length;
  if (!player.alive) endGame(false); else if (!rivals) endGame(true);
}
function endGame(win) {
  state = 'over';
  document.body.classList.remove('play');
  const s = score() + (win ? 500 : 0);
  if (s > best) { best = s; try { localStorage.setItem('revolts_best', best); } catch (_) {} }
  setTimeout(() => show(win ? 'VITÓRIA' : 'DEREZZED', `Pontos: ${s}<br>Recorde: ${best}`, 'Jogar de novo'), 900);
}
function show(t, msg, btn) { $('ttl').textContent = t; $('msg').innerHTML = msg; $('go').textContent = btn; $('screen').classList.remove('hide'); }

async function start() {
  await ready;
  for (let i = 0; i < occ.length; i++) if (occ[i] !== 255) occ[i] = 0;
  bikes.forEach((b, i) => b.reset(...SPAWNS[i]));
  state = 'play'; acc = time = kills = 0; snap = true;
  $('screen').classList.add('hide');
  document.body.classList.add('play');
}

/* ---------- controles ---------- */
const turn = t => { if (state === 'play' && player.queue.length < 2) player.queue.push(t); };
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') turn('L');
  else if (k === 'arrowright' || k === 'd') turn('R');
  else if (k === 'enter' && state !== 'play') start();
});
$('bl').addEventListener('pointerdown', e => { e.preventDefault(); turn('L'); });
$('br').addEventListener('pointerdown', e => { e.preventDefault(); turn('R'); });
$('go').addEventListener('click', start);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

/* ---------- câmera e loop ---------- */
const want = new THREE.Vector3(), look = new THREE.Vector3();
function updateCamera(dt) {
  if (player.alive && state === 'play') {
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), p = player.mesh.position;
    want.set(p.x - fx * 10, 6.5, p.z - fz * 10);
    if (snap) { camera.position.copy(want); snap = false; } else camera.position.lerp(want, 1 - Math.exp(-5 * dt));
    camera.lookAt(look.set(p.x + fx * 8, 1, p.z + fz * 8));
  } else { // menu / espectador: órbita sobre a arena
    const t = performance.now() / 1000 * .12;
    camera.position.set(Math.cos(t) * 72, 40, Math.sin(t) * 72);
    camera.lookAt(0, 0, 0);
  }
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (state === 'play') {
    time += dt; acc += dt;
    let td = tickDur();
    while (acc >= td && state === 'play') { acc -= td; tick(); td = tickDur(); }
  }
  const alpha = state === 'play' ? Math.min(1, acc / tickDur()) : 1;
  bikes.forEach(b => b.update(alpha, dt));
  stepParticles(dt);
  updateCamera(dt);
  $('stat').textContent = state === 'play' ? `${score()} pts · ${bikes.filter(b => !b.isPlayer && b.alive).length} rivais` : `recorde ${best}`;
  composer.render();
}
requestAnimationFrame(loop);

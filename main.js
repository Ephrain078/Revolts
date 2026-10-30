import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ═══════════════════════════════════════════════════════════════
   CONFIGURAÇÃO GLOBAL
   ═══════════════════════════════════════════════════════════════ */
const CFG = {
  chunkSize: 100,
  chunkRes: 20,
  viewDist: 4,
  gridSize: 5,
  fogColor: 0x000208,
  fogDensity: 0.007,
  minSpeed: 6,
  cruiseSpeed: 16,
  maxSpeed: 46,
  turnDuration: 0.16,
  trailLength: 220,
};

/* ═══════════════════════════════════════════════════════════════
   NOISE (VALUE NOISE 2D, MULTI-OITAVA)
   ═══════════════════════════════════════════════════════════════ */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

function terrainHeight(x, z) {
  let h = 0;
  h += valueNoise(x * 0.0075, z * 0.0075) * 34;
  h += valueNoise(x * 0.021, z * 0.021) * 11;
  h += valueNoise(x * 0.058, z * 0.058) * 3.2;
  h += valueNoise(x * 0.17, z * 0.17) * 0.7;
  return h - 24;
}

function zoneColorAt(x, z) {
  const t = valueNoise(x * 0.0012 + 32.1, z * 0.0012 + 11.7);
  const t2 = valueNoise(x * 0.0005 + 100, z * 0.0005 + 200);
  const cyan = new THREE.Color(0x00f0ff);
  const magenta = new THREE.Color(0xff00d0);
  const amber = new THREE.Color(0xffa020);
  const base = cyan.clone().lerp(magenta, t);
  return base.lerp(amber, Math.max(0, (t2 - 0.65)) * 2);
}

function zoneNameAt(x, z) {
  const t = valueNoise(x * 0.0012 + 32.1, z * 0.0012 + 11.7);
  if (t < 0.3) return 'Ciano';
  if (t < 0.55) return 'Ciano-Magenta';
  if (t < 0.75) return 'Magenta';
  return 'Âmbar';
}

/* ═══════════════════════════════════════════════════════════════
   RENDERER / SCENE / CAMERA
   ═══════════════════════════════════════════════════════════════ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CFG.fogColor, CFG.fogDensity);
scene.background = new THREE.Color(CFG.fogColor);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.5, 900);
camera.position.set(0, 12, 14);
camera.lookAt(0, 0, 0);

/* ─── Iluminação ─── */
scene.add(new THREE.AmbientLight(0x335577, 0.55));
scene.add(new THREE.HemisphereLight(0x00ccee, 0xff00aa, 0.35));
const dirLight = new THREE.DirectionalLight(0x88ffff, 0.6);
dirLight.position.set(80, 140, 60);
scene.add(dirLight);

/* ─── Pós-processamento (Bloom) ─── */
const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.15,
  0.55,
  0.35
);
composer.addPass(bloom);

/* ═══════════════════════════════════════════════════════════════
   SHADER DO TERRENO (GRID NEON + FOG)
   ═══════════════════════════════════════════════════════════════ */
const terrainVert = /* glsl */ `
  attribute vec3 zoneColor;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vZoneColor;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vZoneColor = zoneColor;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const terrainFrag = /* glsl */ `
  precision highp float;
  uniform float uGridSize;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vZoneColor;

  float gridLine(float coord, float spacing) {
    float f = abs(fract(coord / spacing) - 0.5);
    return smoothstep(0.47, 0.5, f);
  }

  void main() {
    vec2 xz = vWorldPos.xz;
    float g1 = max(gridLine(xz.x, uGridSize), gridLine(xz.y, uGridSize));
    float g5 = max(gridLine(xz.x, uGridSize * 5.0), gridLine(xz.y, uGridSize * 5.0));

    // base muito escura (asfalto digital)
    vec3 color = vec3(0.004, 0.008, 0.018);

    // pulso nas linhas (leve)
    float pulse = 0.85 + 0.15 * sin(uTime * 2.0 + xz.x * 0.05 + xz.y * 0.05);

    // emissão do grid
    vec3 emissive = vZoneColor * (g1 * 1.6 * pulse + g5 * 3.2 * pulse);

    // brilho nas encostas
    float slope = 1.0 - abs(vNormalW.y);
    emissive += vZoneColor * slope * 0.35;

    color += emissive;

    // fog exponencial
    float dist = length(vWorldPos - cameraPosition);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const terrainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uGridSize: { value: CFG.gridSize },
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(CFG.fogColor) },
    uFogDensity: { value: CFG.fogDensity },
  },
  vertexShader: terrainVert,
  fragmentShader: terrainFrag,
});

/* ═══════════════════════════════════════════════════════════════
   SISTEMA DE CHUNKS INFINITOS
   ═══════════════════════════════════════════════════════════════ */
const chunks = new Map(); // key = "cx,cz" -> { mesh }

function buildChunkGeometry(cx, cz) {
  const size = CFG.chunkSize;
  const res = CFG.chunkRes;
  const geo = new THREE.PlaneGeometry(size, size, res, res);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const baseX = cx * size + size / 2;
  const baseZ = cz * size + size / 2;

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + baseX;
    const wz = pos.getZ(i) + baseZ;
    pos.setX(i, wx);
    pos.setZ(i, wz);
    pos.setY(i, terrainHeight(wx, wz));

    const c = zoneColorAt(wx, wz);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('zoneColor', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function createChunk(cx, cz) {
  const geo = buildChunkGeometry(cx, cz);
  const mesh = new THREE.Mesh(geo, terrainMaterial);
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);
  return { mesh };
}

function updateChunks(px, pz) {
  const pcx = Math.floor(px / CFG.chunkSize);
  const pcz = Math.floor(pz / CFG.chunkSize);
  const needed = new Set();
  const d = CFG.viewDist;

  for (let dx = -d; dx <= d; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      // Círculo aproximado para economizar chunks
      if (dx * dx + dz * dz > d * d + d) continue;
      needed.add(`${pcx + dx},${pcz + dz}`);
    }
  }

  // remover chunks fora de alcance
  for (const [key, chunk] of chunks) {
    if (!needed.has(key)) {
      scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunks.delete(key);
    }
  }

  // criar faltantes
  for (const key of needed) {
    if (!chunks.has(key)) {
      const [cx, cz] = key.split(',').map(Number);
      chunks.set(key, createChunk(cx, cz));
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   LIGHT CYCLE (MOTO DE LUZ)
   ═══════════════════════════════════════════════════════════════ */
function buildLightCycle() {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x080812,
    metalness: 0.95,
    roughness: 0.25,
    emissive: 0x001a22,
    emissiveIntensity: 0.4,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const glowMagenta = new THREE.MeshBasicMaterial({ color: 0xff00d0 });

  // corpo
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 2.6), bodyMat);
  body.position.y = 0.65;
  g.add(body);

  // carenagem dianteira
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.35, 0.8), bodyMat);
  nose.position.set(0, 0.55, 1.55);
  g.add(nose);

  // rodas (cilindros no eixo X)
  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.28, 20);
  wheelGeo.rotateZ(Math.PI / 2);

  const w1 = new THREE.Mesh(wheelGeo, bodyMat);
  w1.position.set(0, 0.55, 1.0);
  g.add(w1);

  const w2 = new THREE.Mesh(wheelGeo, bodyMat);
  w2.position.set(0, 0.55, -1.0);
  g.add(w2);

  // aros de neon
  const ringGeo = new THREE.TorusGeometry(0.55, 0.035, 8, 28);
  ringGeo.rotateY(Math.PI / 2);

  const r1 = new THREE.Mesh(ringGeo, glowMat);
  r1.position.copy(w1.position);
  g.add(r1);

  const r2 = new THREE.Mesh(ringGeo, glowMagenta);
  r2.position.copy(w2.position);
  g.add(r2);

  // piloto
  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.55), bodyMat);
  rider.position.set(0, 1.35, -0.15);
  g.add(rider);

  // listras laterais
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.6), glowMat);
  strip.position.set(0.47, 0.65, 0);
  g.add(strip);

  const strip2 = strip.clone();
  strip2.material = glowMagenta;
  strip2.position.x = -0.47;
  g.add(strip2);

  // farol
  const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  headlight.position.set(0, 0.7, 1.95);
  g.add(headlight);

  return g;
}

const bike = buildLightCycle();
scene.add(bike);

/* ═══════════════════════════════════════════════════════════════
   RASTRO (TRAIL) DE NEON
   ═══════════════════════════════════════════════════════════════ */
const trailPts = new Float32Array(CFG.trailLength * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPts, 3));
trailGeo.setDrawRange(0, 0);
const trailMat = new THREE.LineBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.85,
});
const trailLine = new THREE.Line(trailGeo, trailMat);
trailLine.frustumCulled = false;
scene.add(trailLine);

let trailCount = 0;

function pushTrailPoint(x, y, z) {
  // desloca 1 ponto
  for (let i = CFG.trailLength - 1; i > 0; i--) {
    trailPts[i * 3] = trailPts[(i - 1) * 3];
    trailPts[i * 3 + 1] = trailPts[(i - 1) * 3 + 1];
    trailPts[i * 3 + 2] = trailPts[(i - 1) * 3 + 2];
  }
  trailPts[0] = x;
  trailPts[1] = y;
  trailPts[2] = z;
  trailCount = Math.min(trailCount + 1, CFG.trailLength);
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.setDrawRange(0, trailCount);
}

/* ═══════════════════════════════════════════════════════════════
   ESTADO DO JOGADOR / CONTROLES
   ═══════════════════════════════════════════════════════════════ */
const state = {
  x: 0,
  z: 0,
  y: 0,
  yaw: 0,
  targetYaw: 0,
  turnStartYaw: 0,
  turning: false,
  turnProgress: 0,
  speed: CFG.cruiseSpeed,
  targetSpeed: CFG.cruiseSpeed,
  started: false,
};

const keys = { forward: false, backward: false, left: false, right: false };

function requestTurn(dir) {
  if (!state.started) return;
  if (state.turning) return;
  state.turning = true;
  state.turnProgress = 0;
  state.turnStartYaw = state.yaw;
  state.targetYaw = state.yaw + (dir * Math.PI) / 2;
}

/* ─── Teclado ─── */
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.forward = true;
  else if (k === 's' || k === 'arrowdown') keys.backward = true;
  else if (k === 'a' || k === 'arrowleft') requestTurn(1);
  else if (k === 'd' || k === 'arrowright') requestTurn(-1);
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.forward = false;
  else if (k === 's' || k === 'arrowdown') keys.backward = false;
});

/* ─── Touch ─── */
function bindTouch(id, onDown, onUp) {
  const el = document.getElementById(id);
  if (!el) return;
  const down = (e) => {
    e.preventDefault();
    el.classList.add('active');
    onDown();
  };
  const up = (e) => {
    e.preventDefault();
    el.classList.remove('active');
    onUp();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}

bindTouch('btnLeft', () => requestTurn(1), () => {});
bindTouch('btnRight', () => requestTurn(-1), () => {});
bindTouch('btnGas', () => (keys.forward = true), () => (keys.forward = false));
bindTouch('btnBrake', () => (keys.backward = true), () => (keys.backward = false));

/* ═══════════════════════════════════════════════════════════════
   UPDATE DO JOGADOR
   ═══════════════════════════════════════════════════════════════ */
function updatePlayer(dt) {
  if (!state.started) return;

  // velocidade alvo
  if (keys.forward) state.targetSpeed = Math.min(state.targetSpeed + 34 * dt, CFG.maxSpeed);
  else if (keys.backward) state.targetSpeed = Math.max(state.targetSpeed - 42 * dt, CFG.minSpeed);
  else {
    // retorno suave ao cruzeiro
    const delta = CFG.cruiseSpeed - state.targetSpeed;
    state.targetSpeed += THREE.MathUtils.clamp(delta, -12 * dt, 12 * dt);
  }
  state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 6);

  // rotação (lerp de 90°)
  if (state.turning) {
    state.turnProgress += dt / CFG.turnDuration;
    if (state.turnProgress >= 1) {
      state.turnProgress = 1;
      state.turning = false;
      state.yaw = state.targetYaw;
    }
    const t = 1 - Math.pow(1 - state.turnProgress, 3);
    state.yaw = state.turnStartYaw + (state.targetYaw - state.turnStartYaw) * t;
  }

  // deslocamento no plano XZ
  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);
  state.x += sinY * state.speed * dt;
  state.z += cosY * state.speed * dt;

  // altura segue o terreno
  const groundY = terrainHeight(state.x, state.z);
  state.y += (groundY - state.y) * Math.min(1, dt * 12);

  bike.position.set(state.x, state.y, state.z);

  // orientação inclinada ao relevo
  const S = 1.6;
  const fwdX = sinY, fwdZ = cosY;
  const rgtX = fwdZ, rgtZ = -fwdX;

  const hF = terrainHeight(state.x + fwdX * S, state.z + fwdZ * S);
  const hB = terrainHeight(state.x - fwdX * S, state.z - fwdZ * S);
  const hL = terrainHeight(state.x + rgtX * S, state.z + rgtZ * S);
  const hR = terrainHeight(state.x - rgtX * S, state.z - rgtZ * S);

  const pitch = Math.atan2(hF - hB, 2 * S);
  const roll = Math.atan2(hL - hR, 2 * S);

  bike.rotation.order = 'YXZ';
  bike.rotation.y = state.yaw;
  bike.rotation.x = pitch;
  bike.rotation.z = -roll;

  // trail
  pushTrailPoint(state.x, state.y + 0.15, state.z);

  // cor do trail pela zona atual
  const zc = zoneColorAt(state.x, state.z);
  trailMat.color.copy(zc);
}

/* ═══════════════════════════════════════════════════════════════
   CÂMERA (TERCEIRA PESSOA COM LERP)
   ═══════════════════════════════════════════════════════════════ */
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const camLookAt = new THREE.Vector3();

function updateCamera(dt) {
  const back = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const dist = 9 + (state.speed / CFG.maxSpeed) * 3;
  const height = 4.5;

  camDesired.copy(bike.position).addScaledVector(back, dist);
  camDesired.y = bike.position.y + height;

  // não atravessar o terreno
  const camGround = terrainHeight(camDesired.x, camDesired.z);
  camDesired.y = Math.max(camDesired.y, camGround + 2.2);

  const lerp = 1 - Math.pow(0.0008, dt);
  camera.position.lerp(camDesired, lerp);

  camLookAt.copy(bike.position);
  camLookAt.y += 1.4;
  camera.lookAt(camLookAt);
}

/* ═══════════════════════════════════════════════════════════════
   HUD
   ═══════════════════════════════════════════════════════════════ */
const elSpeed = document.getElementById('speed');
const elCoords = document.getElementById('coords');
const elZone = document.getElementById('zone');
const elFill = document.getElementById('speedfill');
const elFps = document.getElementById('fps');

let hudAcc = 0;
function updateHUD(dt) {
  hudAcc += dt;
  if (hudAcc < 0.1) return;
  hudAcc = 0;

  elSpeed.textContent = Math.round(state.speed * 3.6 * 1.6); // estilizado
  elCoords.textContent = `${Math.round(state.x)}, ${Math.round(state.z)}`;
  elZone.textContent = zoneNameAt(state.x, state.z);
  elFill.style.width = `${(state.speed / CFG.maxSpeed) * 100}%`;
}

/* ═══════════════════════════════════════════════════════════════
   RESIZE
   ═══════════════════════════════════════════════════════════════ */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* ═══════════════════════════════════════════════════════════════
   LOOP PRINCIPAL
   ═══════════════════════════════════════════════════════════════ */
const clock = new THREE.Clock();
let fpsAccum = 0, fpsFrames = 0, currentFps = 60;

// inicialização do mundo (chunks iniciais)
updateChunks(0, 0);
state.y = terrainHeight(0, 0);
bike.position.set(0, state.y, 0);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updatePlayer(dt);
  updateCamera(dt);
  updateChunks(state.x, state.z);
  updateHUD(dt);

  // tempo no shader
  terrainMaterial.uniforms.uTime.value += dt;

  // FPS
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    elFps.textContent = `${currentFps} FPS`;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  composer.render();
}

/* ═══════════════════════════════════════════════════════════════
   START / ÁUDIO / UI
   ═══════════════════════════════════════════════════════════════ */
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const muteBtn = document.getElementById('muteBtn');

let audioCtx = null;
let muted = false;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // drone ambiente
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    gain.gain.value = 0.02;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
  } catch (e) { /* silencioso */ }
}

startBtn.addEventListener('click', () => {
  state.started = true;
  overlay.classList.add('hidden');
  initAudio();
  clock.start();
  requestAnimationFrame(animate);
});

muteBtn.addEventListener('click', () => {
  muted = !muted;
  if (audioCtx) audioCtx.suspend().then(() => {
    if (!muted) audioCtx.resume();
  });
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', muted);
});

// garante que canvas não roube gestos
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

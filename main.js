import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ═══════════════════════════════════════════════════════════════
   CONFIGURAÇÃO
   ═══════════════════════════════════════════════════════════════ */
const CFG = {
  chunkSize: 100,
  viewDist: 4,
  gridSize: 5,
  fogColor: 0x000208,
  fogDensity: 0.0085,
  minSpeed: 6,
  cruiseSpeed: 18,
  maxSpeed: 48,
  turnDuration: 0.18,
  trailLength: 260,
  neon: 0x00f0ff,
};

/* ═══════════════════════════════════════════════════════════════
   RENDERER / CENA / CÂMERA
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

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 900);
camera.position.set(0, 3.6, -9);
camera.lookAt(0, 1.4, 0);

scene.add(new THREE.AmbientLight(0x224466, 0.55));
const hemi = new THREE.HemisphereLight(0x00ccee, 0x001122, 0.5);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0x88ffff, 0.7);
dirLight.position.set(60, 100, 40);
scene.add(dirLight);

/* Pós-processamento (bloom) */
const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.25,
  0.6,
  0.3
);
composer.addPass(bloom);

/* ═══════════════════════════════════════════════════════════════
   SHADER DO TERRENO PLANO (grid neon ciano)
   ═══════════════════════════════════════════════════════════════ */
const terrainVert = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const terrainFrag = /* glsl */ `
  precision highp float;
  uniform float uGridSize;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uNeonColor;
  varying vec3 vWorldPos;

  float gridLine(float coord, float spacing) {
    float f = abs(fract(coord / spacing) - 0.5);
    return smoothstep(0.46, 0.5, f);
  }

  void main() {
    vec2 xz = vWorldPos.xz;

    float g1 = max(gridLine(xz.x, uGridSize),        gridLine(xz.y, uGridSize));
    float g5 = max(gridLine(xz.x, uGridSize * 5.0),  gridLine(xz.y, uGridSize * 5.0));

    vec3 color = vec3(0.004, 0.008, 0.018);

    // pulso global
    float pulse = 0.85 + 0.15 * sin(uTime * 2.0);

    // onda radial emanando do jogador
    float d = length(xz - cameraPosition.xz);
    float wave = 0.85 + 0.25 * sin(d * 0.06 - uTime * 2.2);

    vec3 emissive =
      uNeonColor * (g1 * 1.7 * pulse * wave + g5 * 3.4 * pulse * wave);

    color += emissive;

    // fog
    float dist = length(vWorldPos - cameraPosition);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const terrainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uGridSize:   { value: CFG.gridSize },
    uTime:       { value: 0 },
    uFogColor:   { value: new THREE.Color(CFG.fogColor) },
    uFogDensity: { value: CFG.fogDensity },
    uNeonColor:  { value: new THREE.Color(CFG.neon) },
  },
  vertexShader: terrainVert,
  fragmentShader: terrainFrag,
});

/* ═══════════════════════════════════════════════════════════════
   CHUNKS INFINITOS (geometria compartilhada)
   ═══════════════════════════════════════════════════════════════ */
const sharedChunkGeo = new THREE.PlaneGeometry(CFG.chunkSize, CFG.chunkSize, 2, 2);
sharedChunkGeo.rotateX(-Math.PI / 2);

const chunks = new Map();

function createChunk(cx, cz) {
  const mesh = new THREE.Mesh(sharedChunkGeo, terrainMaterial);
  mesh.position.set(cx * CFG.chunkSize, 0, cz * CFG.chunkSize);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);
  return { mesh };
}

function updateChunks(px, pz) {
  const pcx = Math.floor(px / CFG.chunkSize + 0.5);
  const pcz = Math.floor(pz / CFG.chunkSize + 0.5);
  const needed = new Set();
  const d = CFG.viewDist;

  for (let dx = -d; dx <= d; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      if (dx * dx + dz * dz > d * d + d) continue;
      needed.add(`${pcx + dx},${pcz + dz}`);
    }
  }

  for (const [key, chunk] of chunks) {
    if (!needed.has(key)) {
      scene.remove(chunk.mesh);
      chunks.delete(key);
    }
  }

  for (const key of needed) {
    if (!chunks.has(key)) {
      const [cx, cz] = key.split(',').map(Number);
      chunks.set(key, createChunk(cx, cz));
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   LIGHT CYCLE (apenas neon ciano)
   ═══════════════════════════════════════════════════════════════ */
function buildLightCycle() {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x05070d,
    metalness: 0.95,
    roughness: 0.28,
    emissive: 0x001118,
    emissiveIntensity: 0.5,
  });
  const glow = new THREE.MeshBasicMaterial({ color: CFG.neon });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 2.6), bodyMat);
  body.position.y = 0.65;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.35, 0.8), bodyMat);
  nose.position.set(0, 0.55, 1.55);
  g.add(nose);

  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.28, 20);
  wheelGeo.rotateZ(Math.PI / 2);

  const w1 = new THREE.Mesh(wheelGeo, bodyMat);
  w1.position.set(0, 0.55, 1.0);
  g.add(w1);

  const w2 = new THREE.Mesh(wheelGeo, bodyMat);
  w2.position.set(0, 0.55, -1.0);
  g.add(w2);

  const ringGeo = new THREE.TorusGeometry(0.55, 0.04, 8, 28);
  ringGeo.rotateY(Math.PI / 2);

  const r1 = new THREE.Mesh(ringGeo, glow);
  r1.position.copy(w1.position);
  g.add(r1);

  const r2 = new THREE.Mesh(ringGeo, glow);
  r2.position.copy(w2.position);
  g.add(r2);

  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.55), bodyMat);
  rider.position.set(0, 1.35, -0.15);
  g.add(rider);

  const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.6), glow);
  stripL.position.set(0.47, 0.65, 0);
  g.add(stripL);

  const stripR = stripL.clone();
  stripR.position.x = -0.47;
  g.add(stripR);

  const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  headlight.position.set(0, 0.7, 1.95);
  g.add(headlight);

  // halo traseiro (efeito glow adicional)
  const tail = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 6, 6),
    new THREE.MeshBasicMaterial({ color: CFG.neon })
  );
  tail.position.set(0, 0.7, -1.35);
  g.add(tail);

  return g;
}

const bike = buildLightCycle();
scene.add(bike);

/* ═══════════════════════════════════════════════════════════════
   TRAIL DE NEON
   ═══════════════════════════════════════════════════════════════ */
const trailPts = new Float32Array(CFG.trailLength * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPts, 3));
trailGeo.setDrawRange(0, 0);
const trailMat = new THREE.LineBasicMaterial({
  color: CFG.neon,
  transparent: true,
  opacity: 0.95,
});
const trailLine = new THREE.Line(trailGeo, trailMat);
trailLine.frustumCulled = false;
scene.add(trailLine);

let trailCount = 0;

function pushTrailPoint(x, z) {
  for (let i = CFG.trailLength - 1; i > 0; i--) {
    trailPts[i * 3]     = trailPts[(i - 1) * 3];
    trailPts[i * 3 + 1] = trailPts[(i - 1) * 3 + 1];
    trailPts[i * 3 + 2] = trailPts[(i - 1) * 3 + 2];
  }
  trailPts[0] = x;
  trailPts[1] = 0.12;
  trailPts[2] = z;
  trailCount = Math.min(trailCount + 1, CFG.trailLength);
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.setDrawRange(0, trailCount);
}

/* ═══════════════════════════════════════════════════════════════
   ESTADO / CONTROLES
   ═══════════════════════════════════════════════════════════════ */
const state = {
  x: 0, z: 0, yaw: 0,
  targetYaw: 0, turnStartYaw: 0,
  turning: false, turnProgress: 0,
  lean: 0,
  speed: CFG.cruiseSpeed,
  targetSpeed: CFG.cruiseSpeed,
  started: false,
};

const keys = { forward: false, backward: false };

function requestTurn(dir) {
  if (!state.started || state.turning) return;
  state.turning = true;
  state.turnProgress = 0;
  state.turnStartYaw = state.yaw;
  state.targetYaw = state.yaw + (dir * Math.PI) / 2;
}

/* Teclado */
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

/* ═══════════════════════════════════════════════════════════════
   JOYSTICK ANALÓGICO (MIR4-style)
   ═══════════════════════════════════════════════════════════════ */
const joystick = document.getElementById('joystick');
const knob = document.getElementById('joystickKnob');

const joy = {
  active: false,
  cx: 0, cy: 0,
  radius: 50,
  dx: 0, dy: 0, // normalizados -1..1
};

const TURN_THRESHOLD = 0.55;
const TURN_RESET = 0.35;
let turnAxis = null; // 'left' | 'right' | null

function joyStart(e) {
  const r = joystick.getBoundingClientRect();
  joy.cx = r.left + r.width / 2;
  joy.cy = r.top + r.height / 2;
  joy.radius = (r.width - 60) / 2;
  joy.active = true;
  joystick.classList.add('active');
  joyMove(e.clientX, e.clientY);
}

function joyMove(px, py) {
  if (!joy.active) return;
  let dx = px - joy.cx;
  let dy = py - joy.cy;
  const dist = Math.hypot(dx, dy);
  if (dist > joy.radius) {
    dx = (dx / dist) * joy.radius;
    dy = (dy / dist) * joy.radius;
  }
  joy.dx = dx / joy.radius;
  joy.dy = -dy / joy.radius; // cima = positivo
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function joyEnd() {
  if (!joy.active) return;
  joy.active = false;
  joy.dx = 0;
  joy.dy = 0;
  joystick.classList.remove('active');
  knob.style.transform = '';
  turnAxis = null;
}

joystick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { joystick.setPointerCapture(e.pointerId); } catch (_) {}
  joyStart(e);
});
joystick.addEventListener('pointermove', (e) => {
  if (joy.active) joyMove(e.clientX, e.clientY);
});
joystick.addEventListener('pointerup', joyEnd);
joystick.addEventListener('pointercancel', joyEnd);
joystick.addEventListener('lostpointercapture', joyEnd);

/* ═══════════════════════════════════════════════════════════════
   UPDATE DO JOGADOR
   ═══════════════════════════════════════════════════════════════ */
function updatePlayer(dt) {
  if (!state.started) return;

  // ── Velocidade ──
  const accelInput = keys.forward || joy.dy > 0.3;
  const brakeInput = keys.backward || joy.dy < -0.3;

  if (accelInput) {
    state.targetSpeed = Math.min(state.targetSpeed + 34 * dt, CFG.maxSpeed);
  } else if (brakeInput) {
    state.targetSpeed = Math.max(state.targetSpeed - 42 * dt, CFG.minSpeed);
  } else {
    const delta = CFG.cruiseSpeed - state.targetSpeed;
    state.targetSpeed += THREE.MathUtils.clamp(delta, -12 * dt, 12 * dt);
  }
  state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 6);

  // ── Rotação (90° suave) ──
  if (state.turning) {
    state.turnProgress += dt / CFG.turnDuration;
    if (state.turnProgress >= 1) {
      state.turnProgress = 1;
      state.turning = false;
      state.yaw = state.targetYaw;
    }
    const t = 1 - Math.pow(1 - state.turnProgress, 3);
    state.yaw = state.turnStartYaw + (state.targetYaw - state.turnStartYaw) * t;

    // lean (inclinação lateral visual)
    const dir = Math.sign(state.targetYaw - state.turnStartYaw);
    state.lean = -dir * Math.sin(state.turnProgress * Math.PI) * 0.35;
  } else {
    state.lean *= Math.pow(0.001, dt);
  }

  // ── Joystick X → gatilho de curva (edge detect) ──
  if (joy.active) {
    if (joy.dx < -TURN_THRESHOLD && turnAxis === null) {
      requestTurn(1);
      turnAxis = 'left';
    } else if (joy.dx > TURN_THRESHOLD && turnAxis === null) {
      requestTurn(-1);
      turnAxis = 'right';
    } else if (Math.abs(joy.dx) < TURN_RESET) {
      turnAxis = null;
    }
  }

  // ── Movimento no plano XZ ──
  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);
  state.x += sinY * state.speed * dt;
  state.z += cosY * state.speed * dt;

  // ── Bike transform ──
  bike.position.set(state.x, 0, state.z);
  bike.rotation.order = 'YXZ';
  bike.rotation.y = state.yaw;
  bike.rotation.x = 0;
  bike.rotation.z = state.lean;

  // ── Trail ──
  pushTrailPoint(state.x, state.z);
}

/* ═══════════════════════════════════════════════════════════════
   CÂMERA (3ª pessoa com lerp)
   ═══════════════════════════════════════════════════════════════ */
const camDesired = new THREE.Vector3();
const camLook = new THREE.Vector3();

function updateCamera(dt) {
  const back = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const dist = 8.5 + (state.speed / CFG.maxSpeed) * 3;
  const height = 3.6;

  camDesired.copy(bike.position).addScaledVector(back, dist);
  camDesired.y = height;

  const lerp = 1 - Math.pow(0.0008, dt);
  camera.position.lerp(camDesired, lerp);

  camLook.copy(bike.position);
  camLook.y += 1.35;
  camera.lookAt(camLook);
}

/* ═══════════════════════════════════════════════════════════════
   HUD
   ═══════════════════════════════════════════════════════════════ */
const elSpeed = document.getElementById('speed');
const elDist = document.getElementById('dist');
const elCoords = document.getElementById('coords');
const elFill = document.getElementById('speedfill');
const elFps = document.getElementById('fps');

let hudAcc = 0;
function updateHUD(dt) {
  hudAcc += dt;
  if (hudAcc < 0.1) return;
  hudAcc = 0;

  elSpeed.textContent = Math.round(state.speed * 3.6 * 1.6);
  elCoords.textContent = `${Math.round(state.x)}, ${Math.round(state.z)}`;
  elDist.textContent = `${Math.round(Math.hypot(state.x, state.z))} m`;
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
   LOOP
   ═══════════════════════════════════════════════════════════════ */
const clock = new THREE.Clock();
let fpsAccum = 0, fpsFrames = 0;

// init
updateChunks(0, 0);
bike.position.set(0, 0, 0);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updatePlayer(dt);
  updateCamera(dt);
  updateChunks(state.x, state.z);
  updateHUD(dt);

  terrainMaterial.uniforms.uTime.value += dt;

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    elFps.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS`;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  composer.render();
}

/* ═══════════════════════════════════════════════════════════════
   START / ÁUDIO
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
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    gain.gain.value = 0.018;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
  } catch (_) {}
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
  if (audioCtx) {
    if (muted) audioCtx.suspend();
    else audioCtx.resume();
  }
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', muted);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

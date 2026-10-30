
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// TRON // GRID RUNNER 2.0
// Procedural city + adaptive quality + mobile/desktop.

const CFG = {
  chunkSize: 100,
  viewDist: 2,
  gridSize: 5,
  fogColor: 0x020711,
  fogDensity: 0.0065,
  minSpeed: 5,
  cruiseSpeed: 18,
  maxSpeed: 48,
  turnDuration: 0.22,
  trailLength: 220,
  trailStep: 0.9,
  neon: 0x00eaff,
  cityLots: 10
};

const canvas = document.getElementById('scene');

const mobile =
  matchMedia('(pointer: coarse)').matches ||
  innerWidth < 820;

const QUALITY = {
  pixelRatio: mobile ? 1 : Math.min(devicePixelRatio || 1, 1.5),
  bloom: mobile ? 0.62 : 0.92
};

// RENDERER

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !mobile,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
});

renderer.setPixelRatio(QUALITY.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

// SCENE

const scene = new THREE.Scene();

scene.background = new THREE.Color(CFG.fogColor);
scene.fog = new THREE.FogExp2(
  CFG.fogColor,
  CFG.fogDensity
);

const camera = new THREE.PerspectiveCamera(
  68,
  innerWidth / innerHeight,
  0.5,
  850
);

camera.position.set(0, 4, -10);

scene.add(
  new THREE.HemisphereLight(
    0x55cfff,
    0x030817,
    0.8
  )
);

const ambient = new THREE.AmbientLight(
  0x31516b,
  0.35
);

scene.add(ambient);

const keyLight = new THREE.DirectionalLight(
  0x8beeff,
  0.75
);

keyLight.position.set(30, 80, -20);
scene.add(keyLight);

// POST PROCESSING

const composer = new EffectComposer(renderer);

composer.addPass(
  new RenderPass(scene, camera)
);

const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  QUALITY.bloom,
  0.48,
  0.22
);

composer.addPass(bloom);

// PROCEDURAL GRID SHADER

const terrainMaterial = new THREE.ShaderMaterial({

  uniforms: {
    uTime: { value: 0 },
    uGrid: { value: CFG.gridSize },
    uNeon: {
      value: new THREE.Color(CFG.neon)
    },
    uFog: {
      value: new THREE.Color(CFG.fogColor)
    },
    uFogDensity: {
      value: CFG.fogDensity
    }
  },

  vertexShader: `
    varying vec3 vWorld;

    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;

      gl_Position =
        projectionMatrix *
        viewMatrix *
        w;
    }
  `,

  fragmentShader: `
    precision highp float;

    varying vec3 vWorld;

    uniform float uTime;
    uniform float uGrid;
    uniform vec3 uNeon;
    uniform vec3 uFog;
    uniform float uFogDensity;

    float lineAt(float v, float stepSize) {
      float f = abs(fract(v / stepSize) - 0.5);
      return 1.0 - smoothstep(0.475, 0.5, f);
    }

    void main() {

      vec2 p = vWorld.xz;

      float fine = max(
        lineAt(p.x, uGrid),
        lineAt(p.y, uGrid)
      );

      float major = max(
        lineAt(p.x, uGrid * 5.0),
        lineAt(p.y, uGrid * 5.0)
      );

      float pulse =
        0.88 + 0.12 * sin(uTime * 1.8);

      vec3 col =
        vec3(0.002, 0.006, 0.014) +
        uNeon * (fine * 0.20 + major * 0.78) * pulse;

      float dist = length(vWorld - cameraPosition);

      float fog =
        1.0 - exp(
          -uFogDensity *
          uFogDensity *
          dist * dist
        );

      col = mix(
        col,
        uFog,
        clamp(fog, 0.0, 1.0)
      );

      gl_FragColor = vec4(col, 1.0);
    }
  `
});

// SHARED GEOMETRY

const planeGeo = new THREE.PlaneGeometry(
  CFG.chunkSize,
  CFG.chunkSize,
  1,
  1
);

planeGeo.rotateX(-Math.PI / 2);

const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
const trimGeo = new THREE.BoxGeometry(1, 1, 1);

const buildingMat = new THREE.MeshStandardMaterial({
  color: 0x101d30,
  metalness: 0.78,
  roughness: 0.3,
  emissive: 0x03101b,
  emissiveIntensity: 0.8
});

const trimMat = new THREE.MeshBasicMaterial({
  color: CFG.neon
});

const chunks = new Map();

// DETERMINISTIC RANDOM GENERATOR

function hash2(a, b) {
  let n = (a * 374761393 + b * 668265263) | 0;

  n = (n ^ (n >>> 13)) * 1274126177;

  return (
    (n ^ (n >>> 16)) >>> 0
  ) / 4294967295;
}

// PROCEDURAL CITY

function createChunk(cx, cz) {

  const group = new THREE.Group();

  group.position.set(
    cx * CFG.chunkSize,
    0,
    cz * CFG.chunkSize
  );

  scene.add(group);

  // Neon ground

  const ground = new THREE.Mesh(
    planeGeo,
    terrainMaterial
  );

  ground.position.y = 0;
  ground.frustumCulled = true;

  group.add(ground);

  // Buildings

  const count = CFG.cityLots;

  const buildings = new THREE.InstancedMesh(
    buildingGeo,
    buildingMat,
    count
  );

  const trims = new THREE.InstancedMesh(
    trimGeo,
    trimMat,
    count
  );

  buildings.instanceMatrix.setUsage(
    THREE.StaticDrawUsage
  );

  trims.instanceMatrix.setUsage(
    THREE.StaticDrawUsage
  );

  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {

    const seed = hash2(
      cx * 31 + i,
      cz * 17 - i
    );

    const col = i % 5;
    const row = Math.floor(i / 5);

    // Roads remain open between buildings.

    let x =
      -39 +
      col * 19 +
      (hash2(cx + i, cz - i) - 0.5) * 5;

    let z =
      -29 +
      row * 48 +
      (hash2(cx - i, cz + i) - 0.5) * 7;

    if (Math.abs(x) < 9) {
      x += x < 0 ? -13 : 13;
    }

    const w = 7 + seed * 5;

    const depth =
      8 + hash2(i + cx, cz) * 7;

    const height =
      12 + hash2(cx - i, cz + i * 3) * 48;

    // Main building

    dummy.position.set(
      x,
      height / 2,
      z
    );

    dummy.scale.set(
      w,
      height,
      depth
    );

    dummy.rotation.y =
      (hash2(i, cx + cz) - 0.5) * 0.12;

    dummy.updateMatrix();

    buildings.setMatrixAt(
      i,
      dummy.matrix
    );

    // Neon rooftop

    dummy.position.set(
      x,
      height + 0.12,
      z
    );

    dummy.scale.set(
      w * 1.02,
      0.22,
      depth * 1.02
    );

    dummy.rotation.y = 0;
    dummy.updateMatrix();

    trims.setMatrixAt(
      i,
      dummy.matrix
    );
  }

  buildings.instanceMatrix.needsUpdate = true;
  trims.instanceMatrix.needsUpdate = true;

  group.add(buildings, trims);

  return { group };
}

// INFINITE CITY STREAMING

let lastChunkX = NaN;
let lastChunkZ = NaN;

function updateChunks(x, z) {

  const pcx = Math.floor(
    x / CFG.chunkSize + 0.5
  );

  const pcz = Math.floor(
    z / CFG.chunkSize + 0.5
  );

  if (
    pcx === lastChunkX &&
    pcz === lastChunkZ
  ) {
    return;
  }

  lastChunkX = pcx;
  lastChunkZ = pcz;

  const needed = new Set();

  for (
    let dx = -CFG.viewDist;
    dx <= CFG.viewDist;
    dx++
  ) {

    for (
      let dz = -CFG.viewDist;
      dz <= CFG.viewDist;
      dz++
    ) {

      if (
        dx * dx + dz * dz >
        CFG.viewDist * CFG.viewDist +
        CFG.viewDist
      ) {
        continue;
      }

      needed.add(
        `${pcx + dx},${pcz + dz}`
      );
    }
  }

  // Remove distant sectors

  for (const [key, chunk] of chunks) {

    if (!needed.has(key)) {

      scene.remove(chunk.group);

      chunks.delete(key);
    }
  }

  // Generate new sectors

  for (const key of needed) {

    if (!chunks.has(key)) {

      const [cx, cz] = key
        .split(',')
        .map(Number);

      chunks.set(
        key,
        createChunk(cx, cz)
      );
    }
  }
}

// LIGHT CYCLE

function buildBike() {

  const root = new THREE.Group();

  const dark = new THREE.MeshStandardMaterial({
    color: 0x080d17,
    metalness: 0.9,
    roughness: 0.24,
    emissive: 0x00131b,
    emissiveIntensity: 0.7
  });

  const glow = new THREE.MeshBasicMaterial({
    color: CFG.neon
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.88, 0.48, 2.55),
    dark
  );

  body.position.y = 0.67;
  root.add(body);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.3, 0.72),
    dark
  );

  nose.position.set(0, 0.55, 1.48);
  root.add(nose);

  const wheelGeo = new THREE.CylinderGeometry(
    0.49,
    0.49,
    0.24,
    18
  );

  wheelGeo.rotateZ(Math.PI / 2);

  for (const z of [-0.98, 0.98]) {

    const wheel = new THREE.Mesh(
      wheelGeo,
      dark
    );

    wheel.position.set(0, 0.53, z);
    root.add(wheel);

    const ringGeo = new THREE.TorusGeometry(
      0.49,
      0.035,
      7,
      24
    );

    ringGeo.rotateY(Math.PI / 2);

    const ring = new THREE.Mesh(
      ringGeo,
      glow
    );

    ring.position.copy(wheel.position);

    root.add(ring);
  }

  const rider = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.65, 0.48),
    dark
  );

  rider.position.set(0, 1.25, -0.18);
  root.add(rider);

  for (const x of [-0.45, 0.45]) {

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.045, 2.45),
      glow
    );

    strip.position.set(x, 0.67, 0);

    root.add(strip);
  }

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff
    })
  );

  lamp.position.set(0, 0.68, 1.9);

  root.add(lamp);

  return root;
}

const bike = buildBike();

scene.add(bike);

// NEON TRAIL

const trailCapacity = CFG.trailLength;

const trailPositions = new Float32Array(
  trailCapacity * 6
);

const trailGeo = new THREE.BufferGeometry();

trailGeo.setAttribute(
  'position',
  new THREE.BufferAttribute(
    trailPositions,
    3
  ).setUsage(THREE.DynamicDrawUsage)
);

trailGeo.setDrawRange(0, 0);

const trailLine = new THREE.LineSegments(
  trailGeo,
  new THREE.LineBasicMaterial({
    color: CFG.neon,
    transparent: true,
    opacity: 0.8
  })
);

trailLine.frustumCulled = false;

scene.add(trailLine);

let trailHead = 0;
let trailCount = 0;

const lastTrail = new THREE.Vector3();

function addTrail(x, z) {

  const dx = x - lastTrail.x;
  const dz = z - lastTrail.z;

  if (
    trailCount > 0 &&
    dx * dx + dz * dz <
    CFG.trailStep * CFG.trailStep
  ) {
    return;
  }

  const slot = trailHead;
  const base = slot * 6;

  trailPositions[base] = lastTrail.x;
  trailPositions[base + 1] = 0.12;
  trailPositions[base + 2] = lastTrail.z;

  trailPositions[base + 3] = x;
  trailPositions[base + 4] = 0.12;
  trailPositions[base + 5] = z;

  lastTrail.set(x, 0, z);

  trailHead = (trailHead + 1) % trailCapacity;

  trailCount = Math.min(
    trailCount + 1,
    trailCapacity
  );

  trailGeo.attributes.position.needsUpdate = true;

  trailGeo.setDrawRange(
    0,
    trailCount * 2
  );
}

// PLAYER STATE

const state = {
  x: 0,
  z: 0,
  yaw: 0,
  targetYaw: 0,
  turnStartYaw: 0,
  turning: false,
  turnProgress: 0,
  lean: 0,
  speed: CFG.cruiseSpeed,
  targetSpeed: CFG.cruiseSpeed,
  started: false,
  distance: 0
};

const keys = {
  forward: false,
  backward: false
};

function requestTurn(dir) {

  if (!state.started || state.turning) {
    return;
  }

  state.turning = true;
  state.turnProgress = 0;

  state.turnStartYaw = state.yaw;

  state.targetYaw =
    state.yaw + dir * Math.PI / 2;
}

// KEYBOARD

window.addEventListener('keydown', e => {

  const k = e.key.toLowerCase();

  if (
    ['arrowup', 'arrowdown',
     'arrowleft', 'arrowright', ' '].includes(k)
  ) {
    e.preventDefault();
  }

  if (k === 'w' || k === 'arrowup') {
    keys.forward = true;
  }

  else if (k === 's' || k === 'arrowdown') {
    keys.backward = true;
  }

  else if (k === 'a' || k === 'arrowleft') {
    requestTurn(1);
  }

  else if (k === 'd' || k === 'arrowright') {
    requestTurn(-1);
  }
});

window.addEventListener('keyup', e => {

  const k = e.key.toLowerCase();

  if (k === 'w' || k === 'arrowup') {
    keys.forward = false;
  }

  if (k === 's' || k === 'arrowdown') {
    keys.backward = false;
  }
});

// JOYSTICK

const joystick = document.getElementById('joystick');
const knob = document.getElementById('joystickKnob');

const joy = {
  active: false,
  pointerId: null,
  cx: 0,
  cy: 0,
  radius: 48,
  dx: 0,
  dy: 0
};

let turnAxis = null;

function joyStart(e) {

  const r = joystick.getBoundingClientRect();

  joy.cx = r.left + r.width / 2;
  joy.cy = r.top + r.height / 2;

  joy.radius = (r.width - 62) / 2;

  joy.active = true;
  joy.pointerId = e.pointerId;

  joystick.classList.add('active');

  joyMove(e.clientX, e.clientY);
}

function joyMove(x, y) {

  if (!joy.active) return;

  let dx = x - joy.cx;
  let dy = y - joy.cy;

  const d = Math.hypot(dx, dy);

  if (d > joy.radius) {

    dx = dx / d * joy.radius;
    dy = dy / d * joy.radius;
  }

  joy.dx = dx / joy.radius;
  joy.dy = -dy / joy.radius;

  knob.style.transform =
    `translate(${dx}px, ${dy}px)`;
}

function endJoystick() {

  if (!joy.active) return;

  joy.active = false;
  joy.pointerId = null;

  joy.dx = 0;
  joy.dy = 0;

  turnAxis = null;

  joystick.classList.remove('active');

  knob.style.transform = '';
}

joystick.addEventListener('pointerdown', e => {

  e.preventDefault();

  joystick.setPointerCapture(e.pointerId);

  joyStart(e);
});

joystick.addEventListener('pointermove', e => {

  if (
    joy.active &&
    e.pointerId === joy.pointerId
  ) {
    joyMove(e.clientX, e.clientY);
  }
});

for (const ev of [
  'pointerup',
  'pointercancel',
  'lostpointercapture'
]) {
  joystick.addEventListener(ev, endJoystick);
}

window.addEventListener('blur', () => {

  keys.forward = false;
  keys.backward = false;

  endJoystick();
});

// CAMERA

const camDesired = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camBack = new THREE.Vector3();

// PLAYER UPDATE

function updatePlayer(dt) {

  if (!state.started) return;

  const accel =
    keys.forward || joy.dy > 0.3;

  const brake =
    keys.backward || joy.dy < -0.3;

  if (accel) {

    state.targetSpeed = Math.min(
      CFG.maxSpeed,
      state.targetSpeed + 36 * dt
    );
  }

  else if (brake) {

    state.targetSpeed = Math.max(
      CFG.minSpeed,
      state.targetSpeed - 48 * dt
    );
  }

  else {

    state.targetSpeed +=
      THREE.MathUtils.clamp(
        CFG.cruiseSpeed - state.targetSpeed,
        -10 * dt,
        10 * dt
      );
  }

  state.speed +=
    (state.targetSpeed - state.speed) *
    Math.min(1, dt * 5.5);

  // Joystick turning

  if (joy.active) {

    if (
      joy.dx < -0.58 &&
      turnAxis === null
    ) {
      requestTurn(1);
      turnAxis = 'left';
    }

    else if (
      joy.dx > 0.58 &&
      turnAxis === null
    ) {
      requestTurn(-1);
      turnAxis = 'right';
    }

    else if (Math.abs(joy.dx) < 0.32) {
      turnAxis = null;
    }
  }

  // Smooth 90 degree turns

  if (state.turning) {

    state.turnProgress = Math.min(
      1,
      state.turnProgress + dt / CFG.turnDuration
    );

    const t =
      1 - Math.pow(1 - state.turnProgress, 3);

    state.yaw =
      state.turnStartYaw +
      (state.targetYaw - state.turnStartYaw) * t;

    const dir = Math.sign(
      state.targetYaw - state.turnStartYaw
    );

    state.lean =
      -dir *
      Math.sin(state.turnProgress * Math.PI) *
      0.28;

    if (state.turnProgress >= 1) {

      state.turning = false;
      state.yaw = state.targetYaw;
    }
  }

  else {

    state.lean *= Math.pow(0.002, dt);
  }

  // Movement

  const oldX = state.x;
  const oldZ = state.z;

  state.x += Math.sin(state.yaw) * state.speed * dt;
  state.z += Math.cos(state.yaw) * state.speed * dt;

  state.distance += Math.hypot(
    state.x - oldX,
    state.z - oldZ
  );

  // Bike transform

  bike.position.set(state.x, 0, state.z);

  bike.rotation.order = 'YXZ';
  bike.rotation.y = state.yaw;
  bike.rotation.z = state.lean;

  addTrail(state.x, state.z);
}

// CAMERA UPDATE

function updateCamera(dt) {

  camBack.set(
    -Math.sin(state.yaw),
    0,
    -Math.cos(state.yaw)
  );

  const distance =
    9 + (state.speed / CFG.maxSpeed) * 3.5;

  camDesired
    .copy(bike.position)
    .addScaledVector(camBack, distance);

  camDesired.y = 4.0;

  camera.position.lerp(
    camDesired,
    1 - Math.pow(0.0008, dt)
  );

  camLook.copy(bike.position);
  camLook.y = 1.15;

  camera.lookAt(camLook);
}

// HUD

const $ = id => document.getElementById(id);

const elSpeed = $('speed');
const elDist = $('dist');
const elSector = $('sector');
const elFill = $('speedfill');
const elFps = $('fps');

let hudTimer = 0;

function updateHUD(dt) {

  hudTimer += dt;

  if (hudTimer < 0.1) return;

  hudTimer = 0;

  elSpeed.textContent = Math.round(
    state.speed * 3.6 * 1.6
  );

  elDist.textContent =
    `${Math.floor(state.distance)} m`;

  elSector.textContent =
    `${Math.floor(state.x / CFG.chunkSize)} : ${Math.floor(state.z / CFG.chunkSize)}`;

  elFill.style.width =
    `${state.speed / CFG.maxSpeed * 100}%`;
}

// RESIZE

function resize() {

  const w = innerWidth;
  const h = innerHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(QUALITY.pixelRatio);
  renderer.setSize(w, h);

  composer.setSize(w, h);
  bloom.setSize(w, h);
}

window.addEventListener('resize', resize);

// AUDIO ENGINE

let audioCtx = null;
let engineGain = null;
let muted = false;

function initAudio() {

  if (audioCtx) return;

  try {

    audioCtx = new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

    const osc = audioCtx.createOscillator();

    engineGain = audioCtx.createGain();

    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = 48;

    filter.type = 'lowpass';
    filter.frequency.value = 180;

    engineGain.gain.value = muted ? 0 : 0.012;

    osc.connect(filter)
      .connect(engineGain)
      .connect(audioCtx.destination);

    osc.start();

  } catch (e) {

    console.warn('Áudio indisponível', e);
  }
}

function updateAudio() {

  if (!audioCtx || !engineGain) return;

  const level = muted
    ? 0
    : 0.008 + (state.speed / CFG.maxSpeed) * 0.018;

  engineGain.gain.setTargetAtTime(
    level,
    audioCtx.currentTime,
    0.12
  );
}

$('muteBtn').addEventListener('click', () => {

  muted = !muted;

  $('muteBtn').textContent =
    muted ? 'SOM OFF' : 'SOM ON';

  $('muteBtn').classList.toggle(
    'muted',
    muted
  );

  if (audioCtx) {

    if (muted) {
      audioCtx.suspend();
    }

    else {
      audioCtx.resume();
    }
  }
});

document.addEventListener(
  'visibilitychange',
  () => {

    if (!audioCtx) return;

    if (document.hidden) {
      audioCtx.suspend();
    }

    else if (!muted) {
      audioCtx.resume();
    }
  }
);

// GAME LOOP

let running = false;
let raf = 0;

const clock = new THREE.Clock();

let fpsTime = 0;
let fpsFrames = 0;

function animate() {

  if (!running) return;

  raf = requestAnimationFrame(animate);

  const dt = Math.min(
    clock.getDelta(),
    0.05
  );

  updatePlayer(dt);
  updateCamera(dt);
  updateChunks(state.x, state.z);
  updateHUD(dt);
  updateAudio();

  terrainMaterial.uniforms.uTime.value += dt;

  fpsTime += dt;
  fpsFrames++;

  if (fpsTime >= 0.5) {

    elFps.textContent =
      `${Math.round(fpsFrames / fpsTime)} FPS`;

    fpsTime = 0;
    fpsFrames = 0;
  }

  composer.render();
}

// INITIALIZATION

updateChunks(0, 0);

bike.position.set(0, 0, 0);

camera.lookAt(0, 1, 0);

// START

$('startBtn').addEventListener('click', () => {

  if (running) return;

  state.started = true;
  running = true;

  $('overlay').classList.add('hidden');

  initAudio();

  if (audioCtx && !muted) {
    audioCtx.resume();
  }

  clock.start();

  animate();
});

$('muteBtn').textContent = 'SOM ON';

canvas.addEventListener(
  'contextmenu',
  e => e.preventDefault()
);

window.addEventListener('pagehide', () => {

  running = false;

  if (raf) {
    cancelAnimationFrame(raf);
  }
});

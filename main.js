// main.js
// ============================================================================
// TRON ENGINE — Terreno procedural com InstancedMesh + grade infinita
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// 1. CONFIGURAÇÃO GLOBAL
// ============================================================================
const CONFIG = {
  chunkSize: 16,          // blocos por lado do chunk
  blockSize: 1,           // espaçamento entre centros de blocos
  blockVisualSize: 0.92,  // tamanho visual (deixa um gap neon)
  viewRadius: 5,          // chunks carregados em cada direção

  fogNear: 42,
  fogFar: 125,

  heightMin: -3,
  heightMax: 12,

  colors: {
    background: 0x020710,
    fog:        0x020710,
    fill:       0x02141b,
    wire:       0x00eaff,
    gridMajor:  0x00eaff,
    gridMinor:  0x0a3540,
  },
};

// ============================================================================
// 2. NOISE (value noise + fbm) — determinístico, sem dependências
// ============================================================================
function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);

  const a = hash2(xi,     yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi,     yi + 1);
  const d = hash2(xi + 1, yi + 1);

  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

function fbm(x, y, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return value;
}

/**
 * Altura (em blocos inteiros) para uma coluna do mundo.
 * Combina três camadas de ruído para gerar vales, colinas e cristas.
 */
function getHeight(wx, wz) {
  const large = fbm(wx * 0.025, wz * 0.025, 3); // formas amplas
  const small = fbm(wx * 0.090, wz * 0.090, 4); // detalhe fino
  const ridge = 1 - Math.abs(fbm(wx * 0.050, wz * 0.050, 3) * 2 - 1);

  const combined = large * 0.50 + small * 0.25 + ridge * 0.25;
  const h = Math.floor(CONFIG.heightMin + combined * (CONFIG.heightMax - CONFIG.heightMin));
  return Math.max(CONFIG.heightMin, Math.min(CONFIG.heightMax, h));
}

// ============================================================================
// 3. CENA / RENDERER
// ============================================================================
const container = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
scene.fog = new THREE.Fog(CONFIG.colors.fog, CONFIG.fogNear, CONFIG.fogFar);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  400
);
camera.position.set(22, 24, 22);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// ============================================================================
// 4. GRADE INFINITA (segue a câmera, recortada por fog)
// ============================================================================
const GRID_SIZE = 600;
const GRID_DIV  = 600;

const grid = new THREE.GridHelper(
  GRID_SIZE,
  GRID_DIV,
  CONFIG.colors.gridMajor,
  CONFIG.colors.gridMinor
);
grid.material.transparent = true;
grid.material.opacity = 0.35;
grid.material.depthWrite = false;
grid.position.y = -8;
scene.add(grid);

// ============================================================================
// 5. TERRAIN MANAGER — chunks com InstancedMesh (fill + wireframe)
// ============================================================================

// Geometria e materiais compartilhados entre TODOS os chunks
const SHARED_GEO = new THREE.BoxGeometry(
  CONFIG.blockVisualSize,
  CONFIG.blockVisualSize,
  CONFIG.blockVisualSize
);

const SHARED_FILL_MAT = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.fill,
  transparent: true,
  opacity: 0.92,
});

// Cor branca → é multiplicada pelo instanceColor (variação por altura)
const SHARED_WIRE_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
  transparent: true,
  opacity: 0.88,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

class TerrainManager {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();          // key → { group, count }
    this.dummy = new THREE.Object3D();
    this.totalBlocks = 0;

    // Cores usadas no instanceColor
    this.colorLow  = new THREE.Color(0x006688); // ciano escuro (vales)
    this.colorHigh = new THREE.Color(0x00ffff); // ciano intenso (picos)
    this.tmpColor  = new THREE.Color();
  }

  key(cx, cz) { return `${cx},${cz}`; }

  createChunk(cx, cz) {
    const size    = CONFIG.chunkSize;
    const spacing = CONFIG.blockSize;
    const baseX   = cx * size;
    const baseZ   = cz * size;
    const count   = size * size;

    const fillMesh = new THREE.InstancedMesh(SHARED_GEO, SHARED_FILL_MAT, count);
    const wireMesh = new THREE.InstancedMesh(SHARED_GEO, SHARED_WIRE_MAT, count);

    // Wireframe por cima do fill
    fillMesh.renderOrder = 0;
    wireMesh.renderOrder = 1;

    fillMesh.frustumCulled = true;
    wireMesh.frustumCulled = true;

    const range = CONFIG.heightMax - CONFIG.heightMin;
    let i = 0;

    for (let lx = 0; lx < size; lx++) {
      for (let lz = 0; lz < size; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h  = getHeight(wx, wz);

        this.dummy.position.set(wx * spacing, h * spacing, wz * spacing);
        this.dummy.updateMatrix();

        fillMesh.setMatrixAt(i, this.dummy.matrix);
        wireMesh.setMatrixAt(i, this.dummy.matrix);

        // Variação de cor por altura → picos mais brilhantes
        const t = (h - CONFIG.heightMin) / range;
        this.tmpColor.lerpColors(this.colorLow, this.colorHigh, t);
        wireMesh.setColorAt(i, this.tmpColor);

        i++;
      }
    }

    fillMesh.instanceMatrix.needsUpdate = true;
    wireMesh.instanceMatrix.needsUpdate = true;
    fillMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    wireMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    if (wireMesh.instanceColor) wireMesh.instanceColor.needsUpdate = true;

    const group = new THREE.Group();
    group.add(fillMesh);
    group.add(wireMesh);
    group.userData.count = count;

    this.scene.add(group);
    this.chunks.set(this.key(cx, cz), { group, count });
    this.totalBlocks += count;
  }

  disposeChunk(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    this.scene.remove(chunk.group);

    // InstancedMesh.dispose() libera apenas os buffers de instância,
    // preservando SHARED_GEO e os materiais compartilhados.
    chunk.group.children.forEach((m) => {
      if (m.isInstancedMesh) m.dispose();
    });

    this.totalBlocks -= chunk.count;
    this.chunks.delete(key);
  }

  update(camPos) {
    const chunkWorld = CONFIG.chunkSize * CONFIG.blockSize;
    const camChunkX = Math.floor(camPos.x / chunkWorld);
    const camChunkZ = Math.floor(camPos.z / chunkWorld);
    const r = CONFIG.viewRadius;

    const needed = new Set();
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        needed.add(this.key(camChunkX + dx, camChunkZ + dz));
      }
    }

    // Remove chunks fora do raio
    for (const key of this.chunks.keys()) {
      if (!needed.has(key)) this.disposeChunk(key);
    }

    // Cria chunks faltantes (limitado por frame para evitar hitches)
    let created = 0;
    for (const key of needed) {
      if (this.chunks.has(key)) continue;
      if (created >= 4) break;

      const [cx, cz] = key.split(',').map(Number);
      this.createChunk(cx, cz);
      created++;
    }
  }

  getChunkCount() { return this.chunks.size; }
}

const terrain = new TerrainManager(scene);

// ============================================================================
// 6. ORBIT CONTROLS
// ============================================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.06;
controls.rotateSpeed     = 0.55;
controls.zoomSpeed       = 0.85;
controls.panSpeed        = 0.7;
controls.minDistance     = 6;
controls.maxDistance     = 120;
controls.maxPolarAngle   = Math.PI * 0.49;
controls.target.set(0, 0, 0);

// ============================================================================
// 7. CARGA INICIAL
// ============================================================================
terrain.update(camera.position);

// ============================================================================
// 8. RESIZE
// ============================================================================
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', onResize);

// ============================================================================
// 9. HUD
// ============================================================================
const elFps    = document.getElementById('statFps');
const elChunks = document.getElementById('statChunks');
const elBlocks = document.getElementById('statBlocks');
const elCalls  = document.getElementById('statCalls');

let lastHudUpdate = 0;
let lastChunkUpdate = 0;
let fpsAccum = 0;
let fpsFrames = 0;
let fpsValue = 0;

// ============================================================================
// 10. RESET (R)
// ============================================================================
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    camera.position.set(22, 24, 22);
    controls.target.set(0, 0, 0);
    controls.update();
  }
});

// ============================================================================
// 11. BOOT SCREEN
// ============================================================================
const boot    = document.getElementById('boot');
const bootLog = document.getElementById('bootLog');

setTimeout(() => {
  if (bootLog) bootLog.textContent = 'SETORES ONLINE. ENTRANDO NO GRID...';
}, 900);

setTimeout(() => {
  boot.classList.add('is-hidden');
}, 1600);

// ============================================================================
// 12. LOOP DE ANIMAÇÃO
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta   = clock.getDelta();
  const elapsed = clock.elapsedTime;
  const now     = performance.now();

  controls.update();

  // --- Grade infinita: acompanha a câmera (snap em 1 unidade) ---
  grid.position.x = Math.round(camera.position.x);
  grid.position.z = Math.round(camera.position.z);

  // Pulso sutil na grade
  grid.material.opacity = 0.32 + Math.sin(elapsed * 1.8) * 0.06;

  // --- Streaming de chunks ---
  if (now - lastChunkUpdate > 80) {
    terrain.update(camera.position);
    lastChunkUpdate = now;
  }

  // --- FPS ---
  fpsAccum += delta;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsValue = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
  }

  renderer.render(scene, camera);

  // --- HUD (após render para reportar draw calls do frame atual) ---
  if (now - lastHudUpdate > 250) {
    elFps.textContent    = fpsValue || '--';
    elChunks.textContent = terrain.getChunkCount();
    elBlocks.textContent = terrain.totalBlocks.toLocaleString('pt-BR');
    elCalls.textContent  = renderer.info.render.calls;
    lastHudUpdate = now;
  }
}

animate();

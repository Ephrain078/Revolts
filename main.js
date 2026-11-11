import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// 1. CONFIGURAÇÃO
// ============================================================================
const CONFIG = {
  gridSize: 300,        // Tamanho da malha
  segments: 180,        // Resolução de linhas
  colors: {
    background: 0x000000,   // Preto absoluto
    gridWireframe: 0x00ffff, // Ciano Neon puro
    gridBase: 0x000a14,     // Azul escuro profundo na base
    horizonFog: 0x000000
  }
};

// ============================================================================
// 2. CENA E RENDERER
// ============================================================================
const container = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
scene.fog = new THREE.FogExp2(CONFIG.colors.horizonFog, 0.008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 35, 80);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// ============================================================================
// 3. TERRENO PLANO VETORIAL
// ============================================================================
const geometry = new THREE.PlaneGeometry(
  CONFIG.gridSize,
  CONFIG.gridSize,
  CONFIG.segments,
  CONFIG.segments
);
geometry.rotateX(-Math.PI / 2);

// Material Wireframe Estilo Tron / Ciano Neon
const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.gridWireframe,
  wireframe: true,
  transparent: true,
  opacity: 0.75
});

// Superfície base escura
const baseMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.gridBase,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});

const terrainWire = new THREE.Mesh(geometry, wireframeMaterial);
const terrainBase = new THREE.Mesh(geometry, baseMaterial);

const terrainGroup = new THREE.Group();
terrainGroup.add(terrainWire);
terrainGroup.add(terrainBase);
scene.add(terrainGroup);

// Grade Horizonte Estática Infinita
const horizonGrid = new THREE.GridHelper(1000, 100, 0x00ffff, 0x003344);
horizonGrid.position.y = -2;
scene.add(horizonGrid);

// ============================================================================
// 4. CONTROLES E NAVEGAÇÃO
// ============================================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI * 0.48; // Trava para não ir abaixo do solo
controls.minDistance = 10;
controls.maxDistance = 250;

// ============================================================================
// 5. HUD E LOOP DE ANIMAÇÃO
// ============================================================================
const elFps = document.getElementById('statFps');
const elVerts = document.getElementById('statVerts');
const elCalls = document.getElementById('statCalls');
const boot = document.getElementById('boot');

setTimeout(() => {
  if (boot) boot.classList.add('is-hidden');
}, 1000);

// Atualização automática do ano no rodapé
const currentYear = new Date().getFullYear();
document.querySelectorAll('.dynamic-year').forEach(el => {
  el.textContent = currentYear;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    camera.position.set(0, 35, 80);
    controls.target.set(0, 0, 0);
  }
});

let lastTime = performance.now();
let frameCount = 0;

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  frameCount++;

  // Animação de pulso suave da rede neon
  wireframeMaterial.opacity = 0.6 + Math.sin(time * 0.002) * 0.15;

  controls.update();
  renderer.render(scene, camera);

  // Atualização do HUD de Performance a cada 500ms
  if (time - lastTime >= 500) {
    if (elFps) elFps.textContent = Math.round((frameCount * 1000) / (time - lastTime));
    if (elVerts) elVerts.textContent = geometry.attributes.position.count.toLocaleString('pt-BR');
    if (elCalls) elCalls.textContent = renderer.info.render.calls;
    frameCount = 0;
    lastTime = time;
  }
}

animate();

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// 1. CONFIGURAÇÃO
// ============================================================================
const CONFIG = {
  gridSize: 300,        // Tamanho da malha
  segments: 180,        // Resolução de linhas
  heightScale: 18,      // Altura das montanhas de dados
  colors: {
    background: 0x02060b,
    gridWireframe: 0x00eaff,
    gridBase: 0x001122,
    horizonFog: 0x02060b
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

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// ============================================================================
// 3. TERRENO TOPOGRÁFICO VETORIAL (Sem Blocos)
// ============================================================================
function generateHeight(x, z) {
  // Simulação de relevo usando ondas matemáticas (Perlin-like simplificado)
  const d1 = Math.sin(x * 0.03) * Math.cos(z * 0.03);
  const d2 = Math.sin(x * 0.08 + z * 0.05) * 0.5;
  const ridge = Math.abs(Math.sin(x * 0.02) * Math.cos(z * 0.02));
  return (d1 + d2 + ridge * 1.5) * CONFIG.heightScale;
}

const geometry = new THREE.PlaneGeometry(
  CONFIG.gridSize,
  CONFIG.gridSize,
  CONFIG.segments,
  CONFIG.segments
);
geometry.rotateX(-Math.PI / 2);

// Modifica vértices para criar a topografia
const posAttribute = geometry.attributes.position;
for (let i = 0; i < posAttribute.count; i++) {
  const x = posAttribute.getX(i);
  const z = posAttribute.getZ(i);
  const y = generateHeight(x, z);
  posAttribute.setY(i, y);
}
geometry.computeVertexNormals();

// Material Wireframe Estilo Tron Puro
const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.gridWireframe,
  wireframe: true,
  transparent: true,
  opacity: 0.65
});

// Superfície base escura para oclusão do fundo
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
const horizonGrid = new THREE.GridHelper(1000, 100, 0x00eaff, 0x003344);
horizonGrid.position.y = -CONFIG.heightScale - 2;
scene.add(horizonGrid);

// ============================================================================
// 4. CONTROLES E NAVEGAÇÃO
// ============================================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI * 0.48; // Não deixa ir abaixo do solo
controls.minDistance = 10;
controls.maxDistance = 250;

// ============================================================================
// 5. HUD E LOOP DE ANIMAÇÃO
// ============================================================================
const elFps = document.getElementById('statFps');
const elVerts = document.getElementById('statVerts');
const elCalls = document.getElementById('statCalls');
const boot = document.getElementById('boot');

setTimeout(() => boot.classList.add('is-hidden'), 1000);

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

  // Animação de pulso e movimento da rede
  wireframeMaterial.opacity = 0.5 + Math.sin(time * 0.002) * 0.15;

  controls.update();
  renderer.render(scene, camera);

  // HUD
  if (time - lastTime >= 500) {
    elFps.textContent = Math.round((frameCount * 1000) / (time - lastTime));
    elVerts.textContent = posAttribute.count.toLocaleString('pt-BR');
    elCalls.textContent = renderer.info.render.calls;
    frameCount = 0;
    lastTime = time;
  }
}

animate();

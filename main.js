import * as THREE from 'three';

// ============================================================================
// 1. CONFIGURAÇÃO
// ============================================================================
const CONFIG = {
  gridSize: 400,
  segments: 150,
  moveSpeed: 25,
  colors: {
    background: 0x000000,
    gridWireframe: 0x00ffff, // Ciano Neon
    gridBase: 0x00050a,
    sunColor: 0xff00ff        // Magenta Solar (Tesseract)
  }
};

// ============================================================================
// 2. CENA, CÂMERA E RENDERER
// ============================================================================
const container = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
scene.fog = new THREE.FogExp2(CONFIG.colors.background, 0.005);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 0); // Altura dos olhos do personagem

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// ============================================================================
// 3. TERRENO EM GRADE (GRID)
// ============================================================================
const geometry = new THREE.PlaneGeometry(CONFIG.gridSize, CONFIG.gridSize, CONFIG.segments, CONFIG.segments);
geometry.rotateX(-Math.PI / 2);

const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.gridWireframe,
  wireframe: true,
  transparent: true,
  opacity: 0.7
});

const baseMaterial = new THREE.MeshBasicMaterial({ color: CONFIG.colors.gridBase });

const terrainGroup = new THREE.Group();
terrainGroup.add(new THREE.Mesh(geometry, wireframeMaterial));
terrainGroup.add(new THREE.Mesh(geometry, baseMaterial));
scene.add(terrainGroup);

// Grade Infinita no Horizonte
const horizonGrid = new THREE.GridHelper(1000, 100, CONFIG.colors.gridWireframe, 0x003344);
horizonGrid.position.y = -0.1;
scene.add(horizonGrid);

// ============================================================================
// 4. O TESSERACT SOL/LUA NO CÉU
// ============================================================================
const sunGroup = new THREE.Group();
sunGroup.position.set(0, 60, -250); // Fixo no horizonte como um sol/lua gigante
scene.add(sunGroup);

const subCubes = [];
const baseVertices = [
  [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
  [-1,-1,1],  [1,-1,1],  [1,1,1],  [-1,1,1]
];
const baseEdges = [
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7]
];

// Cria camadas fractais do tesseract brilhante
for (let l = 0; l < 4; l++) {
  const scale = Math.pow(0.6, l) * 25; // Sol/Lua grande no céu
  const cubeGeo = new THREE.BufferGeometry();
  const positions = [];

  baseEdges.forEach(edge => {
    positions.push(...baseVertices[edge[0]], ...baseVertices[edge[1]]);
  });
  cubeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const cubeMat = new THREE.LineBasicMaterial({
    color: l === 0 ? 0xffffff : CONFIG.colors.sunColor,
    transparent: true,
    opacity: 0.9 - (l * 0.2)
  });

  const wireCube = new THREE.LineSegments(cubeGeo, cubeMat);
  wireCube.scale.set(scale, scale, scale);
  sunGroup.add(wireCube);
  subCubes.push(wireCube);
}

// ============================================================================
// 5. CONTROLES DE CAMINHADA (PRIMEIRA PESSOA)
// ============================================================================
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let yaw = 0, pitch = 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

container.addEventListener('click', () => {
  container.requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== container) return;

  const movementX = e.movementX || e.mozMovementX || 0;
  const movementY = e.movementY || e.mozMovementY || 0;

  yaw -= movementX * 0.002;
  pitch -= movementY * 0.002;

  // Limita olhar para cima/baixo
  pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));

  euler.set(pitch, yaw, 0);
  camera.quaternion.setFromEuler(euler);
});

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': moveForward = true; break;
    case 'KeyS': case 'ArrowDown': moveBackward = true; break;
    case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
    case 'KeyD': case 'ArrowRight': moveRight = true; break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': moveForward = false; break;
    case 'KeyS': case 'ArrowDown': moveBackward = false; break;
    case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
    case 'KeyD': case 'ArrowRight': moveRight = false; break;
  }
});

// ============================================================================
// 6. LOOP DE JOGO E HUD
// ============================================================================
const elFps = document.getElementById('statFps');
const elDist = document.getElementById('statDist');
const boot = document.getElementById('boot');

setTimeout(() => { if (boot) boot.classList.add('is-hidden'); }, 1000);

const currentYear = new Date().getFullYear();
document.querySelectorAll('.dynamic-year').forEach(el => { el.textContent = currentYear; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let lastTime = performance.now();
let frameCount = 0;
let totalDist = 0;

const direction = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = performance.now();
  frameCount++;

  // Movimentação do personagem
  direction.set(0, 0, 0);
  if (moveForward) direction.z -= 1;
  if (moveBackward) direction.z += 1;
  if (moveLeft) direction.x -= 1;
  if (moveRight) direction.x += 1;
  direction.normalize();

  if (moveForward || moveBackward || moveLeft || moveRight) {
    const speed = CONFIG.moveSpeed * delta;
    camera.translateOnAxis(direction, speed);
    camera.position.y = 2; // Mantém a altura fixa no chão
    totalDist += speed;
  }

  // Animação de pulso e rotação do Tesseract (Sol/Lua)
  subCubes.forEach((cube, i) => {
    cube.rotation.x += delta * (0.2 + i * 0.05);
    cube.rotation.y += delta * (0.3 - i * 0.05);
  });
  wireframeMaterial.opacity = 0.6 + Math.sin(time * 0.003) * 0.2;

  renderer.render(scene, camera);

  // Atualiza HUD
  if (time - lastTime >= 500) {
    if (elFps) elFps.textContent = Math.round((frameCount * 1000) / (time - lastTime));
    if (elDist) elDist.textContent = `${Math.floor(totalDist)} m`;
    frameCount = 0;
    lastTime = time;
  }
}

animate();

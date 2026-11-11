import * as THREE from 'three';

// Configurações de Performance e Estética
const CONFIG = {
  gridSize: 500,
  speed: 22,
  colorGrid: 0x00ffff,
  colorSun: 0xff00ff
};

const container = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.004);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Malha do Terreno Otimizada (PlaneGeometry única)
const planeGeo = new THREE.PlaneGeometry(CONFIG.gridSize, CONFIG.gridSize, 60, 60);
planeGeo.rotateX(-Math.PI / 2);

const gridMesh = new THREE.Mesh(
  planeGeo,
  new THREE.MeshBasicMaterial({ color: CONFIG.colorGrid, wireframe: true, transparent: true, opacity: 0.5 })
);
const baseMesh = new THREE.Mesh(
  planeGeo,
  new THREE.MeshBasicMaterial({ color: 0x000205 })
);
scene.add(baseMesh);
scene.add(gridMesh);

// Sol Tesseract Fractal 4D Procedural
const sunGroup = new THREE.Group();
sunGroup.position.set(0, 70, -300);
scene.add(sunGroup);

const cubes = [];
const vBase = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

for (let i = 0; i < 3; i++) {
  const scale = Math.pow(0.65, i) * 30;
  const geo = new THREE.BufferGeometry();
  const pos = [];
  edges.forEach(e => pos.push(...vBase[e[0]], ...vBase[e[1]]));
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

  const mat = new THREE.LineBasicMaterial({
    color: i === 0 ? 0xffffff : CONFIG.colorSun,
    transparent: true,
    opacity: 0.9 - (i * 0.25)
  });

  const cube = new THREE.LineSegments(geo, mat);
  cube.scale.set(scale, scale, scale);
  sunGroup.add(cube);
  cubes.push(cube);
}

// Controles Unificados (Teclado + Mouse + Touch Mobile)
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window);
if (isMobile) document.body.classList.add('mobile');

let moveF = false, moveB = false, moveL = false, moveR = false;
let yaw = 0, pitch = 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

container.addEventListener('click', () => { if (!isMobile) container.requestPointerLock(); });

document.addEventListener('mousemove', (e) => {
  if (!isMobile && document.pointerLockElement !== container) return;
  if (isMobile) return;
  yaw -= (e.movementX || 0) * 0.002;
  pitch -= (e.movementY || 0) * 0.002;
  pitch = Math.max(-1.4, Math.min(1.4, pitch));
  euler.set(pitch, yaw, 0);
  camera.quaternion.setFromEuler(euler);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') moveF = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') moveB = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') moveL = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') moveR = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') moveF = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') moveB = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') moveL = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') moveR = false;
});

// Joystick Mobile Ligeiro
let joyActive = false, joyId = null;
const joyEl = document.getElementById('joystick'), stickEl = document.getElementById('stick');
let joyVec = { x: 0, y: 0 };

if (joyEl) {
  joyEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joyId = e.changedTouches[0].identifier;
    joyActive = true;
    handleJoy(e.changedTouches[0]);
  }, { passive: false });

  joyEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let t of e.changedTouches) if (t.identifier === joyId) handleJoy(t);
  }, { passive: false });

  const endJoy = (e) => {
    e.preventDefault();
    for (let t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyActive = false; joyId = null;
        joyVec = { x: 0, y: 0 };
        stickEl.style.transform = 'translate(0,0)';
      }
    }
  };
  joyEl.addEventListener('touchend', endJoy, { passive: false });
}

function handleJoy(t) {
  const r = joyEl.getBoundingClientRect();
  let dx = t.clientX - (r.left + r.width / 2);
  let dy = t.clientY - (r.top + r.height / 2);
  const maxR = r.width / 2 - 10;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
  stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / maxR;
  joyVec.y = dy / maxR;
}

// Touch Look Mobile na metade direita da tela
let lookId = null, lx = 0, ly = 0;
container.addEventListener('touchstart', (e) => {
  if (!isMobile) return;
  for (let t of e.changedTouches) {
    if (t.clientX > window.innerWidth * 0.4 && lookId === null) {
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }
  }
}, { passive: true });

container.addEventListener('touchmove', (e) => {
  if (!isMobile) return;
  for (let t of e.changedTouches) {
    if (t.identifier === lookId) {
      yaw -= (t.clientX - lx) * 0.005;
      pitch -= (t.clientY - ly) * 0.005;
      pitch = Math.max(-1.4, Math.min(1.4, pitch));
      euler.set(pitch, yaw, 0);
      camera.quaternion.setFromEuler(euler);
      lx = t.clientX; ly = t.clientY;
    }
  }
}, { passive: true });

container.addEventListener('touchend', (e) => {
  for (let t of e.changedTouches) if (t.identifier === lookId) lookId = null;
}, { passive: true });

// Ano Dinâmico automático
document.querySelectorAll('.dynamic-year').forEach(el => el.textContent = new Date().getFullYear());

// Loop de Execução Contínua Otimizada (60 FPS Lineares)
const clock = new THREE.Clock();
const dir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = performance.now();

  dir.set(0, 0, 0);
  if (moveF) dir.z -= 1;
  if (moveB) dir.z += 1;
  if (moveL) dir.x -= 1;
  if (moveR) dir.x += 1;
  if (joyActive) { dir.x += joyVec.x; dir.z += joyVec.y; }
  dir.normalize();

  if (moveF || moveB || moveL || moveR || joyActive) {
    camera.translateOnAxis(dir, CONFIG.speed * delta);
    camera.position.y = 2;
  }

  // Animação fractal fluida do Tesseract
  cubes.forEach((c, idx) => {
    c.rotation.x += delta * (0.2 + idx * 0.08);
    c.rotation.y += delta * (0.3 - idx * 0.05);
  });

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

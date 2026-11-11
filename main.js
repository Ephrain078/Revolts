import * as THREE from 'three';

const CONFIG = {
  gridSize: 400,
  segments: 150,
  moveSpeed: 25,
  colors: {
    background: 0x000000,
    gridWireframe: 0x00ffff,
    gridBase: 0x00050a,
    sunColor: 0xff00ff
  }
};

const container = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
scene.fog = new THREE.FogExp2(CONFIG.colors.background, 0.005);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Terreno Grid
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

const horizonGrid = new THREE.GridHelper(1000, 100, CONFIG.colors.gridWireframe, 0x003344);
horizonGrid.position.y = -0.1;
scene.add(horizonGrid);

// Tesseract Sol/Lua
const sunGroup = new THREE.Group();
sunGroup.position.set(0, 60, -250);
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

for (let l = 0; l < 4; l++) {
  const scale = Math.pow(0.6, l) * 25;
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

// Controles PC & Mobile
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window);
if (isMobile) document.body.classList.add('mobile');

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let yaw = 0, pitch = 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Mouse look (PC)
container.addEventListener('click', () => {
  if (!isMobile) container.requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
  if (!isMobile && document.pointerLockElement !== container) return;
  if (isMobile) return;

  yaw -= (e.movementX || 0) * 0.002;
  pitch -= (e.movementY || 0) * 0.002;
  pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));

  euler.set(pitch, yaw, 0);
  camera.quaternion.setFromEuler(euler);
});

// Teclado (WASD e Setas)
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

// Joystick Virtual para Celular
let joyActive = false, joyId = null;
let joyVec = { x: 0, y: 0 };
const joystickEl = document.getElementById('joystick');
const stickEl = document.getElementById('stick');

if (joystickEl) {
  joystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    joyActive = true;
    updateJoystick(t);
  }, { passive: false });

  joystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) updateJoystick(t);
    }
  }, { passive: false });

  const endJoy = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyActive = false;
        joyId = null;
        joyVec = { x: 0, y: 0 };
        stickEl.style.transform = 'translate(0, 0)';
      }
    }
  };
  joystickEl.addEventListener('touchend', endJoy, { passive: false });
  joystickEl.addEventListener('touchcancel', endJoy, { passive: false });
}

function updateJoystick(t) {
  const rect = joystickEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = t.clientX - cx;
  let dy = t.clientY - cy;
  const maxR = rect.width / 2 - 10;
  const dist = Math.hypot(dx, dy);

  if (dist > maxR) {
    dx = (dx / dist) * maxR;
    dy = (dy / dist) * maxR;
  }

  stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / maxR;
  joyVec.y = dy / maxR;
}

// Olhar por toque na tela (Mobile)
let lookTouchId = null, lastTouchX = 0, lastTouchY = 0;
container.addEventListener('touchstart', (e) => {
  if (!isMobile) return;
  for (const t of e.changedTouches) {
    if (t.clientX > window.innerWidth * 0.35 && lookTouchId === null) {
      lookTouchId = t.identifier;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }
}, { passive: true });

container.addEventListener('touchmove', (e) => {
  if (!isMobile) return;
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) {
      const dx = t.clientX - lastTouchX;
      const dy = t.clientY - lastTouchY;
      yaw -= dx * 0.005;
      pitch -= dy * 0.005;
      pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
      euler.set(pitch, yaw, 0);
      camera.quaternion.setFromEuler(euler);
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }
}, { passive: true });

container.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) lookTouchId = null;
  }
}, { passive: true });

// Loop de animação
const elFps = document.getElementById('statFps');
const elDist = document.getElementById('statDist');
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

  direction.set(0, 0, 0);
  if (moveForward) direction.z -= 1;
  if (moveBackward) direction.z += 1;
  if (moveLeft) direction.x -= 1;
  if (moveRight) direction.x += 1;

  if (joyActive) {
    direction.x += joyVec.x;
    direction.z += joyVec.y;
  }

  direction.normalize();

  if (moveForward || moveBackward || moveLeft || moveRight || joyActive) {
    const speed = CONFIG.moveSpeed * delta;
    camera.translateOnAxis(direction, speed);
    camera.position.y = 2;
    totalDist += speed;
  }

  subCubes.forEach((cube, i) => {
    cube.rotation.x += delta * (0.2 + i * 0.05);
    cube.rotation.y += delta * (0.3 - i * 0.05);
  });
  wireframeMaterial.opacity = 0.6 + Math.sin(time * 0.003) * 0.2;

  renderer.render(scene, camera);

  if (time - lastTime >= 500) {
    if (elFps) elFps.textContent = Math.round((frameCount * 1000) / (time - lastTime));
    if (elDist) elDist.textContent = `${Math.floor(totalDist)} m`;
    frameCount = 0;
    lastTime = time;
  }
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

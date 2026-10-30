
import * as THREE from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.00045);

const camera = new THREE.PerspectiveCamera(
  65, window.innerWidth / window.innerHeight, 0.1, 30000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();

scene.add(new THREE.HemisphereLight(0x9bdfff, 0x101522, 1.2));

const light = new THREE.DirectionalLight(0xffffff, 1.1);
light.position.set(30, 80, -20);
scene.add(light);

// Mundo aberto: apenas a grade infinita.
const grid = new THREE.GridHelper(
  20000, 400, 0x00eaff, 0x123c50
);
grid.material.transparent = true;
grid.material.opacity = 0.48;
scene.add(grid);

// Materiais da moto.
const dark = new THREE.MeshStandardMaterial({
  color: 0x171d27, metalness: 0.72, roughness: 0.3
});

const metal = new THREE.MeshStandardMaterial({
  color: 0x8795a5, metalness: 0.85, roughness: 0.22
});

const rubber = new THREE.MeshStandardMaterial({
  color: 0x080a0e, roughness: 0.9
});

const bike = new THREE.Group();
scene.add(bike);

function cylinderBetween(parent, a, b, radius, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = new THREE.Vector3().subVectors(end, start);

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius, radius, direction.length(), 10
    ),
    material
  );

  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );

  parent.add(mesh);
  return mesh;
}

// Rodas convencionais.
function createWheel(z) {
  const wheel = new THREE.Group();

  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.13, 10, 24),
    rubber
  );
  tire.rotation.y = Math.PI / 2;
  wheel.add(tire);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.22, 16),
    metal
  );
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  wheel.position.set(0, 0.62, z);
  bike.add(wheel);

  return wheel;
}

const frontWheel = createWheel(1.05);
const rearWheel = createWheel(-1.05);

// Chassi.
cylinderBetween(bike, [0, 0.75, -0.8], [0, 1.1, 0.45], 0.075, metal);
cylinderBetween(bike, [0, 0.75, -0.8], [0, 0.95, 0.9], 0.06, dark);
cylinderBetween(bike, [0, 1.1, 0.45], [0, 1.35, -0.35], 0.07, metal);
cylinderBetween(bike, [0, 0.65, 1.05], [0, 1.35, 0.45], 0.045, metal);

// Motor.
const engine = new THREE.Mesh(
  new THREE.BoxGeometry(0.62, 0.55, 0.7),
  dark
);
engine.position.set(0, 0.88, -0.05);
bike.add(engine);

// Tanque.
const tank = new THREE.Mesh(
  new THREE.SphereGeometry(0.43, 18, 12),
  new THREE.MeshStandardMaterial({
    color: 0x172c3c, metalness: 0.7, roughness: 0.25
  })
);
tank.scale.set(0.78, 0.65, 1.25);
tank.position.set(0, 1.48, 0.05);
bike.add(tank);

// Banco.
const seat = new THREE.Mesh(
  new THREE.BoxGeometry(0.48, 0.16, 0.85),
  rubber
);
seat.position.set(0, 1.48, -0.72);
bike.add(seat);

// Guidão.
cylinderBetween(
  bike, [-0.48, 1.58, 0.95], [0.48, 1.58, 0.95],
  0.035, metal
);

// Farol.
const headlight = new THREE.Mesh(
  new THREE.SphereGeometry(0.19, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xdafcff })
);
headlight.position.set(0, 1.34, 1.12);
bike.add(headlight);

const lamp = new THREE.PointLight(0x8deeff, 2.2, 18);
lamp.position.set(0, 1.3, 1.3);
bike.add(lamp);

bike.userData.wheels = [frontWheel, rearWheel];

// Rastro neon.
const trailPoints = [];
const trailGeometry = new THREE.BufferGeometry();

const trail = new THREE.Line(
  trailGeometry,
  new THREE.LineBasicMaterial({
    color: 0x00eaff,
    transparent: true,
    opacity: 0.95
  })
);
scene.add(trail);

const trailGlow = new THREE.Line(
  trailGeometry,
  new THREE.LineBasicMaterial({
    color: 0x007bff,
    transparent: true,
    opacity: 0.3
  })
);
scene.add(trailGlow);

// Estado e controles.
const state = {
  x: 0,
  z: 0,
  yaw: 0,
  lean: 0,
  speed: 0
};

const keys = {};
const joystick = {
  active: false,
  x: 0,
  y: 0
};

const maxSpeed = 34;
const acceleration = 19;
const braking = 28;
const turnSpeed = 2.1;

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    e.preventDefault();
  }

  if (key === 'w' || key === 'arrowup') keys.forward = true;
  if (key === 's' || key === 'arrowdown') keys.backward = true;
  if (key === 'a' || key === 'arrowleft') keys.left = true;
  if (key === 'd' || key === 'arrowright') keys.right = true;
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();

  if (key === 'w' || key === 'arrowup') keys.forward = false;
  if (key === 's' || key === 'arrowdown') keys.backward = false;
  if (key === 'a' || key === 'arrowleft') keys.left = false;
  if (key === 'd' || key === 'arrowright') keys.right = false;
});

// HUD e joystick para celular.
const controls = document.createElement('div');
controls.innerHTML = `
  <div id="joystick">
    <div id="stick"></div>
  </div>
  <div id="pedals">
    <button id="accelerate">▲</button>
    <button id="brake">▼</button>
  </div>
  <div id="speedometer">0 km/h</div>
`;
document.body.appendChild(controls);

const style = document.createElement('style');
style.textContent = `
  #joystick {
    position:fixed; left:24px; bottom:25px;
    width:116px; height:116px; border-radius:50%;
    border:2px solid #00dfff88; background:#061a2b88;
    touch-action:none;
  }
  #stick {
    position:absolute; left:32px; top:32px;
    width:48px; height:48px; border-radius:50%;
    background:#00dfffaa; border:2px solid #b8faff;
    box-shadow:0 0 15px #00dfff;
  }
  #pedals {
    position:fixed; right:24px; bottom:25px;
    display:flex; flex-direction:column; gap:12px;
  }
  #pedals button {
    width:66px; height:66px; border-radius:50%;
    border:1px solid #00dfff; color:#d9fbff;
    background:#06263acc; font-size:25px;
    touch-action:none;
  }
  #speedometer {
    position:fixed; right:22px; top:20px;
    color:#00eaff; font:18px Arial;
    text-shadow:0 0 8px #00eaff;
  }
`;
document.head.appendChild(style);

const joystickElement = document.getElementById('joystick');
const stick = document.getElementById('stick');

joystickElement.addEventListener('pointerdown', (e) => {
  joystick.active = true;
  joystickElement.setPointerCapture(e.pointerId);
  moveJoystick(e);
});

joystickElement.addEventListener('pointermove', (e) => {
  if (joystick.active) moveJoystick(e);
});

function moveJoystick(e) {
  const rect = joystickElement.getBoundingClientRect();
  let dx = (e.clientX - rect.left - rect.width / 2) / 43;
  let dy = (e.clientY - rect.top - rect.height / 2) / 43;

  const length = Math.hypot(dx, dy);
  if (length > 1) {
    dx /= length;
    dy /= length;
  }

  joystick.x = dx;
  joystick.y = dy;

  stick.style.left = `${32 + dx * 34}px`;
  stick.style.top = `${32 + dy * 34}px`;
}

function releaseJoystick() {
  joystick.active = false;
  joystick.x = 0;
  joystick.y = 0;
  stick.style.left = '32px';
  stick.style.top = '32px';
}

joystickElement.addEventListener('pointerup', releaseJoystick);
joystickElement.addEventListener('pointercancel', releaseJoystick);

function bindButton(id, key) {
  const button = document.getElementById(id);

  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    keys[key] = true;
    button.setPointerCapture(e.pointerId);
  });

  const release = () => keys[key] = false;
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

bindButton('accelerate', 'forward');
bindButton('brake', 'backward');

// Atualização da moto.
function update(dt) {
  const accelerating =
    keys.forward || (joystick.active && joystick.y < -0.25);

  const brakingNow =
    keys.backward || (joystick.active && joystick.y > 0.35);

  if (accelerating) {
    state.speed = Math.min(
      maxSpeed, state.speed + acceleration * dt
    );
  } else if (brakingNow) {
    state.speed = Math.max(0, state.speed - braking * dt);
  } else {
    state.speed = Math.max(0, state.speed - 3.5 * dt);
  }

  let steering = 0;

  if (joystick.active && Math.abs(joystick.x) > 0.12) {
    steering = joystick.x;
  } else {
    if (keys.left) steering -= 1;
    if (keys.right) steering += 1;
  }

  const speedFactor = 0.35 + 0.65 * (state.speed / maxSpeed);

  // Direção contínua: curva livre de 360 graus.
  state.yaw += steering * turnSpeed * speedFactor * dt;

  const targetLean = -steering * 0.32;
  state.lean += (targetLean - state.lean) * Math.min(1, dt * 6);

  const distance = state.speed * dt;
  state.x += Math.sin(state.yaw) * distance;
  state.z += Math.cos(state.yaw) * distance;

  bike.position.set(state.x, 0, state.z);
  bike.rotation.order = 'YXZ';
  bike.rotation.y = state.yaw;
  bike.rotation.z = state.lean;

  for (const wheel of bike.userData.wheels) {
    wheel.rotation.x -= distance / 0.61;
  }

  // Adiciona pontos ao rastro.
  const point = new THREE.Vector3(state.x, 0.12, state.z);
  const last = trailPoints[trailPoints.length - 1];

  if (!last || last.distanceToSquared(point) > 0.12) {
    trailPoints.push(point);
  }

  if (trailPoints.length > 1800) trailPoints.shift();

  trailGeometry.setFromPoints(trailPoints);

  // Câmera acompanha a moto.
  const behind = new THREE.Vector3(
    -Math.sin(state.yaw) * 10,
    5.2,
    -Math.cos(state.yaw) * 10
  );

  const desiredCamera = new THREE.Vector3(
    state.x, 0, state.z
  ).add(behind);

  camera.position.lerp(
    desiredCamera, 1 - Math.exp(-3.2 * dt)
  );

  camera.lookAt(
    state.x + Math.sin(state.yaw) * 4,
    1.1,
    state.z + Math.cos(state.yaw) * 4
  );

  document.getElementById('speedometer').textContent =
    `${Math.round(state.speed * 3.6)} km/h`;
}

// Câmera inicial.
camera.position.set(0, 7, -13);
camera.lookAt(0, 0, 0);

// Loop.
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('blur', () => {
  for (const key in keys) keys[key] = false;
  releaseJoystick();
});

animate();

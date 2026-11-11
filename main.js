// ================= CONFIG =================
let CONFIG = {
  gridSize: 400,
  divisions: 400,
  moveSpeed: 8,
  gravity: 22,
  jumpForce: 9,
  playerHeight: 1.7,
  fogNear: 40,
  fogFar: 180,
  bgColor: 0x00e5ff,
  gridColor: 0x00ffff,
  gridSecondary: 0x0088aa
};

// Carrega config externa (opcional)
fetch('public/config.json')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(cfg => { CONFIG = { ...CONFIG, ...cfg }; })
  .catch(() => {})
  .finally(init);

// ================= INIT =================
function init() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.bgColor);
  scene.fog = new THREE.Fog(CONFIG.bgColor, CONFIG.fogNear, CONFIG.fogFar);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // ===== GRADE TRON =====
  const grid = new THREE.GridHelper(CONFIG.gridSize, CONFIG.divisions, CONFIG.gridColor, CONFIG.gridSecondary);
  grid.material.transparent = true;
  grid.material.opacity = 0.9;
  scene.add(grid);

  const grid2 = new THREE.GridHelper(CONFIG.gridSize, 40, CONFIG.gridColor, CONFIG.gridColor);
  grid2.material.transparent = true;
  grid2.material.opacity = 0.7;
  grid2.position.y = 0.01;
  scene.add(grid2);

  // ===== LUZES =====
  scene.add(new THREE.AmbientLight(CONFIG.bgColor, 1.2));
  const dir = new THREE.DirectionalLight(CONFIG.gridColor, 0.8);
  dir.position.set(1, 2, 1);
  scene.add(dir);

  // ===== JOGADOR =====
  const player = {
    pos: new THREE.Vector3(0, CONFIG.playerHeight, 0),
    velocity: new THREE.Vector3(),
    onGround: true,
    yaw: 0,
    pitch: 0
  };

  // ===== CONTROLES =====
  const keys = {};
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window);
  if (isMobile) document.body.classList.add('mobile');

  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => keys[e.code] = false);

  // Mouse look
  let mouseLocked = false;
  const canvas = renderer.domElement;

  canvas.addEventListener('click', () => {
    if (!isMobile) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    mouseLocked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', e => {
    if (!mouseLocked) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));
  });

  // ===== JOYSTICK MOBILE =====
  const joystick = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  const jumpBtn = document.getElementById('jumpBtn');
  let joyActive = false, joyId = null;
  let joyVec = { x: 0, y: 0 };
  let jumpPressed = false;

  function updateJoy(t) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const maxR = rect.width / 2 - 10;
    const d = Math.hypot(dx, dy);
    if (d > maxR) { dx = dx / d * maxR; dy = dy / d * maxR; }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec.x = dx / maxR;
    joyVec.y = dy / maxR;
  }

  joystick.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    joyActive = true;
    updateJoy(t);
  }, { passive: false });

  joystick.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) updateJoy(t);
  }, { passive: false });

  const endJoy = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyActive = false; joyId = null;
        joyVec = { x: 0, y: 0 };
        stick.style.transform = 'translate(0,0)';
      }
    }
  };
  joystick.addEventListener('touchend', endJoy, { passive: false });
  joystick.addEventListener('touchcancel', endJoy, { passive: false });

  jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); jumpPressed = true; }, { passive: false });
  jumpBtn.addEventListener('touchend', e => { e.preventDefault(); jumpPressed = false; }, { passive: false });

  // Look mobile (arrastar no lado direito)
  let lookTouchId = null, lastLook = null;
  canvas.addEventListener('touchstart', e => {
    if (!isMobile) return;
    for (const t of e.changedTouches) {
      if (t.clientX > innerWidth * 0.4 && lookTouchId === null) {
        lookTouchId = t.identifier;
        lastLook = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (!isMobile) return;
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) {
        const dx = t.clientX - lastLook.x;
        const dy = t.clientY - lastLook.y;
        player.yaw -= dx * 0.005;
        player.pitch -= dy * 0.005;
        player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));
        lastLook = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) { lookTouchId = null; lastLook = null; }
    }
  }, { passive: false });

  // ===== HUD =====
  const hud = document.getElementById('hud');
  const startPos = new THREE.Vector2(0, 0);
  let distance = 0;

  // ===== LOOP =====
  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const lookDir = new THREE.Vector3();

  function update(dt) {
    forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    let mx = 0, mz = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    mz += 1;
    if (keys['KeyS'] || keys['ArrowDown'])  mz -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;

    if (joyActive) { mx += joyVec.x; mz -= joyVec.y; }

    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    move.set(0, 0, 0);
    move.addScaledVector(forward, mz);
    move.addScaledVector(right, mx);
    move.multiplyScalar(CONFIG.moveSpeed * dt);

    player.pos.x += move.x;
    player.pos.z += move.z;

    const wantJump = keys['Space'] || jumpPressed;
    if (wantJump && player.onGround) {
      player.velocity.y = CONFIG.jumpForce;
      player.onGround = false;
    }

    player.velocity.y -= CONFIG.gravity * dt;
    player.pos.y += player.velocity.y * dt;

    if (player.pos.y <= CONFIG.playerHeight) {
      player.pos.y = CONFIG.playerHeight;
      player.velocity.y = 0;
      player.onGround = true;
    }

    // Distância percorrida
    const dx = player.pos.x - startPos.x;
    const dz = player.pos.z - startPos.y;
    distance = Math.hypot(dx, dz);
    hud.textContent = `DIST: ${Math.floor(distance)} m`;

    // Câmera
    camera.position.copy(player.pos);
    lookDir.set(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch)
    );
    camera.lookAt(
      player.pos.x + lookDir.x,
      player.pos.y + lookDir.y,
      player.pos.z + lookDir.z
    );

    // Grade segue jogador
    grid.position.x = Math.round(player.pos.x / 10) * 10;
    grid.position.z = Math.round(player.pos.z / 10) * 10;
    grid2.position.x = grid.position.x;
    grid2.position.z = grid.position.z;
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    renderer.render(scene, camera);
  }
  animate();

  // ===== RESIZE =====
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

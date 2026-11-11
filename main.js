// ================= CONFIG PADRÃO =================
let CONFIG = {
  bgColor: "#000000",
  fogColor: "#000000",
  gridColor: "#00ffff",
  gridSecondary: "#003344",
  gridSize: 400,
  divisions: 400,
  moveSpeed: 8,
  gravity: 22,
  jumpForce: 9,
  playerHeight: 1.7,
  fogNear: 60,
  fogFar: 220,
  maxPixelRatio: 1.5,
  minPixelRatio: 0.5,
  targetFPS: 60
};

fetch('public/config.json')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(cfg => { CONFIG = { ...CONFIG, ...cfg }; })
  .catch(() => {})
  .finally(() => {
    if (document.getElementById('game-canvas-container')) {
      init();
    }
    initDynamicYear();
  });

function initDynamicYear() {
  const currentYear = new Date().getFullYear();
  const yearEls = document.querySelectorAll('.dynamic-year');
  yearEls.forEach(el => {
    el.textContent = currentYear;
  });
}

// ================= INIT =================
function init() {
  const container = document.getElementById('game-canvas-container');
  if (!container) return;

  // ---------- CENA ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.bgColor);
  scene.fog = new THREE.Fog(new THREE.Color(CONFIG.fogColor), CONFIG.fogNear, CONFIG.fogFar);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);

  // ---------- RENDERER ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
    stencil: false,
    depth: true
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.autoClear = true;
  container.appendChild(renderer.domElement);

  // ---------- GRADE NEON ----------
  const gridFine = new THREE.GridHelper(
    CONFIG.gridSize,
    Math.min(CONFIG.divisions, 200),
    new THREE.Color(CONFIG.gridColor),
    new THREE.Color(CONFIG.gridSecondary)
  );
  gridFine.material.transparent = true;
  gridFine.material.opacity = 0.35;
  gridFine.material.depthWrite = false;
  gridFine.frustumCulled = false;
  scene.add(gridFine);

  const gridBright = new THREE.GridHelper(
    CONFIG.gridSize,
    40,
    new THREE.Color(CONFIG.gridColor),
    new THREE.Color(CONFIG.gridColor)
  );
  gridBright.material.transparent = true;
  gridBright.material.opacity = 0.9;
  gridBright.material.depthWrite = false;
  gridBright.position.y = 0.01;
  gridBright.frustumCulled = false;
  scene.add(gridBright);

  // ---------- LUZES ----------
  scene.add(new THREE.AmbientLight(0x020a10, 0.4));
  const dir = new THREE.DirectionalLight(new THREE.Color(CONFIG.gridColor), 0.2);
  dir.position.set(1, 2, 1);
  scene.add(dir);

  // ---------- JOGADOR ----------
  const player = {
    pos: new THREE.Vector3(0, CONFIG.playerHeight, 0),
    velocity: new THREE.Vector3(),
    onGround: true,
    yaw: 0,
    pitch: 0
  };

  // ================= CONTROLES =================
  const keys = {};
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || ('ontouchstart' in window);
  if (isMobile) document.body.classList.add('mobile');

  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => keys[e.code] = false);

  // ---- Mouse look ----
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
    markDirty();
  });

  // ---- Joystick mobile ----
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
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const maxR = rect.width / 2 - 10;
    const d = Math.hypot(dx, dy);
    if (d > maxR) { dx = dx / d * maxR; dy = dy / d * maxR; }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec.x = dx / maxR;
    joyVec.y = dy / maxR;
    markDirty();
  }

  if (joystick) {
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
          markDirty();
        }
      }
    };
    joystick.addEventListener('touchend', endJoy, { passive: false });
    joystick.addEventListener('touchcancel', endJoy, { passive: false });
  }

  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); jumpPressed = true; markDirty(); }, { passive: false });
    jumpBtn.addEventListener('touchend', e => { e.preventDefault(); jumpPressed = false; }, { passive: false });
  }

  // ---- Look por toque ----
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
        markDirty();
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) { lookTouchId = null; lastLook = null; }
    }
  }, { passive: false });

  // ================= HUD =================
  const distEl = document.getElementById('dist');
  const fpsEl  = document.getElementById('fps');
  const startPos = new THREE.Vector2(0, 0);
  let lastDistText = '';

  function formatDistance(meters) {
    if (meters < 1000) return `${Math.floor(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }

  // ================= ADAPTIVE RENDER =================
  let currentPixelRatio = Math.min(devicePixelRatio, CONFIG.maxPixelRatio);
  let fpsFrames = 0, lastFpsCheck = performance.now();
  let displayFps = 0;
  const LOW_FPS = 40, HIGH_FPS = 58;

  function adjustQuality(now) {
    const elapsed = now - lastFpsCheck;
    if (elapsed < 1000) return;
    displayFps = Math.round((fpsFrames * 1000) / elapsed);
    if (fpsEl) fpsEl.textContent = `FPS: ${displayFps}`;
    lastFpsCheck = now;
    fpsFrames = 0;

    let pr = currentPixelRatio;
    if (displayFps < LOW_FPS && pr > CONFIG.minPixelRatio) {
      pr = Math.max(CONFIG.minPixelRatio, pr - 0.15);
    } else if (displayFps > HIGH_FPS && pr < CONFIG.maxPixelRatio) {
      pr = Math.min(CONFIG.maxPixelRatio, pr + 0.1);
    }
    if (pr !== currentPixelRatio) {
      currentPixelRatio = pr;
      renderer.setPixelRatio(pr);
      renderer.setSize(innerWidth, innerHeight, false);
    }
  }

  // ================= LOOP =================
  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const lookDir = new THREE.Vector3();

  let dirty = true;
  let lastFrameTime = performance.now();
  const IDLE_RENDER_INTERVAL = 100;

  function markDirty() { dirty = true; }

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

    const moving = mx !== 0 || mz !== 0;
    const wantJump = keys['Space'] || jumpPressed;

    move.set(0, 0, 0);
    if (moving) {
      move.addScaledVector(forward, mz);
      move.addScaledVector(right, mx);
      move.multiplyScalar(CONFIG.moveSpeed * dt);
      player.pos.x += move.x;
      player.pos.z += move.z;
      markDirty();
    }

    if (wantJump && player.onGround) {
      player.velocity.y = CONFIG.jumpForce;
      player.onGround = false;
      markDirty();
    }

    if (!player.onGround) {
      player.velocity.y -= CONFIG.gravity * dt;
      player.pos.y += player.velocity.y * dt;
      if (player.pos.y <= CONFIG.playerHeight) {
        player.pos.y = CONFIG.playerHeight;
        player.velocity.y = 0;
        player.onGround = true;
      }
      markDirty();
    }

    const dx = player.pos.x - startPos.x;
    const dz = player.pos.z - startPos.y;
    const distMeters = Math.hypot(dx, dz);
    const newText = `DIST: ${formatDistance(distMeters)}`;
    if (newText !== lastDistText && distEl) {
      lastDistText = newText;
      distEl.textContent = newText;
    }

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

    const gx = Math.round(player.pos.x / 10) * 10;
    const gz = Math.round(player.pos.z / 10) * 10;
    if (gridFine.position.x !== gx || gridFine.position.z !== gz) {
      gridFine.position.x = gx;
      gridFine.position.z = gz;
      gridBright.position.x = gx;
      gridBright.position.z = gz;
      markDirty();
    }

    return moving || !player.onGround || dirty;
  }

  function loop(now) {
    requestAnimationFrame(loop);

    if (!dirty && now - lastFrameTime < IDLE_RENDER_INTERVAL) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const shouldRender = update(dt);

    if (shouldRender || dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }

    fpsFrames++;
    lastFrameTime = now;
    adjustQuality(now);
  }

  requestAnimationFrame(loop);

  // ================= RESIZE =================
  let resizeTimeout = null;
  addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      markDirty();
    }, 100);
  });

  // ================= VISIBILITY =================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      clock.getDelta();
      markDirty();
    }
  });
}

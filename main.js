// ================= REVOLTS: TESSERACT ENGINE (ULTRA LIGHTWEIGHT) =================
let CONFIG = {
  bgColor: "#000000",
  gridColor: "#00ffff",
  hyperColor: "#ff00ff",
  maxPixelRatio: 1.5
};

fetch('public/config.json')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(cfg => { CONFIG = { ...CONFIG, ...cfg }; })
  .catch(() => {})
  .finally(() => {
    if (document.getElementById('game-canvas-container')) {
      initTesseractEngine();
    }
    initDynamicYear();
  });

function initDynamicYear() {
  const currentYear = new Date().getFullYear();
  document.querySelectorAll('.dynamic-year').forEach(el => {
    el.textContent = currentYear;
  });
}

function initTesseractEngine() {
  const container = document.getElementById('game-canvas-container');
  if (!container) return;
  container.innerHTML = '';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.bgColor);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 5);

  const renderer = new THREE.WebGLRenderer({
    antialias: false, // Desativado para economizar GPU massivamente
    powerPreference: "high-performance",
    alpha: false
  });
  
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);

  // ---------- TESSERACT FRACTAL OTIMIZADO (8x8) ----------
  const tesseractGroup = new THREE.Group();
  scene.add(tesseractGroup);

  const hyperCubes = [];
  const levels = 6; // Otimizado para 6 níveis profundos com zero lag

  const baseVertices = [
    [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
    [-1,-1,1],  [1,-1,1],  [1,1,1],  [-1,1,1]
  ];

  const baseEdges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];

  for (let l = 0; l < levels; l++) {
    const scaleFactor = Math.pow(0.7, l);
    const subGroup = new THREE.Group();
    
    for (let sub = 0; sub < 4; sub++) { // Reduzido para 4 instâncias por nível (leveza extrema)
      const geometry = new THREE.BufferGeometry();
      const positions = [];

      baseEdges.forEach(edge => {
        positions.push(...baseVertices[edge[0]], ...baseVertices[edge[1]]);
      });

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: l % 2 === 0 ? CONFIG.gridColor : CONFIG.hyperColor,
        transparent: true,
        opacity: Math.max(0.2, 1.0 - (l * 0.15))
      });

      const wireframeCube = new THREE.LineSegments(geometry, material);
      wireframeCube.scale.set(scaleFactor, scaleFactor, scaleFactor);
      
      const angleOffset = (sub / 4) * Math.PI * 2;
      wireframeCube.position.set(
        Math.cos(angleOffset) * (l * 0.15),
        Math.sin(angleOffset) * (l * 0.15),
        0
      );

      subGroup.add(wireframeCube);
    }

    tesseractGroup.add(subGroup);
    hyperCubes.push(subGroup);
  }

  // Grade de fundo leve
  const gridHelper = new THREE.GridHelper(40, 20, new THREE.Color(CONFIG.gridColor), new THREE.Color(0x001122));
  gridHelper.position.y = -2;
  scene.add(gridHelper);

  // ================= INTERAÇÃO =================
  let mouseX = 0, mouseY = 0;
  const windowHalfX = innerWidth / 2;
  const windowHalfY = innerHeight / 2;

  document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX - windowHalfX) * 0.0008;
    mouseY = (event.clientY - windowHalfY) * 0.0008;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 0) {
      mouseX = (event.touches[0].clientX - windowHalfX) * 0.001;
      mouseY = (event.touches[0].clientY - windowHalfY) * 0.001;
    }
  }, { passive: true });

  // ================= LOOP DE RENDERIZAÇÃO ESTÁVEL (60 FPS TRAVADOS) =================
  const clock = new THREE.Clock();
  let targetRotationX = 0, targetRotationY = 0;

  function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();

    targetRotationX = mouseY * 1.5 + Math.sin(time * 0.4) * 0.2;
    targetRotationY = mouseX * 1.5 + time * 0.15;

    tesseractGroup.rotation.x += (targetRotationX - tesseractGroup.rotation.x) * 0.05;
    tesseractGroup.rotation.y += (targetRotationY - tesseractGroup.rotation.y) * 0.05;

    hyperCubes.forEach((group, index) => {
      const speed = (index % 2 === 0 ? 1 : -1) * (0.08 + index * 0.01);
      group.rotation.z = time * speed;
    });

    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

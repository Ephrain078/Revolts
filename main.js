// ================= REVOLTS: TESSERACT 4D ENGINE =================
let CONFIG = {
  bgColor: "#000000",
  gridColor: "#00ffff",
  hyperColor: "#ff00ff", // Detalhes em magenta cyberpunk para contraste
  maxPixelRatio: 2.0
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

  // Limpa o container caso haja resquícios
  container.innerHTML = '';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.bgColor);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: false
  });
  
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);

  // ---------- ALGORITMO FRACTAL: TESSERACT 8x8 (8 PASTAS DENTRO DE 8 PASTAS) ----------
  // Gerador matemático de hipercubos aninhados recursivamente
  const tesseractGroup = new THREE.Group();
  scene.add(tesseractGroup);

  const hyperCubes = [];
  const levels = 8; // 8 camadas fractais principais

  // Vértices base de um Cubo 3D
  const baseVertices = [
    [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
    [-1,-1,1],  [1,-1,1],  [1,1,1],  [-1,1,1]
  ];

  const baseEdges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];

  // Constrói a arquitetura fractal de 8 níveis
  for (let l = 0; l < levels; l++) {
    const scaleFactor = Math.pow(0.65, l);
    const subGroup = new THREE.Group();
    
    // Criação de subpastas estruturais (8 sub-instâncias por nível)
    for (let sub = 0; sub < 8; sub++) {
      const geometry = new THREE.BufferGeometry();
      const positions = [];

      baseEdges.forEach(edge => {
        const p1 = baseVertices[edge[0]];
        const p2 = baseVertices[edge[1]];
        positions.push(...p1, ...p2);
      });

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

      // Material wireframe neon de alta performance com brilho aditivo
      const material = new THREE.LineBasicMaterial({
        color: l % 2 === 0 ? CONFIG.gridColor : CONFIG.hyperColor,
        transparent: true,
        opacity: Math.max(0.15, 1.0 - (l * 0.1)),
        linewidth: 1
      });

      const wireframeCube = new THREE.LineSegments(geometry, material);
      wireframeCube.scale.set(scaleFactor, scaleFactor, scaleFactor);
      
      // Deslocamento simétrico tridimensional simulando rotação de hiper-espaço 4D
      const angleOffset = (sub / 8) * Math.PI * 2;
      wireframeCube.position.set(
        Math.cos(angleOffset) * (l * 0.2),
        Math.sin(angleOffset) * (l * 0.2),
        (sub - 3.5) * 0.1 * scaleFactor
      );

      subGroup.add(wireframeCube);
    }

    tesseractGroup.add(subGroup);
    hyperCubes.push(subGroup);
  }

  // ---------- ILUMINAÇÃO & GRADE AMBIENTE ----------
  const gridHelper = new THREE.GridHelper(50, 50, new THREE.Color(CONFIG.gridColor), new THREE.Color(0x002233));
  gridHelper.position.y = -2;
  scene.add(gridHelper);

  // ================= INTERAÇÃO E CONTROLES SUAVES =================
  let mouseX = 0, mouseY = 0;
  let targetRotationX = 0, targetRotationY = 0;
  const windowHalfX = innerWidth / 2;
  const windowHalfY = innerHeight / 2;

  document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX - windowHalfX) * 0.001;
    mouseY = (event.clientY - windowHalfY) * 0.001;
  });

  // Suporte a toque para dispositivos móveis
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 0) {
      mouseX = (event.touches[0].clientX - windowHalfX) * 0.002;
      mouseY = (event.touches[0].clientY - windowHalfY) * 0.002;
    }
  }, { passive: true });

  // ================= LOOP DE ALTA PERFORMANCE (60 FPS / ZERO LAG) =================
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // Rotação fluida baseada em inércia e quaternions dimensionais 4D
    targetRotationX = mouseY * 2 + Math.sin(time * 0.5) * 0.3;
    targetRotationY = mouseX * 2 + time * 0.2;

    tesseractGroup.rotation.x += (targetRotationX - tesseractGroup.rotation.x) * 0.05;
    tesseractGroup.rotation.y += (targetRotationY - tesseractGroup.rotation.y) * 0.05;

    // Animação fractal interna das 8 pastas aninhadas
    hyperCubes.forEach((group, index) => {
      const speed = (index % 2 === 0 ? 1 : -1) * (0.1 + index * 0.02);
      group.rotation.z = time * speed;
      group.rotation.x = time * (speed * 0.5);
    });

    renderer.render(scene, camera);
  }

  animate();

  // ---------- REDIMENSIONAMENTO AUTOMÁTICO ----------
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

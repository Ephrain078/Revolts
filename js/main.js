import { createScene } from './core/scene.js';
import { InfiniteGrid } from './world/grid.js';
import { HorizonFog } from './world/fog.js';
import { Tesseract } from './world/tesseract.js';
import { DesktopControls } from './controls/desktop.js';
import { MobileControls } from './controls/mobile.js';
import { initAds } from './utils/ads.js';

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;

async function init() {
    const { scene, camera, renderer } = createScene();

    // --- Mundo ---
    const grid = new InfiniteGrid();
    grid.addTo(scene);

    const fog = new HorizonFog();
    scene.add(fog.mesh);

    const tesseract = new Tesseract();
    scene.add(tesseract.mesh);

    // --- Controles ---
    let controls;
    if (isMobile) {
        const mobileUi = document.getElementById('mobile-ui');
        if (mobileUi) mobileUi.classList.remove('hidden');
        
        controls = new MobileControls(
            camera,
            document.getElementById('joystick-base'),
            document.getElementById('joystick-knob'),
            document.getElementById('jump-button'),
            renderer.domElement
        );
    } else {
        controls = new DesktopControls(camera, renderer.domElement);
    }

    // --- Resize ---
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    initAds();

    // --- HUD ---
    const fpsEl   = document.getElementById('fps-value');
    const distEl  = document.getElementById('dist-value');
    const chunkEl = document.getElementById('chunk-value');

    let hudTimer = 0;
    let frameCount = 0;
    let distance = 0;
    const lastPos = camera.position.clone();

    // --- Resolução adaptativa ---
    const MAX_PR = Math.min(window.devicePixelRatio, 2);
    const MIN_PR = 0.75;
    let currentPR = MAX_PR;
    let lowFpsTime = 0;
    let highFpsTime = 0;

    // --- Loop principal ---
    let lastTime = performance.now();

    function animate(now) {
        requestAnimationFrame(animate);

        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        controls.update(dt);
        grid.update(dt, camera);
        fog.update(dt, camera);
        tesseract.update(dt, camera);

        // Distância percorrida
        const dx = camera.position.x - lastPos.x;
        const dz = camera.position.z - lastPos.z;
        distance += Math.sqrt(dx * dx + dz * dz);
        lastPos.copy(camera.position);

        // HUD (a cada 250ms)
        frameCount++;
        hudTimer += dt;
        if (hudTimer >= 0.25) {
            const fps = Math.round(frameCount / hudTimer);
            if (fpsEl) fpsEl.textContent   = fps;
            if (distEl) distEl.textContent  = distance.toFixed(1);
            if (chunkEl) chunkEl.textContent = `${grid.currentCX},${grid.currentCZ}`;

            // Resolução adaptativa
            if (fps < 45) {
                lowFpsTime += hudTimer;
                highFpsTime = 0;
                if (lowFpsTime > 2 && currentPR > MIN_PR) {
                    currentPR = Math.max(MIN_PR, currentPR - 0.25);
                    renderer.setPixelRatio(currentPR);
                    lowFpsTime = 0;
                }
            } else if (fps > 58) {
                highFpsTime += hudTimer;
                lowFpsTime = 0;
                if (highFpsTime > 3 && currentPR < MAX_PR) {
                    currentPR = Math.min(MAX_PR, currentPR + 0.1);
                    renderer.setPixelRatio(currentPR);
                    highFpsTime = 0;
                }
            } else {
                lowFpsTime = 0;
                highFpsTime = 0;
            }

            frameCount = 0;
            hudTimer = 0;
        }

        renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);
}

init().catch(err => {
    console.error(err);
    document.body.innerHTML = '<pre style="color:#ff00ff;padding:2em;font-family:monospace;background:#000;height:100vh;overflow:auto;">Erro ao iniciar The Grid:\n\n' + (err.stack || err) + '</pre>';
});

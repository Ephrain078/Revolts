import { createScene } from './core/scene.js';
import { InfiniteGrid } from './world/grid.js';
import { HorizonFog } from './world/fog.js';
import { Tesseract } from './world/tesseract.js';
import { DesktopControls } from './controls/desktop.js';
import { MobileControls } from './controls/mobile.js';
import { initAds } from './utils/ads.js';

const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.innerWidth < 768;

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
        const mobileUI = document.getElementById('mobile-ui');
        if (mobileUI) mobileUI.classList.remove('hidden');

        controls = new MobileControls(
            camera,
            document.getElementById('joystick-base'),
            document.getElementById('joystick-knob'),
            document.getElementById('jump-button'),
            renderer.domElement
        );
    } else {
        controls = new DesktopControls(camera, renderer.domElement);

        // Libera o pointer lock através do overlay de instruções
        const instructions = document.getElementById('instructions');
        if (instructions) {
            instructions.addEventListener('click', () => {
                instructions.style.opacity = '0';
                setTimeout(() => { instructions.style.display = 'none'; }, 500);
                renderer.domElement.requestPointerLock();
            });
        }
    }

    // --- Resolução adaptativa (variáveis no escopo da função) ---
    let MAX_PR = Math.min(window.devicePixelRatio, 2);
    const MIN_PR = 0.75;
    let currentPR = MAX_PR;
    renderer.setPixelRatio(currentPR);

    // --- Resize (preserva o PR adaptativo) ---
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        MAX_PR = Math.min(window.devicePixelRatio, 2);
        currentPR = Math.min(currentPR, MAX_PR);
        renderer.setPixelRatio(currentPR);
    });

    initAds();

    // --- HUD ---
    const fpsEl = document.getElementById('fps-value');
    const distEl = document.getElementById('dist-value');
    const chunkEl = document.getElementById('chunk-value');

    let hudTimer = 0;
    let frameCount = 0;
    let distance = 0;
    const lastPos = camera.position.clone();

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

        const dx = camera.position.x - lastPos.x;
        const dz = camera.position.z - lastPos.z;
        distance += Math.sqrt(dx * dx + dz * dz);
        lastPos.copy(camera.position);

        frameCount++;
        hudTimer += dt;
        if (hudTimer >= 0.25) {
            const fps = Math.round(frameCount / hudTimer);
            if (fpsEl) fpsEl.textContent = fps;
            if (distEl) distEl.textContent = distance.toFixed(1);
            if (chunkEl) chunkEl.textContent = `${grid.currentCX},${grid.currentCZ}`;

            // --- Resolução adaptativa ---
            if (fps < 45) {
                currentPR = Math.max(MIN_PR, currentPR - 0.25);
                renderer.setPixelRatio(currentPR);
            } else if (fps > 58 && currentPR < MAX_PR) {
                currentPR = Math.min(MAX_PR, currentPR + 0.1);
                renderer.setPixelRatio(currentPR);
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

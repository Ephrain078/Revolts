import { createScene } from './core/scene.js';
import { Grid } from './world/grid.js';
import { HorizonFog } from './world/fog.js';
import { Tesseract } from './world/tesseract.js';
import { DesktopControls } from './controls/desktop.js';
import { MobileControls } from './controls/mobile.js';
import { initAds } from './utils/ads.js';

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;

async function init() {
    const { scene, camera, renderer } = createScene();

    const grid = new Grid();              scene.add(grid.mesh);
    const fog = new HorizonFog();         scene.add(fog.mesh);
    const tesseract = new Tesseract();    scene.add(tesseract.mesh);

    let controls;
    if (isMobile) {
        document.getElementById('mobile-ui').classList.remove('hidden');
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

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    initAds();

    let lastTime = performance.now();
    function animate(now) {
        requestAnimationFrame(animate);
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        controls.update(dt);
        grid.update(dt, camera);
        fog.update(dt, camera);
        tesseract.update(dt);

        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
}

init().catch(err => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#ff00ff;padding:2em;font-family:monospace;">Erro ao iniciar The Grid:\n\n${err.stack || err}</pre>`;
});
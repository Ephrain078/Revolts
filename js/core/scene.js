import * as THREE from 'three';

export function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.015);

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: 'high-performance',
        alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    document.getElementById('game-container').appendChild(renderer.domElement);

    return { scene, camera, renderer };
}
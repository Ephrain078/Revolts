import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

class TronEngine {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020205);
        this.scene.fog = new THREE.FogExp2(0x020205, 0.002);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.camera.position.set(300, 200, 300);

        this.initGrid();
        this.loadPalmasSeed();
        this.animate();

        window.addEventListener('resize', () => this.onResize());
    }

    initGrid() {
        // Grade Neon infinita
        const size = 10000;
        const divisions = 200;
        const grid = new THREE.GridHelper(size, divisions, 0x00ffff, 0x002222);
        this.scene.add(grid);
    }

    async loadPalmasSeed() {
        try {
            const response = await fetch('public/mapa_bit.json');
            const data = await response.json();
            const keys = Object.keys(data.chunks);
            
            // Geometria de Bloco Tron (1x1)
            const geometry = new THREE.BoxGeometry(2, 2, 2);
            const material = new THREE.MeshBasicMaterial({ 
                color: 0x00ffff,
                transparent: true,
                opacity: 0.8
            });

            const iMesh = new THREE.InstancedMesh(geometry, material, keys.length);
            const dummy = new THREE.Object3D();

            keys.forEach((key, i) => {
                const chunk = data.chunks[key];
                // Posicionamento baseado no Marco Zero de Palmas
                dummy.position.set(chunk.bounds.x, chunk.bounds.y, chunk.bounds.z);
                dummy.scale.set(1, Math.random() * 20, 1); // Altura procedural (Prédios Neon)
                dummy.updateMatrix();
                iMesh.setMatrixAt(i, dummy.matrix);
            });

            this.scene.add(iMesh);
            console.log("Palmas Reconstruída na Grade.");
        } catch (e) {
            console.error("Erro ao germinar semente:", e);
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

new TronEngine();
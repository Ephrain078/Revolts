import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class NeonVoxelEngine {
    constructor() {
        this.initScene();
        this.initCamera();
        this.initRenderer();
        this.initControls();
        this.initLighting();
        this.initEnvironment();
        
        this.chunks = new Map();
        this.chunkSize = 16;
        this.voxelSize = 2; // Tamanho do bloco Minecraftiano
        
        this.generateInitialWorld();
        this.animate();

        window.addEventListener('resize', () => this.onResize());
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020205);
        // Névoa neon profunda para o efeito infinito
        this.scene.fog = new THREE.FogExp2(0x020205, 0.015);
    }

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(20, 20, 20);
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        document.body.appendChild(this.renderer.domElement);
    }

    initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 500;
    }

    initLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
        dirLight.position.set(100, 100, 50);
        this.scene.add(dirLight);

        const pointLight = new THREE.PointLight(0xff00ff, 1, 100);
        pointLight.position.set(0, 5, 0);
        this.scene.add(pointLight);
    }

    initEnvironment() {
        // Grade Infinita Estilo Tron
        const size = 2000;
        const divisions = 100;
        const grid = new THREE.GridHelper(size, divisions, 0x00ffff, 0x002233);
        grid.position.y = -0.5;
        this.scene.add(grid);
    }

    generateInitialWorld() {
        // Gera um terreno voxelizado proceduralmente
        for (let x = -4; x < 4; x++) {
            for (let z = -4; z < 4; z++) {
                this.generateChunk(x, z);
            }
        }
    }

    generateChunk(chunkX, chunkZ) {
        const voxels = [];
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                // Ruído simples para altura dos blocos
                const height = Math.floor(Math.abs(Math.sin(worldX * 0.1) * Math.cos(worldZ * 0.1)) * 10) + 1;

                for (let y = 0; y < height; y++) {
                    voxels.push({
                        x: (worldX - (chunkX * this.chunkSize)) * this.voxelSize,
                        y: y * this.voxelSize,
                        z: (worldZ - (chunkZ * this.chunkSize)) * this.voxelSize
                    });
                }
            }
        }
        
        this.renderChunk(chunkX, chunkZ, voxels);
    }

    renderChunk(chunkX, chunkZ, voxels) {
        if (voxels.length === 0) return;

        const geometry = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);
        // Material neon com reflexos
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x005555,
            roughness: 0.2,
            metalness: 0.8
        });

        const instancedMesh = new THREE.InstancedMesh(geometry, material, voxels.length);
        const dummy = new THREE.Object3D();

        voxels.forEach((v, i) => {
            dummy.position.set(
                v.x + (chunkX * this.chunkSize * this.voxelSize),
                v.y,
                v.z + (chunkZ * this.chunkSize * this.voxelSize)
            );
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        });

        this.scene.add(instancedMesh);
        this.chunks.set(`${chunkX},${chunkZ}`, instancedMesh);
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

new NeonVoxelEngine();


import * as THREE from 'three';

const CHUNK_SIZE = 100;
const VIEW_RADIUS = 3;
const MAX_PILLARS = 150;
const MAX_CRYSTALS = 300;

const VERT = /* glsl */`
    varying vec2 vWorldPos;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

const FRAG = /* glsl */`
    uniform float uTime;
    uniform vec3  uColor;
    uniform vec2  uCameraPos;
    varying vec2 vWorldPos;

    float gridFactor(vec2 p, float spacing) {
        vec2 coord = p / spacing;
        vec2 d = abs(fract(coord - 0.5) - 0.5) / max(fwidth(coord), vec2(1e-5));
        return 1.0 - min(min(d.x, d.y), 1.0);
    }

    void main() {
        float minor = gridFactor(vWorldPos, 1.0)  * 0.22;
        float major = gridFactor(vWorldPos, 10.0) * 0.85;
        float grid  = max(minor, major);

        float dist  = length(vWorldPos - uCameraPos);
        float fade  = 1.0 - smoothstep(180.0, 290.0, dist);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.5 - dist * 0.3);

        gl_FragColor = vec4(uColor * grid * fade * pulse, grid * fade);
    }
`;

function hash01(x, z) {
    let h = (x * 374761393 + z * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class InfiniteGrid {
    constructor() {
        this.time = 0;
        this.lastCX = null;
        this.lastCZ = null;
        this.currentCX = 0;
        this.currentCZ = 0;

        this.chunkPool = [];
        this.activeChunks = new Map();

        this.gridUniforms = {
            uTime:      { value: 0 },
            uColor:     { value: new THREE.Color(0x00ffff) },
            uCameraPos: { value: new THREE.Vector2(0, 0) },
        };

        this.gridMaterial = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: this.gridUniforms,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        const chunkGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
        chunkGeo.rotateX(-Math.PI / 2);

        const totalChunks = (VIEW_RADIUS * 2 + 1) ** 2;
        for (let i = 0; i < totalChunks; i++) {
            const mesh = new THREE.Mesh(chunkGeo, this.gridMaterial);
            mesh.visible = false;
            this.chunkPool.push(mesh);
        }

        this.pillarMesh = new THREE.InstancedMesh(
            new THREE.CylinderGeometry(0.8, 1.2, 12, 6),
            new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.85, fog: false }),
            MAX_PILLARS
        );
        this.pillarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.pillarMesh.count = 0;
        this.pillarMesh.frustumCulled = false;

        this.crystalMesh = new THREE.InstancedMesh(
            new THREE.OctahedronGeometry(1.5),
            new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.9, fog: false }),
            MAX_CRYSTALS
        );
        this.crystalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.crystalMesh.count = 0;
        this.crystalMesh.frustumCulled = false;
    }

    addTo(scene) {
        this.chunkPool.forEach(m => scene.add(m));
        scene.add(this.pillarMesh);
        scene.add(this.crystalMesh);
    }

    update(dt, camera) {
        this.time += dt;
        this.gridUniforms.uTime.value = this.time;
        this.gridUniforms.uCameraPos.value.set(camera.position.x, camera.position.z);

        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);
        this.currentCX = cx;
        this.currentCZ = cz;

        if (cx === this.lastCX && cz === this.lastCZ) return;
        this.lastCX = cx;
        this.lastCZ = cz;
        this._rebuild(cx, cz);
    }

    _rebuild(cx, cz) {
        for (const mesh of this.activeChunks.values()) {
            mesh.visible = false;
            this.chunkPool.push(mesh);
        }
        this.activeChunks.clear();

        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
            for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
                const chunkX = cx + dx;
                const chunkZ = cz + dz;
                const mesh = this.chunkPool.pop();
                if (!mesh) continue;
                mesh.position.set(
                    chunkX * CHUNK_SIZE + CHUNK_SIZE / 2,
                    0,
                    chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
                );
                mesh.visible = true;
                this.activeChunks.set(`${chunkX},${chunkZ}`, mesh);
            }
        }

        this._rebuildDecorations(cx, cz);
    }

    _rebuildDecorations(cx, cz) {
        const dummy = new THREE.Object3D();
        let pCount = 0;
        let cCount = 0;

        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
            for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
                const chunkX = cx + dx;
                const chunkZ = cz + dz;
                const baseX = chunkX * CHUNK_SIZE;
                const baseZ = chunkZ * CHUNK_SIZE;

                if (hash01(chunkX, chunkZ) < 0.35 && pCount < MAX_PILLARS) {
                    const ox     = hash01(chunkX,        chunkZ + 1000) * CHUNK_SIZE;
                    const oz     = hash01(chunkX + 1000, chunkZ)        * CHUNK_SIZE;
                    const height = 8 + hash01(chunkX, chunkZ + 2000) * 25;

                    dummy.position.set(baseX + ox, height / 2, baseZ + oz);
                    dummy.scale.set(1, height / 12, 1);
                    dummy.rotation.set(0, hash01(chunkX, chunkZ) * Math.PI, 0);
                    dummy.updateMatrix();
                    this.pillarMesh.setMatrixAt(pCount++, dummy.matrix);
                }

                const n = Math.floor(hash01(chunkX + 3000, chunkZ) * 4);
                for (let i = 0; i < n && cCount < MAX_CRYSTALS; i++) {
                    const ox    = hash01(chunkX + i * 100, chunkZ + 4000)    * CHUNK_SIZE;
                    const oz    = hash01(chunkX + 5000,    chunkZ + i * 100) * CHUNK_SIZE;
                    const oy    = 3 + hash01(chunkX + i * 10, chunkZ + 6000) * 15;
                    const scale = 0.5 + hash01(chunkX + 7000, chunkZ + i * 50) * 1.5;

                    dummy.position.set(baseX + ox, oy, baseZ + oz);
                    dummy.scale.setScalar(scale);
                    dummy.rotation.set(
                        hash01(chunkX,     chunkZ + i) * Math.PI,
                        hash01(chunkX + i, chunkZ)     * Math.PI,
                        0
                    );
                    dummy.updateMatrix();
                    this.crystalMesh.setMatrixAt(cCount++, dummy.matrix);
                }
            }
        }

        this.pillarMesh.count = pCount;
        this.pillarMesh.instanceMatrix.needsUpdate = true;
        this.crystalMesh.count = cCount;
        this.crystalMesh.instanceMatrix.needsUpdate = true;
    }
}

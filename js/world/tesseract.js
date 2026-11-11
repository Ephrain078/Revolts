import * as THREE from 'three';

const MIN_DIST = 180;   // se jogador chegar a menos disso...
const MAX_DIST = 280;   // ...tesseract salta para essa distância

export class Tesseract {
    constructor() {
        this.vertices = [];
        for (let i = 0; i < 16; i++) {
            this.vertices.push([
                (i & 1) ? 1 : -1,
                (i & 2) ? 1 : -1,
                (i & 4) ? 1 : -1,
                (i & 8) ? 1 : -1,
            ]);
        }

        this.edges = [];
        for (let v = 0; v < 16; v++) {
            for (let a = 0; a < 4; a++) {
                const o = v ^ (1 << a);
                if (v < o) this.edges.push([v, o]);
            }
        }

        const positions = new Float32Array(this.edges.length * 6);
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
        );

        this.material = new THREE.LineBasicMaterial({
            color: 0xff00ff,
            transparent: true,
            opacity: 0.95,
            fog: false,
        });

        this.mesh = new THREE.LineSegments(this.geometry, this.material);
        this.mesh.position.set(0, 60, -280);
        this.mesh.scale.setScalar(10);

        this.time = 0;
    }

    _rot(p, angle, a, b) {
        const c = Math.cos(angle), s = Math.sin(angle);
        const x = p[a], y = p[b];
        p[a] = x * c - y * s;
        p[b] = x * s + y * c;
    }

    update(dt, camera) {
        this.time += dt;

        // --- Rotação 4D + projeção para 3D ---
        const projected = [];
        for (const v of this.vertices) {
            const p = [v[0], v[1], v[2], v[3]];
            this._rot(p, this.time * 0.30, 0, 3);
            this._rot(p, this.time * 0.50, 1, 3);
            this._rot(p, this.time * 0.20, 2, 3);

            const dist = 3.0;
            const w = dist / Math.max(dist - p[3], 0.1);
            projected.push([p[0] * w, p[1] * w, p[2] * w]);
        }

        const arr = this.geometry.attributes.position.array;
        let i = 0;
        for (const [a, b] of this.edges) {
            arr[i++] = projected[a][0]; arr[i++] = projected[a][1]; arr[i++] = projected[a][2];
            arr[i++] = projected[b][0]; arr[i++] = projected[b][1]; arr[i++] = projected[b][2];
        }
        this.geometry.attributes.position.needsUpdate = true;

        // --- Fuga: jogador nunca alcança ---
        const dx = this.mesh.position.x - camera.position.x;
        const dz = this.mesh.position.z - camera.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < MIN_DIST && dist > 0.01) {
            const scale = MAX_DIST / dist;
            this.mesh.position.x = camera.position.x + dx * scale;
            this.mesh.position.z = camera.position.z + dz * scale;
        }

        // --- Flutuação suave ---
        this.mesh.position.y = 60 + Math.sin(this.time * 0.3) * 6;
        this.mesh.rotation.y = this.time * 0.05;
    }
}

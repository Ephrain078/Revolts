import * as THREE from 'three';

export class HorizonFog {
    constructor() {
        const geo = new THREE.PlaneGeometry(400, 80);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0x00ffff) },
                uTime:  { value: 0 },
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 uColor;
                uniform float uTime;
                varying vec2 vUv;
                void main() {
                    vec2 p = vUv - 0.5;
                    float d = length(p) * 2.0;
                    float glow = smoothstep(1.0, 0.2, d);
                    float flicker = 0.9 + 0.1 * sin(uTime * 0.7);
                    gl_FragColor = vec4(uColor, glow * 0.12 * flicker);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.position.y = 8;
        this.time = 0;

        this._forward = new THREE.Vector3();
    }

    update(dt, camera) {
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;

        camera.getWorldDirection(this._forward);
        this._forward.y = 0;
        this._forward.normalize();

        this.mesh.position.x = camera.position.x + this._forward.x * 180;
        this.mesh.position.z = camera.position.z + this._forward.z * 180;
        this.mesh.rotation.y = Math.atan2(this._forward.x, this._forward.z) + Math.PI;
    }
}
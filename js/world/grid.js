import * as THREE from 'three';

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
    uniform float uFadeStart;
    uniform float uFadeEnd;
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

        float dist  = length(vWorldPos);
        float fade  = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.5 - dist * 0.3);

        vec3 col = uColor * grid * fade * pulse;
        gl_FragColor = vec4(col, grid * fade);
    }
`;

export class Grid {
    constructor() {
        const geo = new THREE.PlaneGeometry(2000, 2000, 1, 1);
        geo.rotateX(-Math.PI / 2);

        this.material = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                uTime:      { value: 0 },
                uColor:     { value: new THREE.Color(0x00ffff) },
                uFadeStart: { value: 20 },
                uFadeEnd:   { value: 180 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.position.y = 0;
        this.mesh.frustumCulled = false;
        this.time = 0;
    }

    update(dt, camera) {
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;
        this.mesh.position.x = camera.position.x;
        this.mesh.position.z = camera.position.z;
    }
}
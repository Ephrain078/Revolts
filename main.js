
import * as THREE from 'three';

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.00045);

const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    30000
);

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
);

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.outputColorSpace = THREE.SRGBColorSpace;

document.getElementById('game-container')
    .appendChild(renderer.domElement);

const clock = new THREE.Clock();

// ILUMINAÇÃO

scene.add(
    new THREE.HemisphereLight(
        0x9bdfff,
        0x101522,
        1.5
    )
);

const light = new THREE.DirectionalLight(
    0xffffff,
    1.5
);

light.position.set(30, 80, -20);
scene.add(light);

// LUZ AMBIENTE AZUL

const ambientBlue = new THREE.PointLight(
    0x007bff,
    2,
    35
);

ambientBlue.position.set(0, 5, 0);
scene.add(ambientBlue);

// GRADE

const grid = new THREE.GridHelper(
    20000,
    800,
    0x00eaff,
    0x164b68
);

grid.material.transparent = true;
grid.material.opacity = 0.72;
grid.material.depthWrite = false;

scene.add(grid);

// MATERIAIS

const dark = new THREE.MeshStandardMaterial({
    color: 0x263647,
    metalness: 0.85,
    roughness: 0.22,
    emissive: 0x071827,
    emissiveIntensity: 0.35
});

const metal = new THREE.MeshStandardMaterial({
    color: 0xa9c5d8,
    metalness: 0.9,
    roughness: 0.18,
    emissive: 0x102b40,
    emissiveIntensity: 0.25
});

const rubber = new THREE.MeshStandardMaterial({
    color: 0x080d15,
    metalness: 0.35,
    roughness: 0.8
});

const neonBlue = new THREE.MeshBasicMaterial({
    color: 0x00eaff
});

const neonGlow = new THREE.MeshBasicMaterial({
    color: 0x007bff,
    transparent: true,
    opacity: 0.45
});

// MOTO

const bike = new THREE.Group();
scene.add(bike);

// FUNÇÃO PARA CONSTRUIR PEÇAS

function cylinderBetween(parent, a, b, radius, material) {

    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);

    const direction = new THREE.Vector3()
        .subVectors(end, start);

    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
            radius,
            radius,
            direction.length(),
            12
        ),
        material
    );

    mesh.position.copy(start)
        .add(end)
        .multiplyScalar(0.5);

    mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize()
    );

    parent.add(mesh);

    return mesh;
}

// RODAS NEON

function createWheel(z) {

    const wheel = new THREE.Group();

    // PNEU

    const tire = new THREE.Mesh(
        new THREE.TorusGeometry(
            0.48,
            0.13,
            12,
            40
        ),
        rubber
    );

    tire.rotation.y = Math.PI / 2;
    wheel.add(tire);

    // ARO EXTERNO

    const glowRing = new THREE.Mesh(
        new THREE.TorusGeometry(
            0.39,
            0.045,
            12,
            40
        ),
        neonGlow
    );

    glowRing.rotation.y = Math.PI / 2;
    wheel.add(glowRing);

    // ARO INTERNO

    const neonRing = new THREE.Mesh(
        new THREE.TorusGeometry(
            0.34,
            0.018,
            10,
            40
        ),
        neonBlue
    );

    neonRing.rotation.y = Math.PI / 2;
    wheel.add(neonRing);

    // CUBO CENTRAL

    const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(
            0.12,
            0.12,
            0.22,
            20
        ),
        metal
    );

    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);

    // RAIOS

    for (let i = 0; i < 8; i++) {

        const angle = (i / 8) * Math.PI * 2;

        const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(
                0.025,
                0.025,
                0.32
            ),
            neonBlue
        );

        spoke.position.set(
            0,
            Math.cos(angle) * 0.17,
            Math.sin(angle) * 0.17
        );

        spoke.rotation.x = -angle;

        wheel.add(spoke);
    }

    wheel.position.set(0, 0.62, z);

    bike.add(wheel);

    return wheel;
}

const frontWheel = createWheel(1.05);
const rearWheel = createWheel(-1.05);

// CHASSI

cylinderBetween(
    bike,
    [0, 0.75, -0.8],
    [0, 1.1, 0.45],
    0.075,
    metal
);

cylinderBetween(
    bike,
    [0, 0.75, -0.8],
    [0, 0.95, 0.9],
    0.06,
    dark
);

cylinderBetween(
    bike,
    [0, 1.1, 0.45],
    [0, 1.35, -0.35],
    0.07,
    metal
);

cylinderBetween(
    bike,
    [0, 0.65, 1.05],
    [0, 1.35, 0.45],
    0.045,
    metal
);

// DETALHES LUMINOSOS DO CHASSI

cylinderBetween(
    bike,
    [-0.12, 0.95, -0.65],
    [-0.12, 1.28, 0.35],
    0.018,
    neonBlue
);

cylinderBetween(
    bike,
    [0.12, 0.95, -0.65],
    [0.12, 1.28, 0.35],
    0.018,
    neonBlue
);

// MOTOR

const engine = new THREE.Mesh(
    new THREE.BoxGeometry(
        0.62,
        0.55,
        0.7
    ),
    dark
);

engine.position.set(0, 0.88, -0.05);
bike.add(engine);

// TANQUE

const tank = new THREE.Mesh(
    new THREE.SphereGeometry(
        0.43,
        24,
        16
    ),
    new THREE.MeshStandardMaterial({
        color: 0x17445d,
        metalness: 0.85,
        roughness: 0.18,
        emissive: 0x063047,
        emissiveIntensity: 0.55
    })
);

tank.scale.set(0.78, 0.65, 1.25);
tank.position.set(0, 1.48, 0.05);

bike.add(tank);

// BANCO

const seat = new THREE.Mesh(
    new THREE.BoxGeometry(
        0.48,
        0.16,
        0.85
    ),
    rubber
);

seat.position.set(0, 1.48, -0.72);
bike.add(seat);

// GUIDÃO

cylinderBetween(
    bike,
    [-0.48, 1.58, 0.95],
    [0.48, 1.58, 0.95],
    0.035,
    metal
);

// FAROL

const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(
        0.19,
        16,
        12
    ),
    new THREE.MeshBasicMaterial({
        color: 0xdafcff
    })
);

headlight.position.set(0, 1.34, 1.12);
bike.add(headlight);

const lamp = new THREE.PointLight(
    0x8deeff,
    3,
    22
);

lamp.position.set(0, 1.3, 1.3);
bike.add(lamp);

// LUZES LATERAIS DO TANQUE

for (const side of [-1, 1]) {

    const sideLight = new THREE.Mesh(
        new THREE.BoxGeometry(
            0.025,
            0.06,
            0.55
        ),
        neonBlue
    );

    sideLight.position.set(
        side * 0.29,
        1.43,
        0.08
    );

    bike.add(sideLight);
}

// RODAS PARA ANIMAÇÃO

bike.userData.wheels = [
    frontWheel,
    rearWheel
];

// RASTRO NEON

const trailPoints = [];

const trailGeometry = new THREE.BufferGeometry();

const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
        color: 0x00eaff,
        transparent: true,
        opacity: 0.95
    })
);

scene.add(trail);

const trailGlow = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
        color: 0x007bff,
        transparent: true,
        opacity: 0.3
    })
);

scene.add(trailGlow);

// ESTADO

const state = {
    x: 0,
    z: 0,
    yaw: 0,
    lean: 0,
    speed: 0
};

const keys = {};

const joystick = {
    active: false,
    x: 0,
    y: 0
};

const maxSpeed = 34;
const acceleration = 19;
const braking = 28;
const turnSpeed = 2.1;

// TECLADO

window.addEventListener('keydown', (e) => {

    const key = e.key.toLowerCase();

    if (
        [
            'arrowup',
            'arrowdown',
            'arrowleft',
            'arrowright'
        ].includes(key)
    ) {
        e.preventDefault();
    }

    if (key === 'w' || key === 'arrowup')
        keys.forward = true;

    if (key === 's' || key === 'arrowdown')
        keys.backward = true;

    if (key === 'a' || key === 'arrowleft')
        keys.left = true;

    if (key === 'd' || key === 'arrowright')
        keys.right = true;
});

window.addEventListener('keyup', (e) => {

    const key = e.key.toLowerCase();

    if (key === 'w' || key === 'arrowup')
        keys.forward = false;

    if (key === 's' || key === 'arrowdown')
        keys.backward = false;

    if (key === 'a' || key === 'arrowleft')
        keys.left = false;

    if (key === 'd' || key === 'arrowright')
        keys.right = false;
});

// CONTROLES MOBILE

const controls = document.createElement('div');

controls.innerHTML = `
    <div id="joystick">
        <div id="stick"></div>
    </div>

    <div id="pedals">
        <button id="accelerate">▲</button>
        <button id="brake">▼</button>
    </div>

    <div id="speedometer">0 km/h</div>
`;

document.body.appendChild(controls);

// ESTILO DOS CONTROLES

const style = document.createElement('style');

style.textContent = `
    #joystick {
        position: fixed;
        left: 24px;
        bottom: 25px;
        width: 116px;
        height: 116px;
        border-radius: 50%;
        border: 2px solid #00dfff88;
        background: #061a2b88;
        box-shadow: 0 0 18px #007bff44;
        touch-action: none;
    }

    #stick {
        position: absolute;
        left: 32px;
        top: 32px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #00dfffaa;
        border: 2px solid #b8faff;
        box-shadow: 0 0 15px #00dfff;
    }

    #pedals {
        position: fixed;
        right: 24px;
        bottom: 25px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    #pedals button {
        width: 66px;
        height: 66px;
        border-radius: 50%;
        border: 1px solid #00dfff;
        color: #d9fbff;
        background: #06263acc;
        box-shadow: 0 0 12px #007bff66;
        font-size: 25px;
        touch-action: none;
    }

    #speedometer {
        position: fixed;
        right: 22px;
        top: 20px;
        color: #00eaff;
        font: 18px Arial;
        text-shadow: 0 0 8px #00eaff;
        pointer-events: none;
    }
`;

document.head.appendChild(style);

// JOYSTICK

const joystickElement =
    document.getElementById('joystick');

const stick =
    document.getElementById('stick');

joystickElement.addEventListener(
    'pointerdown',
    (e) => {
        joystick.active = true;
        joystickElement.setPointerCapture(e.pointerId);
        moveJoystick(e);
    }
);

joystickElement.addEventListener(
    'pointermove',
    (e) => {
        if (joystick.active) moveJoystick(e);
    }
);

function moveJoystick(e) {

    const rect =
        joystickElement.getBoundingClientRect();

    let dx =
        (e.clientX - rect.left - rect.width / 2) / 43;

    let dy =
        (e.clientY - rect.top - rect.height / 2) / 43;

    const length = Math.hypot(dx, dy);

    if (length > 1) {
        dx /= length;
        dy /= length;
    }

    joystick.x = dx;
    joystick.y = dy;

    stick.style.left = `${32 + dx * 34}px`;
    stick.style.top = `${32 + dy * 34}px`;
}

function releaseJoystick() {

    joystick.active = false;
    joystick.x = 0;
    joystick.y = 0;

    stick.style.left = '32px';
    stick.style.top = '32px';
}

joystickElement.addEventListener(
    'pointerup',
    releaseJoystick
);

joystickElement.addEventListener(
    'pointercancel',
    releaseJoystick
);

// ACELERADOR E FREIO

function bindButton(id, key) {

    const button =
        document.getElementById(id);

    button.addEventListener(
        'pointerdown',
        (e) => {
            e.preventDefault();
            keys[key] = true;
            button.setPointerCapture(e.pointerId);
        }
    );

    const release = () => {
        keys[key] = false;
    };

    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
}

bindButton('accelerate', 'forward');
bindButton('brake', 'backward');

// ATUALIZAÇÃO DO JOGO

function update(dt) {

    const accelerating =
        keys.forward ||
        (joystick.active && joystick.y < -0.25);

    const brakingNow =
        keys.backward ||
        (joystick.active && joystick.y > 0.35);

    if (accelerating) {

        state.speed = Math.min(
            maxSpeed,
            state.speed + acceleration * dt
        );

    } else if (brakingNow) {

        state.speed = Math.max(
            0,
            state.speed - braking * dt
        );

    } else {

        state.speed = Math.max(
            0,
            state.speed - 3.5 * dt
        );
    }

    let steering = 0;

    if (
        joystick.active &&
        Math.abs(joystick.x) > 0.12
    ) {
        steering = joystick.x;

    } else {

        if (keys.left) steering -= 1;
        if (keys.right) steering += 1;
    }

    const speedFactor =
        0.35 + 0.65 * (state.speed / maxSpeed);

    state.yaw +=
        steering * turnSpeed * speedFactor * dt;

    const targetLean = -steering * 0.32;

    state.lean +=
        (targetLean - state.lean) *
        Math.min(1, dt * 6);

    const distance = state.speed * dt;

    state.x += Math.sin(state.yaw) * distance;
    state.z += Math.cos(state.yaw) * distance;

    bike.position.set(
        state.x,
        0,
        state.z
    );

    bike.rotation.order = 'YXZ';
    bike.rotation.y = state.yaw;
    bike.rotation.z = state.lean;

    // GIRO DAS RODAS

    for (const wheel of bike.userData.wheels) {
        wheel.rotation.x -= distance / 0.61;
    }

    // RASTRO

    const point = new THREE.Vector3(
        state.x,
        0.12,
        state.z
    );

    const last =
        trailPoints[trailPoints.length - 1];

    if (
        !last ||
        last.distanceToSquared(point) > 0.12
    ) {
        trailPoints.push(point);
    }

    if (trailPoints.length > 1800) {
        trailPoints.shift();
    }

    trailGeometry.setFromPoints(trailPoints);

    // CÂMERA

    const behind = new THREE.Vector3(
        -Math.sin(state.yaw) * 10,
        5.2,
        -Math.cos(state.yaw) * 10
    );

    const desiredCamera = new THREE.Vector3(
        state.x,
        0,
        state.z
    ).add(behind);

    camera.position.lerp(
        desiredCamera,
        1 - Math.exp(-3.2 * dt)
    );

    camera.lookAt(
        state.x + Math.sin(state.yaw) * 4,
        1.1,
        state.z + Math.cos(state.yaw) * 4
    );

    document.getElementById('speedometer').textContent =
        `${Math.round(state.speed * 3.6)} km/h`;
}

// CÂMERA INICIAL

camera.position.set(0, 7, -13);
camera.lookAt(0, 0, 0);

// LOOP PRINCIPAL

function animate() {

    requestAnimationFrame(animate);

    const dt = Math.min(
        clock.getDelta(),
        0.05
    );

    update(dt);

    renderer.render(scene, camera);
}

// REDIMENSIONAMENTO

window.addEventListener('resize', () => {

    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
});

// PERDA DE FOCO

window.addEventListener('blur', () => {

    for (const key in keys) {
        keys[key] = false;
    }

    releaseJoystick();
});

animate();

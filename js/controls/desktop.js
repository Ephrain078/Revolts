import * as THREE from 'three';

export class DesktopControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.keys = { forward: 0, backward: 0, left: 0, right: 0, jump: false };

        this.yaw = 0;
        this.pitch = 0;
        this.sensitivity = 0.0022;

        this.velocityY = 0;
        this.gravity = -25;
        this.jumpForce = 8;
        this.isGrounded = true;
        this.eyeHeight = 1.7;

        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._move = new THREE.Vector3();

        camera.position.set(0, this.eyeHeight, 0);
        camera.rotation.order = 'YXZ';

        this._setupPointerLock();
        this._setupKeyboard();
    }

    _setupPointerLock() {
        this.domElement.addEventListener('click', () => {
            if (document.pointerLockElement !== this.domElement) {
                this.domElement.requestPointerLock();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== this.domElement) return;
            this.yaw   -= e.movementX * this.sensitivity;
            this.pitch -= e.movementY * this.sensitivity;
            this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
            this.camera.rotation.y = this.yaw;
            this.camera.rotation.x = this.pitch;
        });
    }

    _setupKeyboard() {
        const map = {
            KeyW: 'forward',  ArrowUp:    'forward',
            KeyS: 'backward', ArrowDown:  'backward',
            KeyA: 'left',     ArrowLeft:  'left',
            KeyD: 'right',    ArrowRight: 'right',
        };

        document.addEventListener('keydown', (e) => {
            if (map[e.code]) this.keys[map[e.code]] = 1;
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.isGrounded) {
                    this.velocityY = this.jumpForce;
                    this.isGrounded = false;
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (map[e.code]) this.keys[map[e.code]] = 0;
        });
    }

    update(dt) {
        const speed = 12;
        const fwd    = this.keys.forward - this.keys.backward;
        const strafe = this.keys.right   - this.keys.left;

        this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

        this._move.set(0, 0, 0)
            .addScaledVector(this._forward, fwd)
            .addScaledVector(this._right, strafe);

        if (this._move.lengthSq() > 0) {
            this._move.normalize().multiplyScalar(speed * dt);
            this.camera.position.add(this._move);
        }

        this.velocityY += this.gravity * dt;
        this.camera.position.y += this.velocityY * dt;

        if (this.camera.position.y <= this.eyeHeight) {
            this.camera.position.y = this.eyeHeight;
            this.velocityY = 0;
            this.isGrounded = true;
        }
    }
}
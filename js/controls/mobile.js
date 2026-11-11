import * as THREE from 'three';

export class MobileControls {
    constructor(camera, base, knob, jumpBtn, lookArea) {
        this.camera   = camera;
        this.base     = base;
        this.knob     = knob;
        this.jumpBtn  = jumpBtn;
        this.lookArea = lookArea;

        this.moveVec    = new THREE.Vector2(0, 0);
        this.yaw        = 0;
        this.pitch      = 0;
        this.sensitivity = 0.005;

        this.velocityY = 0;
        this.gravity   = -25;
        this.jumpForce = 8;
        this.isGrounded = true;
        this.eyeHeight  = 1.7;
        this.joystickRadius = 60;

        this._joyId  = null;
        this._lookId = null;
        this._lastLook = { x: 0, y: 0 };

        this._forward = new THREE.Vector3();
        this._right   = new THREE.Vector3();
        this._move    = new THREE.Vector3();

        camera.position.set(0, this.eyeHeight, 0);
        camera.rotation.order = 'YXZ';

        this._setupJoystick();
        this._setupLook();
        this._setupJump();
    }

    _setupJoystick() {
        this.base.addEventListener('pointerdown', (e) => {
            if (this._joyId !== null) return;
            this._joyId = e.pointerId;
            this.base.setPointerCapture(e.pointerId);
            this._moveJoy(e);
        });
        this.base.addEventListener('pointermove', (e) => {
            if (e.pointerId !== this._joyId) return;
            this._moveJoy(e);
        });
        const release = (e) => {
            if (e.pointerId !== this._joyId) return;
            this._joyId = null;
            this.moveVec.set(0, 0);
            this.knob.style.transform = 'translate(-50%, -50%)';
        };
        this.base.addEventListener('pointerup', release);
        this.base.addEventListener('pointercancel', release);
    }

    _moveJoy(e) {
        const r  = this.base.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = e.clientX - cx;
        let dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > this.joystickRadius) {
            dx = dx / d * this.joystickRadius;
            dy = dy / d * this.joystickRadius;
        }
        this.moveVec.set(dx / this.joystickRadius, dy / this.joystickRadius);
        this.knob.style.transform =
            `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    _setupLook() {
        this.lookArea.addEventListener('pointerdown', (e) => {
            if (this._lookId !== null) return;
            this._lookId = e.pointerId;
            this._lastLook = { x: e.clientX, y: e.clientY };
            this.lookArea.setPointerCapture(e.pointerId);
        });
        this.lookArea.addEventListener('pointermove', (e) => {
            if (e.pointerId !== this._lookId) return;
            const dx = e.clientX - this._lastLook.x;
            const dy = e.clientY - this._lastLook.y;
            this._lastLook = { x: e.clientX, y: e.clientY };

            this.yaw   -= dx * this.sensitivity;
            this.pitch -= dy * this.sensitivity;
            this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));

            this.camera.rotation.y = this.yaw;
            this.camera.rotation.x = this.pitch;
        });
        const release = (e) => {
            if (e.pointerId === this._lookId) this._lookId = null;
        };
        this.lookArea.addEventListener('pointerup', release);
        this.lookArea.addEventListener('pointercancel', release);
    }

    _setupJump() {
        this.jumpBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (this.isGrounded) {
                this.velocityY = this.jumpForce;
                this.isGrounded = false;
            }
        });
    }

    update(dt) {
        const speed = 10;
        const fwd    = -this.moveVec.y;
        const strafe =  this.moveVec.x;

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
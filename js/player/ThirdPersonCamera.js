// Third-person orbit camera. Desktop: Pointer Lock mouse-look (no click-hold needed).
// Mobile: touch-drag. During runs it gently re-centres behind the runner when not steered.
import * as THREE from 'three';
import { CAMERA, MOUSE_LOOK } from '../config/balance.js';
import { clamp, damp, wrapAngle } from '../utils/math.js';

const DEG = Math.PI / 180;

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = CAMERA.pitch;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.distance = CAMERA.distance;
    this.targetDistance = CAMERA.distance;
    this.baseDistance = CAMERA.distance;
    this.focus = new THREE.Vector3();
    this.sensitivity = 1;
    this.invertY = MOUSE_LOOK.invertY;
    this.runMode = false;
    this.zoomOffset = 0;
    this.lag = 0; // 0..1, set from the speed tier during runs: a looser follow and a touch more distance
  }

  setRunMode(on) {
    this.runMode = on;
    if (!on) this.lag = 0;
    this.baseDistance = on ? CAMERA.runDistance : CAMERA.distance;
    this.targetDistance = this.baseDistance + this.zoomOffset;
  }

  snap(target, yaw) {
    if (yaw !== undefined) this.yaw = this.targetYaw = yaw;
    this.targetPitch = this.pitch = CAMERA.pitch;
    this.update(0.016, target, null, 0, 0, true);
  }

  shift(dz) { this.focus.z += dz; this.camera.position.z += dz; }

  update(dt, target, input, playerYaw, playerSpeed, instant = false) {
    const mouseLook = input && !input.isTouch;
    if (input) {
      const look = input.consumeLook();
      if (mouseLook) {
        const sens = MOUSE_LOOK.mouseSensitivity * this.sensitivity;
        this.targetYaw -= look.dx * sens;
        const dy = this.invertY ? -look.dy : look.dy;
        this.targetPitch = clamp(this.targetPitch + dy * sens, MOUSE_LOOK.minPitchDeg * DEG, MOUSE_LOOK.maxPitchDeg * DEG);
      } else {
        const sens = CAMERA.touchSensitivity * this.sensitivity;
        this.targetYaw -= look.dx * sens;
        this.targetPitch = clamp(this.targetPitch + look.dy * sens, CAMERA.minPitch, CAMERA.maxPitch);
      }
      const z = input.consumeZoom();
      if (z) {
        this.zoomOffset = clamp(this.zoomOffset + z * 1.1, CAMERA.minDistance - this.baseDistance, CAMERA.maxDistance - this.baseDistance);
        this.targetDistance = this.baseDistance + this.zoomOffset;
      }
      const idle = (performance.now() - input.lookInputTime) / 1000;
      const behind = playerYaw + Math.PI;
      if (this.runMode) {
        // runs: always drift back behind the runner after a short pause
        if (idle > 0.8) {
          this.targetYaw += wrapAngle(behind - this.targetYaw) * Math.min(1, 2.5 * dt);
          this.targetPitch += (CAMERA.pitch - this.targetPitch) * Math.min(1, 1.5 * dt);
        }
      }
      // Lobby: the camera never swings on its own. Movement is camera-relative, so an
      // auto-rotating camera would bend diagonal movement into a spiral.
    }
    const lambda = mouseLook ? MOUSE_LOOK.smoothing : CAMERA.rotateLambda;
    const k = instant ? 1 : 1 - Math.exp(-lambda * dt);
    this.yaw += wrapAngle(this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.distance = instant ? this.targetDistance : damp(this.distance, this.targetDistance, 6, dt);

    const fx = target.x, fy = target.y + CAMERA.height, fz = target.z;
    if (instant) this.focus.set(fx, fy, fz);
    else {
      // tight follow on the run axis so high speeds never leave the camera behind
      const f = 1 - Math.exp(-(this.runMode ? 30 - 12 * this.lag : CAMERA.followLambda) * dt);
      this.focus.x += (fx - this.focus.x) * f;
      this.focus.z += (fz - this.focus.z) * f;
      this.focus.y += (fy - this.focus.y) * (1 - Math.exp(-8 * dt));
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const d = this.distance + (this.runMode ? this.lag * 0.9 : 0);
    const cam = this.camera.position;
    cam.set(this.focus.x + Math.sin(this.yaw) * cp * d, this.focus.y + sp * d, this.focus.z + Math.cos(this.yaw) * cp * d);
    if (cam.y < 0.5) cam.y = 0.5;
    this.camera.lookAt(this.focus.x, this.focus.y + (this.runMode ? 0.4 : 0), this.focus.z);
  }
}

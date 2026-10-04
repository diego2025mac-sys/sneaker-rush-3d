// Lobby movement: standard third-person controls.
//  • Input is mapped onto the camera's horizontal forward/right vectors (pitch ignored).
//  • Diagonals are normalised (W+D is not faster than W).
//  • The character always turns toward the direction it is actually moving — S turns it around,
//    A/D turn it sideways — with shortest-angle smoothing (no moonwalking, no 360° spins).
import { PLAYER } from '../config/balance.js';
import { dampAngle } from '../utils/math.js';

const moveToward = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

/** Camera-relative ground direction for input (x = right, y = forward). Unit length or zero. */
export function cameraRelative(mv, camYaw, out = { x: 0, z: 0, mag: 0 }) {
  // The camera sits at focus + (sin yaw, cos yaw)·d, so it looks along (−sin yaw, −cos yaw).
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = -fz, rz = fx; // forward × up, projected on XZ
  let x = fx * mv.y + rx * mv.x;
  let z = fz * mv.y + rz * mv.x;
  const m = Math.hypot(x, z);
  const mag = Math.min(1, Math.hypot(mv.x, mv.y));
  if (m > 1e-4) { x /= m; z /= m; } else { x = 0; z = 0; }
  out.x = x; out.z = z; out.mag = m > 1e-4 ? mag : 0;
  return out;
}

export function turnRate(speed) {
  return Math.min(PLAYER.rotationSpeedMax, PLAYER.rotationSpeed + speed * PLAYER.rotationSpeedPerMs);
}

export class LobbyController {
  constructor(game) {
    this.game = game;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.grounded = true;
    this.moveHeld = 0;
    this.speed = 0;
    this.dir = { x: 0, z: 0, mag: 0 };
  }

  teleport(x, z, yaw) {
    const c = this.game.character;
    c.position.set(x, 0, z);
    this.vx = this.vz = this.vy = 0;
    c.yaw = yaw;
  }

  update(dt, camYaw) {
    const g = this.game;
    const input = g.input;
    const c = g.character;
    const dir = cameraRelative(input.getMove(), camYaw, this.dir);

    if (dir.mag > 0.05) this.moveHeld += dt; else this.moveHeld = 0;
    const running = !input.walkHeld && this.moveHeld > PLAYER.runAfter && dir.mag > 0.6;
    const target = dir.mag > 0.05 ? (running ? PLAYER.lobbyRunSpeed : PLAYER.lobbyWalkSpeed) * Math.min(1, dir.mag * 1.15) : 0;
    const accel = target > 0.01 ? PLAYER.accel : PLAYER.decel;
    this.vx = moveToward(this.vx, dir.x * target, accel * dt);
    this.vz = moveToward(this.vz, dir.z * target, accel * dt);
    const p = c.position;
    p.x += this.vx * dt;
    p.z += this.vz * dt;
    g.lobby.collide(p, PLAYER.radius);

    if (input.pressed('jump') && this.grounded) {
      this.vy = PLAYER.jumpVelocity * 0.85;
      this.grounded = false;
      g.audio.play('jump');
    }
    this.vy -= PLAYER.gravity * dt;
    p.y += this.vy * dt;
    if (p.y <= 0) {
      if (!this.grounded && this.vy < -4) g.audio.play('land');
      p.y = 0; this.vy = 0; this.grounded = true;
    }
    this.speed = Math.hypot(this.vx, this.vz);
    // face the intended direction while input is held (so W→S turns around immediately instead of
    // sliding backwards), otherwise the direction of the remaining momentum
    if (dir.mag > 0.05) c.yaw = dampAngle(c.yaw, Math.atan2(dir.x, dir.z), turnRate(this.speed), dt);
    else if (this.speed > 0.5) c.yaw = dampAngle(c.yaw, Math.atan2(this.vx, this.vz), turnRate(this.speed), dt);
    c.update(dt, this.speed, this.grounded);
  }
}

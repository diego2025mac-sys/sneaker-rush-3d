// The running session: speed/momentum/boost model, lane steering, jumping, obstacle & pickup handling,
// distance + reward accounting, milestones, biome transitions and the floating origin.
import * as THREE from 'three';
import { PLAYER, SPEED, RUN, MILESTONES } from '../config/balance.js';
import { BIOMES, BIOME_BLEND, biomeIndexAt } from '../config/biomes.js';
import { SNEAKER_BY_ID } from '../config/sneakers.js';
import * as E from '../systems/Economy.js';
import { clamp, damp, dampAngle, smoothstep, formatMoney } from '../utils/math.js';
import { cameraRelative, turnRate } from './LobbyController.js';
import { fmtDist } from '../world/Lobby.js';

const moveToward = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const _v = new THREE.Vector3();

export class RunController {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.meters = 0;
    this.coins = 0;
    this.autoRun = false;
  }

  get momentumRatio() { return this.momentum; }

  start() {
    const g = this.game;
    const s = g.state;
    this.baseSpeed = E.runSpeed(s);
    this.ratio = this.baseSpeed / E.worldSpeed(this.baseSpeed);
    this.meters = 0;
    this.coins = 0;
    this.z = 0; this.x = 0; this.y = 0; this.vy = 0; this.vx = 0;
    this.maxZ = 0;     // furthest point reached — distance only counts forward progress
    this.backV = 0;    // backing-up speed (world units/s)
    this.dir = { x: 0, z: 0, mag: 0 };
    this.grounded = true;
    this.throttle = 0;
    this.momentum = 0;
    this.stumble = 0;
    this.boostTime = 0;
    this.boostVis = 0;
    this.currentSpeed = 0;
    this.worldV = 0;
    this.time = 0;
    this.milestoneIdx = 0;
    this.biomeIdx = 0;
    this.biomeName = BIOMES[0].name;
    this.nextText = '';
    this.saveTimer = 0;
    this.progTimer = 0;
    this.fxLevel = 0;
    this.autoRun = !!s.settings.autoRun;
    this.active = true;
    const sneaker = SNEAKER_BY_ID[s.sneakers.equipped];
    this.trail = sneaker.trail;
    this.glow = sneaker.glow;
    g.track.reset(0, this.ratio, (Math.random() * 1e9) | 0);
    g.character.position.set(0, 0, 0);
    g.character.yaw = 0;
    g.sky.apply(BIOMES[0]);
  }

  stop() {
    this.active = false;
    this.game.state.pendingRun = null;
  }

  /** Debug: jump ahead by `m` metres of distance. */
  teleport(m) {
    this.meters += m;
    this.milestoneIdx = MILESTONES.findIndex((ms) => ms.m > this.meters);
    if (this.milestoneIdx < 0) this.milestoneIdx = MILESTONES.length;
    this.game.track.rebuildAhead(this.z, this.meters, this.ratio);
  }

  setSpeedOverride() {
    // keep distance consistent when the debug speed changes mid-run
    this.baseSpeed = E.runSpeed(this.game.state);
    this.ratio = this.baseSpeed / E.worldSpeed(this.baseSpeed);
    this.game.track.rebuildAhead(this.z, this.meters, this.ratio);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const input = g.input;
    const c = g.character;
    this.time += dt;

    // ---- camera-relative input → along-track (forward) and across-track (lateral) intent
    const dir = cameraRelative(input.getMove(), g.cam.yaw, this.dir);
    if (input.pressed('autorun')) this.toggleAutoRun();
    // On the track, any forward-ish input means "run at full speed" and the sideways part steers
    // at full dodge speed — dodging never costs speed (the forward pace dwarfs the lateral one).
    let fwdIntent = dir.z * dir.mag, latIntent = Math.max(-1, Math.min(1, dir.x * dir.mag * 1.42));
    if (fwdIntent > 0.3) fwdIntent = 1;
    if (fwdIntent < -0.3 && this.autoRun) this.toggleAutoRun();
    if (this.autoRun) fwdIntent = Math.max(fwdIntent, 1);
    const forward = fwdIntent > 0.15;
    const braking = fwdIntent < -0.3;
    this.throttle = moveToward(this.throttle, forward ? clamp(fwdIntent, 0, 1) : 0, dt / (forward ? SPEED.accelTime : braking ? 0.25 : 0.6));
    // backing up (S with the camera behind): only once stopped; never earns or loses distance
    const canBack = this.throttle < 0.05 && braking && this.z > this.maxZ - PLAYER.runBackLimit;
    this.backV = moveToward(this.backV, canBack ? -fwdIntent * PLAYER.runBackSpeed : 0, dt * PLAYER.accel);
    this.stumble = Math.max(0, this.stumble - dt);
    const stumbleMul = this.stumble > 0 ? SPEED.stumbleFactor + (1 - SPEED.stumbleFactor) * (1 - this.stumble / SPEED.stumbleRecover) : 1;
    this.boostTime = Math.max(0, this.boostTime - dt);
    this.boostVis = damp(this.boostVis, this.boostTime > 0 ? 1 : 0, 6, dt);
    if (this.throttle > 0.95 && this.stumble === 0) this.momentum = Math.min(1, this.momentum + dt / SPEED.momentumTime);
    else if (this.throttle < 0.3) this.momentum = Math.max(0, this.momentum - dt * 0.5);
    const mult = (1 + SPEED.momentumMax * this.momentum) * stumbleMul * (1 + (SPEED.boostPadMult - 1) * this.boostVis);
    this.currentSpeed = this.baseSpeed * this.throttle * mult;  // distance m/s
    this.worldV = this.currentSpeed / this.ratio;               // world units/s
    const prevZ = this.z;
    const vz = this.worldV - this.backV;
    this.z += vz * dt;
    if (this.z < this.maxZ - PLAYER.runBackLimit) this.z = this.maxZ - PLAYER.runBackLimit;
    if (this.z > this.maxZ) {
      this.meters += (this.z - this.maxZ) * this.ratio;
      this.maxZ = this.z;
    }

    // ---- steering across the track (camera-relative: D = screen right)
    const lat = SPEED.lateralBase + this.worldV * SPEED.lateralPerWorldSpeed;
    this.vx = damp(this.vx, latIntent * lat, 12, dt);
    this.x = clamp(this.x + this.vx * dt, -RUN.trackHalfWidth + 0.55, RUN.trackHalfWidth - 0.55);

    // ---- jump
    if (input.pressed('jump') && this.grounded) {
      this.vy = PLAYER.jumpVelocity;
      this.grounded = false;
      g.audio.play('jump');
    }
    this.vy -= PLAYER.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      if (!this.grounded) g.audio.play('land');
      this.y = 0; this.vy = 0; this.grounded = true;
    }

    // ---- collisions with pooled items (only when moving forward through them)
    if (this.z > prevZ) g.track.collide(prevZ, this.z, this.x, this.y, (type, item, outcome) => this.onItem(type, item, outcome));

    // ---- character faces its true direction of travel (shortest-angle smoothing)
    c.position.set(this.x, this.y, this.z);
    const ground = Math.hypot(this.vx, vz);
    this.groundSpeed = ground;
    if (ground > 0.4) c.yaw = dampAngle(c.yaw, Math.atan2(this.vx, vz), turnRate(ground), dt);
    else if (dir.mag > 0.1) c.yaw = dampAngle(c.yaw, Math.atan2(dir.x, dir.z), turnRate(0), dt);
    c.update(dt, Math.min(ground, 40), this.grounded);
    g.track.update(dt, this.z, this.meters, this.ratio);

    // ---- milestones
    while (this.milestoneIdx < MILESTONES.length && this.meters >= MILESTONES[this.milestoneIdx].m) {
      this.onMilestone(MILESTONES[this.milestoneIdx]);
      this.milestoneIdx++;
    }

    // ---- biome change + sky blend
    const bi = biomeIndexAt(this.meters);
    if (bi !== this.biomeIdx) {
      this.biomeIdx = bi;
      this.biomeName = BIOMES[bi].name;
      g.hud.banner(BIOMES[bi].name, `ENTERING • ${fmtDist(BIOMES[bi].from)}`, '#' + new THREE.Color(BIOMES[bi].trackLine).getHexString());
      g.audio.play('biome');
    }
    const cur = BIOMES[bi], prev = BIOMES[Math.max(0, bi - 1)];
    const t = bi === 0 ? 1 : smoothstep(0, 1, (this.meters - cur.from) / BIOME_BLEND);
    g.sky.blend(prev, cur, t);

    // next goal text
    const nextB = BIOMES[bi + 1];
    const nextM = MILESTONES[this.milestoneIdx];
    if (nextB && (!nextM || nextB.from <= nextM.m)) this.nextText = `NEXT: ${nextB.name} in ${fmtDist(nextB.from - this.meters)}`;
    else if (nextM) this.nextText = `NEXT MILESTONE: ${fmtDist(nextM.m)} (${fmtDist(nextM.m - this.meters)})`;
    else this.nextText = '∞ KEEP GOING!';

    // ---- progression (throttled) & crash-safe pending run
    this.progTimer += dt;
    if (this.progTimer > 0.25) {
      this.progTimer = 0;
      g.progression.runProgress(this.meters, this.currentSpeed);
    }
    this.saveTimer += dt;
    if (this.saveTimer > 3) {
      this.saveTimer = 0;
      g.state.pendingRun = { meters: this.meters, coins: this.coins };
    }

    // ---- floating origin
    if (this.z > RUN.rebaseDistance) this.rebase(-this.z);
  }

  rebase(dz) {
    const g = this.game;
    this.z += dz;
    this.maxZ += dz;
    g.character.position.z += dz;
    g.track.shift(dz);
    g.pets.shift(dz);
    g.cam.shift(dz);
    g.speedFx.shift(dz);
    g.particles.shiftZ?.(dz);
  }

  toggleAutoRun() {
    this.autoRun = !this.autoRun;
    this.game.state.settings.autoRun = this.autoRun;
    this.game.audio.play('click');
    this.game.hud.toast(this.autoRun ? 'AUTO-RUN ON' : 'AUTO-RUN OFF');
  }

  onItem(type, item, outcome) {
    const g = this.game;
    const p = _v.set(item.x, item.y + 0.5, item.z);
    switch (outcome) {
      case 'collect':
        g.track.removeItem(item);
        if (type === 'coin') {
          const v = E.coinValue(this.meters);
          this.coins += v;
          g.progression.stat('coins', 1);
          g.audio.play('coin');
          g.particles.sparkle(p, 0xffd23f, 0.6, 3);
          // batch coin pop-ups so fast coin lines don't spam the screen
          this.coinPop = (this.coinPop || 0) + v * E.petMultiplier(g.state) * E.rebirthEarnMult(g.state) * E.boostMoneyMult(g.state);
          if (this.time - (this.lastCoinPop || -1) > 0.35) {
            g.floatAt(p, '+' + formatMoney(this.coinPop), '#ffd23f');
            this.coinPop = 0;
            this.lastCoinPop = this.time;
          }
        } else {
          g.progression.addGems(1, 'pickup');
          g.audio.play('gem');
          g.particles.burst(p, { count: 14, color: 0x5ff3ff, speed: 3, up: 3, life: 0.6, size: 0.3, gravity: 4 });
          g.floatAt(p, '+1 💎', '#5ff3ff');
        }
        break;
      case 'cleared':
        g.progression.stat('hurdles', 1);
        g.audio.play('hurdle');
        g.floatAt(p.set(this.x, 2.4, this.z), 'NICE JUMP!', '#5ff3ff');
        break;
      case 'hit':
        this.stumble = SPEED.stumbleRecover;
        this.momentum *= 1 - SPEED.stumbleMomentumLoss;
        this.boostTime = 0;
        g.track.removeItem(item);
        g.audio.play('stumble');
        g.character.anim.triggerStumble();
        g.particles.burst(p, { count: 18, colors: [0xffffff, 0xff3d3d, 0xffb21a], speed: 5, up: 4, life: 0.6, size: 0.3, gravity: 12 });
        g.floatAt(p.set(this.x, 2.4, this.z), 'OOF!', '#ff3d7f');
        break;
      case 'boost':
        this.boostTime = SPEED.boostPadTime;
        g.progression.stat('pads', 1);
        g.audio.play('boost');
        g.particles.burst(p, { count: 20, color: 0x39ff88, speed: 4, up: 2, life: 0.5, size: 0.3, gravity: 0 });
        g.floatAt(p.set(this.x, 2.4, this.z), 'BOOST!', '#39ff88');
        break;
    }
  }

  onMilestone(ms) {
    const g = this.game;
    const big = ms.m >= 1000;
    const label = ms.label || fmtDist(ms.m) + '!';
    const r = E.rewardBreakdown(g.state, this.meters, this.coins);
    g.hud.milestone(label, `DISTANCE BONUS x${r.distMult.toFixed(1)} • ${formatMoney(r.total)}`);
    g.audio.play('milestone', { big });
    const pos = g.character.position;
    g.particles.burst(_v.set(pos.x, pos.y + 1.5, pos.z + 3), { count: big ? 50 : 24, colors: [0xffd23f, 0x5ff3ff, 0xff3d7f, 0x39ff88], speed: 7, up: 6, life: 1, size: 0.35, gravity: 8 });
    if (ms.m >= 10000) g.platform.happytime();
  }
}

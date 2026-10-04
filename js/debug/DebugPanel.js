// Developer panel — only loaded when DEBUG_MODE is true or ?debug=1 on localhost (never in production builds).
// Toggle with the ` (backquote) key.
import { SNEAKERS } from '../config/sneakers.js';
import { EGGS, PETS } from '../config/pets.js';
import * as E from '../systems/Economy.js';
import { formatMoney } from '../utils/math.js';
import { fmtDist } from '../world/Lobby.js';

export class DebugPanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('debug');
    this.el.classList.remove('hidden');
    this.timer = 0;
    this.render();
    window.__game = game; // console access for testing
    window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') this.el.classList.toggle('hidden'); });
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { e.stopPropagation(); this.act(b.dataset.a, b.dataset.v); }
    });
  }

  render() {
    const B = (a, label, v = '') => `<button data-a="${a}" data-v="${v}">${label}</button>`;
    this.el.innerHTML = `<h4>DEBUG (\`)</h4>
      ${B('money', '+$1K', 1e3)}${B('money', '+$1M', 1e6)}${B('money', '+$1B', 1e9)}${B('gems', '+100💎', 100)}<br>
      ${B('sneakers', 'Unlock all sneakers')}${B('pets', 'Add pets (1/egg)')}<br>
      Force next hatch: ${B('force', 'Epic', 'Epic')}${B('force', 'Legendary', 'Legendary')}${B('force', 'Mythic', 'Mythic')}${B('force', 'Secret', 'Secret')}<br>
      Speed: ${B('speed', 'off', 0)}${B('speed', '50', 50)}${B('speed', '200', 200)}${B('speed', '1000', 1000)}<br>
      Run: ${B('tp', '+1 km', 1000)}${B('tp', '+10 km', 10000)}${B('tp', '→100 km', 'to100')}${B('turbo', 'turbo x1', 1)}${B('turbo', 'x10', 10)}${B('turbo', 'x40', 40)}<br>
      ${B('simcash', 'Simulate 5 km cash out')}${B('start', 'Start run')}${B('cashout', 'Cash out now')}<br>
      ${B('reset', 'RESET SAVE')}
      <pre id="dbg-info"></pre>`;
  }

  act(a, v) {
    const g = this.game, p = g.progression;
    switch (a) {
      case 'money': p.addMoney(Number(v), 'debug'); break;
      case 'gems': p.addGems(Number(v), 'debug'); break;
      case 'sneakers': p.unlockAllSneakers(); g.lobby.refresh(g.state); break;
      case 'pets': for (const e of EGGS) p.addPet(E.rollEgg(e, 0)); break;
      case 'force': p.forceRarity = v; g.toast(`Next hatch: ${v}+`); break;
      case 'speed':
        g.state.debugSpeed = Number(v);
        if (g.mode === 'run') g.runCtl.setSpeedOverride();
        g.toast(Number(v) ? `Speed override ${v} m/s` : 'Speed override off');
        break;
      case 'tp':
        if (g.mode !== 'run') g.startRun();
        g.runCtl.teleport(v === 'to100' ? Math.max(0, 100000 - g.runCtl.meters) : Number(v));
        break;
      case 'turbo': g.turbo = Number(v); break;
      case 'simcash': {
        const r = p.cashOut(5000, 0);
        g.toast(`Simulated 5 km cash out: +${formatMoney(r.total)}`);
        break;
      }
      case 'start': g.startRun(); break;
      case 'cashout': g.cashOut(); break;
      case 'reset': g.resetProgress(); break;
    }
    g.save();
    g.panels.refresh();
  }

  update(dt) {
    this.timer += dt;
    if (this.timer < 0.5 || this.el.classList.contains('hidden')) return;
    this.timer = 0;
    const g = this.game, info = g.renderer.info, t = g.track.debugInfo();
    const heap = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'n/a';
    const lines = [
      `fps ${g.fpsAvg.toFixed(0)}  calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k`,
      `geometries ${info.memory.geometries}  textures ${info.memory.textures}  heap ${heap}`,
      `mode ${g.mode}  turbo x${g.turbo || 1}`,
      `quality ${g.pipeline.qualityName}  env ${g.pipeline.envName}  post ${g.pipeline.composer ? 'on' : 'off'}`,
      `assets ${g.assets.files.size} avail · ${g.assets.stats.loaded} loaded (${(g.assets.stats.bytes / 1024).toFixed(0)} KB) · boot ${g.assets.stats.bootMs ?? '-'} ms`,
      `character ${g.character.isGLB ? 'GLB' : 'procedural'}`,
      `chunks ${t.chunks}/${t.pool}  variants ${t.variants}  items ${t.items}  spawned ${t.spawned}`,
    ];
    if (g.mode === 'run') {
      const r = g.runCtl;
      lines.push(`dist ${fmtDist(r.meters)}  z ${r.z.toFixed(1)}  ratio ${r.ratio.toFixed(2)}`);
      lines.push(`speed ${E.kmh(r.currentSpeed).toFixed(0)} km/h  world ${r.worldV.toFixed(1)} u/s`);
      lines.push(`reward ${formatMoney(E.potentialReward(g.state, r.meters, r.coins))}`);
    }
    document.getElementById('dbg-info').textContent = lines.join('\n');
  }
}

export { SNEAKERS, PETS };

// Multiplayer seam. The single-player game talks to this adapter only through a few
// high-level events (run start / cash out / periodic player state). Today it is an offline
// no-op; a future online adapter (e.g. the Socket.IO room server from Salvage Island 3D:
// RoomManager / ServerRoom / snapshot interpolation) can implement the same interface to
// show other players in the lobby, ghost runners on the track and global leaderboards.
//
// Interface:
//   connect(): Promise<boolean>     — false when offline
//   send(type, payload)            — 'run:start' | 'run:cashout' | 'state'
//   update(dt)                     — called every frame (send throttled snapshots here)
//   remotePlayers: Map<id, {x,z,yaw,anim,sneaker,pets}>
export class NetAdapter {
  constructor(game) {
    this.game = game;
    this.online = false;
    this.remotePlayers = new Map();
    this.outbox = [];
  }

  async connect() { return false; }

  send(type, payload = {}) {
    if (!this.online) return;
    this.outbox.push({ type, payload, t: Date.now() });
  }

  update() {}
}

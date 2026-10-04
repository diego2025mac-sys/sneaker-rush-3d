// Tiny pub/sub used to decouple gameplay systems from UI, audio and missions.
export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    this.map.get(evt)?.delete(fn);
  }
  emit(evt, data) {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(data);
      } catch (e) {
        console.error(`[EventBus] handler for "${evt}" failed`, e);
      }
    }
  }
}

export const bus = new EventBus();

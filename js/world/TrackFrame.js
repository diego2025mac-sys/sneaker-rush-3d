// The running track's local frame. Chunks are laid end to end along FORWARD; everything that has to
// "point down the track" (boost-pad arrows, painted road arrows, streak particles) derives its
// orientation from these vectors instead of hard-coding a rotation.
import * as THREE from 'three';

export const TRACK_FORWARD = new THREE.Vector3(0, 0, 1);
export const TRACK_UP = new THREE.Vector3(0, 1, 0);
/** Screen-right for a camera looking down the track (−x with the default frame). */
export const TRACK_RIGHT = new THREE.Vector3().crossVectors(TRACK_FORWARD, TRACK_UP).normalize();

/** Yaw (rotation about +Y) that turns a model whose nose points along `axis` to face `dir`. */
export function yawToward(dir, axis = TRACK_FORWARD) {
  return Math.atan2(dir.x, dir.z) - Math.atan2(axis.x, axis.z);
}

/** Quaternion that turns `axis` onto `dir` (both unit vectors). */
export function alignQuat(out, dir, axis = TRACK_FORWARD) {
  return out.setFromUnitVectors(axis, dir);
}

/**
 * Flat chevron (arrowhead) lying in the XZ plane, base at y = 0, height 1, centred on the origin.
 * Its tip points along +Z — CHEVRON_AXIS — so callers rotate it with alignQuat / yawToward.
 */
export const CHEVRON_AXIS = new THREE.Vector3(0, 0, 1);
let chevron = null;
export function chevronGeometry() {
  if (chevron) return chevron;
  const sh = new THREE.Shape();
  // (u, v) = (lateral, forward); the tip is at v = +0.5
  sh.moveTo(0, 0.5); sh.lineTo(0.5, 0.02); sh.lineTo(0.5, -0.38); sh.lineTo(0, 0.1);
  sh.lineTo(-0.5, -0.38); sh.lineTo(-0.5, 0.02); sh.closePath();
  let g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
  // shape (u, v, w) → world (x = u, y = -w, z = v): extrude depth becomes height, v becomes forward
  g.translate(0, 0, -1).rotateX(Math.PI / 2);
  g.deleteAttribute('uv');
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  chevron = g;
  return g;
}

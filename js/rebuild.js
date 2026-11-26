// Rebuild: drag bones onto the skeleton outline, turn them and snap them in.
// Pure logic (positions in the creature's 200 x 120 frame).

export const SNAP_DIST = 13;   // how close (in skeleton units) a bone must be to its spot
export const SNAP_ANGLE = 23;  // and how close its angle must be (degrees)
export const ROT_STEP = 45;

export function angleDiff(a, b) {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return Math.abs(d);
}

/**
 * Find the empty spot a dropped piece fits. piece: { boneId, x, y, rot }.
 * filled: Set of slot ids already used. Returns the slot bone, or null.
 */
export function findSnap(creature, piece, filled) {
  const slot = creature.bones.find((b) => b.id === piece.boneId);
  if (!slot || filled.has(slot.id)) return null;
  const d = Math.hypot(slot.x - piece.x, slot.y - piece.y);
  return d <= SNAP_DIST && angleDiff(piece.rot, slot.rot) <= SNAP_ANGLE ? slot : null;
}

/** Is the piece close to a matching spot but turned the wrong way? (For a "try turning it" hint.) */
export function nearButTurned(creature, piece, filled) {
  const slot = creature.bones.find((b) => b.id === piece.boneId);
  return !!slot && !filled.has(slot.id) && Math.hypot(slot.x - piece.x, slot.y - piece.y) <= SNAP_DIST * 1.4
    && angleDiff(piece.rot, slot.rot) > SNAP_ANGLE;
}

/**
 * Start a rebuild. Pieces are the bones you've found that aren't on the
 * skeleton yet, laid out in the tray, each turned a random multiple of 45 degrees.
 */
export function startRebuild(creature, collected, assembled, rng = Math.random) {
  const filled = new Set(assembled);
  const pieces = [];
  for (const b of creature.bones) {
    if (!collected[b.id] || filled.has(b.id)) continue;
    const turns = 1 + Math.floor(rng() * 7); // never already the right way round
    pieces.push({ boneId: b.id, x: 0, y: 0, rot: (b.rot + turns * ROT_STEP) % 360, placed: false });
  }
  return { creature, filled, pieces };
}

/**
 * Lay pieces out in a tray area (x0..x1, y0..y1 in skeleton units), packed in
 * shelves so they don't overlap. sizeOf(piece) gives its { w, h } as turned.
 */
export function layoutTray(state, x0, y0, x1, y1, sizeOf = () => ({ w: 20, h: 12 })) {
  const items = state.pieces.map((p) => ({ p, ...sizeOf(p) }));
  if (!items.length) return true;
  items.sort((a, b) => b.h - a.h);
  const gap = 3;
  let x = x0;
  let y = y0;
  let shelf = 0;
  for (const it of items) {
    if (x + it.w > x1 && x > x0) { x = x0; y += shelf + gap; shelf = 0; }
    it.p.x = x + it.w / 2;
    it.p.y = y + it.h / 2;
    x += it.w + gap;
    shelf = Math.max(shelf, it.h);
  }
  return y + shelf <= y1; // false if it overflowed
}

/** Drop a piece. Snaps it if it fits; returns the slot id it went into, or null. */
export function dropPiece(state, piece) {
  const slot = findSnap(state.creature, piece, state.filled);
  if (!slot) return null;
  piece.x = slot.x;
  piece.y = slot.y;
  piece.rot = slot.rot;
  piece.placed = true;
  piece.slot = slot.id;
  state.filled.add(slot.id);
  return slot.id;
}

export const isComplete = (state) => state.creature.bones.every((b) => state.filled.has(b.id));

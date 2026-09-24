/* ============================================================================
   Cantori — SPD LEVEL BUILDER (a port of Shattered Pixel Dungeon's floor maker)
   ----------------------------------------------------------------------------
   Translated from SPD v4.0.0 (commit pinned in vendor/spd/README.md), GPLv3:
     levels/builders/{Builder,RegularBuilder,LoopBuilder,FigureEightBuilder}.java
     levels/rooms/Room.java, rooms/connection/*, rooms/standard/*, rooms/special/*
     levels/painters/{Painter,RegularPainter}.java, levels/Patch.java
   Each room painter names the SPD class it came from.

   This module knows nothing about Cantori's game state. It is handed a random
   source and a few knobs, and returns an abstract floor:

     CantoriSPD.generate({ rand, depth, region, standard, special, water, grass,
                           maxW, maxH })
       -> { w, h, map: Int8Array (T.* codes, row-major), rooms: [...],
            entrance: {x,y}, exit: {x,y}, drops: [...], mobs: [...],
            keys: n, traps: [...] }

   game.js turns T.* codes into its own tiles, drops into items, and so on. That
   split is deliberate: every rule-5 question (what blocks, what severs a floor)
   is answered in game.js against its own TILE table, and this file can be run
   headless in node to hammer thousands of seeds without booting the page.

   One thing SPD does not have to care about and we do: Cantori forbids
   corner-cutting diagonal moves, SPD allows them. Every connection SPD makes is
   through a door on a straight wall, so nothing here depends on a diagonal —
   but painted interiors (ellipses, patches) can leave diagonal-only pinches,
   which game.js's fixOpenCorners irons out afterwards as it always has.
   ============================================================================ */
(function () {
  "use strict";

  // Terrain the builder paints. Codes, not Cantori tiles — see TERRAIN_TO_TILE in
  // game.js. SPD has two waters; so do we. WATER is a designed pool (aquarium,
  // water bridge) that game.js may make deep, because the room's own shape
  // guarantees a way round or across it. SHALLOW is the painter's random patch
  // fill, which guarantees nothing and so must never block feet.
  const T = {
    WALL: 0, EMPTY: 1, EMPTY_SP: 2, WATER: 3, SHALLOW: 4, GRASS: 5, HIGH_GRASS: 6,
    CHASM: 7, STATUE: 8, BOOKSHELF: 9, EMBERS: 10, PEDESTAL: 11, WELL: 12,
    DOOR: 13, LOCKED_DOOR: 14, SECRET_DOOR: 15, ENTRANCE: 16, EXIT: 17, DECO: 18,
  };
  // Which codes a room painter treats as "solid" for SPD's own checks (canMerge,
  // SegmentedRoom's wall test). Mirrors SPD Terrain.SOLID for the codes we paint.
  const SOLID = new Set([T.WALL, T.STATUE, T.BOOKSHELF, T.WELL, T.LOCKED_DOOR, T.SECRET_DOOR]);

  // ---- Random (watabou's Random, over an injected float source) -------------
  let rnd = Math.random;
  const R = {
    Float: (a, b) => (a === undefined ? rnd() : b === undefined ? rnd() * a : a + rnd() * (b - a)),
    Int: (a, b) => (b === undefined ? Math.floor(rnd() * a) : a + Math.floor(rnd() * (b - a))),
    IntRange: (a, b) => a + Math.floor(rnd() * (b - a + 1)),
    // Triangular: the mean of two uniform draws — SPD's room-size distribution.
    NormalIntRange: (a, b) => a + Math.floor((rnd() + rnd()) * (b - a + 1) / 2),
    chances(ch) {
      let sum = 0;
      for (const c of ch) sum += c;
      if (sum <= 0) return -1;
      let v = rnd() * sum;
      for (let i = 0; i < ch.length; i++) { v -= ch[i]; if (v < 0 && ch[i] > 0) return i; }
      for (let i = ch.length - 1; i >= 0; i--) if (ch[i] > 0) return i;
      return -1;
    },
    element: (a) => a[Math.floor(rnd() * a.length)],
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    },
  };
  const gate = (lo, v, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---- Rect (watabou Rect: inclusive edges, width = right - left) -----------
  class Rect {
    constructor(l, t, r, b) { this.left = l || 0; this.top = t || 0; this.right = r || 0; this.bottom = b || 0; }
    set(l, t, r, b) { this.left = l; this.top = t; this.right = r; this.bottom = b; return this; }
    width() { return this.right - this.left; }
    height() { return this.bottom - this.top; }
    square() { return this.width() * this.height(); }
    isEmpty() { return this.right <= this.left || this.bottom <= this.top; }
    setEmpty() { this.left = this.right = this.top = this.bottom = 0; return this; }
    setPos(x, y) { return this.set(x, y, x + (this.right - this.left), y + (this.bottom - this.top)); }
    shift(x, y) { this.left += x; this.right += x; this.top += y; this.bottom += y; return this; }
    resize(w, h) { this.right = this.left + w; this.bottom = this.top + h; return this; }
    intersect(o) {
      return new Rect(Math.max(this.left, o.left), Math.max(this.top, o.top), Math.min(this.right, o.right), Math.min(this.bottom, o.bottom));
    }
    inside(p) { return p.x >= this.left && p.x < this.right && p.y >= this.top && p.y < this.bottom; }
    getPoints() {
      const pts = [];
      for (let x = this.left; x <= this.right; x++) for (let y = this.top; y <= this.bottom; y++) pts.push({ x, y });
      return pts;
    }
    center() {
      return { x: Math.floor((this.left + this.right) / 2) + (((this.right - this.left) & 1) === 1 ? R.Int(2) : 0),
               y: Math.floor((this.top + this.bottom) / 2) + (((this.bottom - this.top) & 1) === 1 ? R.Int(2) : 0) };
    }
  }

  // ---- Room (SPD Room.java) ---------------------------------------------------
  const ALL = 0, LEFT = 1, TOP = 2, RIGHT = 3, BOTTOM = 4;
  // Door types in SPD's precedence order: a door's type only ever moves right.
  const DOOR = { EMPTY: 0, TUNNEL: 1, WATER: 2, REGULAR: 3, UNLOCKED: 4, HIDDEN: 5, BARRICADE: 6, LOCKED: 7, CRYSTAL: 8, WALL: 9 };
  class Door {
    constructor(x, y) { this.x = x; this.y = y; this.type = DOOR.EMPTY; }
    set(t) { if (t > this.type) this.type = t; }
  }

  class Room extends Rect {
    constructor() { super(); this.neighbours = []; this.connected = new Map(); this.kind = "room"; }
    minWidth() { return -1; } maxWidth() { return -1; } minHeight() { return -1; } maxHeight() { return -1; }
    width() { return super.width() + 1; }
    height() { return super.height() + 1; }
    setSize() { return this.setSizeRange(this.minWidth(), this.maxWidth(), this.minHeight(), this.maxHeight()); }
    setSizeRange(minW, maxW, minH, maxH) {
      if (minW < this.minWidth() || maxW > this.maxWidth() || minH < this.minHeight() || maxH > this.maxHeight() || minW > maxW || minH > maxH) return false;
      this.resize(R.NormalIntRange(minW, maxW) - 1, R.NormalIntRange(minH, maxH) - 1);
      return true;
    }
    setSizeWithLimit(w, h) {
      if (w < this.minWidth() || h < this.minHeight()) return false;
      this.setSize();
      if (this.width() > w || this.height() > h) this.resize(Math.min(this.width(), w) - 1, Math.min(this.height(), h) - 1);
      return true;
    }
    pointInside(from, n) {
      const s = { x: from.x, y: from.y };
      if (from.x === this.left) s.x += n; else if (from.x === this.right) s.x -= n;
      else if (from.y === this.top) s.y += n; else if (from.y === this.bottom) s.y -= n;
      return s;
    }
    random(m) {
      if (m === undefined) m = 1;
      return { x: R.IntRange(this.left + m, this.right - m), y: R.IntRange(this.top + m, this.bottom - m) };
    }
    inside(p) { return p.x > this.left && p.y > this.top && p.x < this.right && p.y < this.bottom; }
    minConnections(dir) { return dir === ALL ? 1 : 0; }
    maxConnections(dir) { return dir === ALL ? 16 : 4; }
    curConnections(dir) {
      if (dir === ALL) return this.connected.size;
      let total = 0;
      for (const r of this.connected.keys()) {
        const i = this.intersect(r);
        if (dir === LEFT && i.width() === 0 && i.left === this.left) total++;
        else if (dir === TOP && i.height() === 0 && i.top === this.top) total++;
        else if (dir === RIGHT && i.width() === 0 && i.right === this.right) total++;
        else if (dir === BOTTOM && i.height() === 0 && i.bottom === this.bottom) total++;
      }
      return total;
    }
    remConnections(dir) {
      if (this.curConnections(ALL) >= this.maxConnections(ALL)) return 0;
      return this.maxConnections(dir) - this.curConnections(dir);
    }
    canConnectPoint(p) { return (p.x === this.left || p.x === this.right) !== (p.y === this.top || p.y === this.bottom); }
    canConnectDir(dir) { return this.remConnections(dir) > 0; }
    canConnect(r) {
      if ((this.isExit() && r.isEntrance()) || (this.isEntrance() && r.isExit())) return false;
      const i = this.intersect(r);
      let found = false;
      for (const p of i.getPoints()) if (this.canConnectPoint(p) && r.canConnectPoint(p)) { found = true; break; }
      if (!found) return false;
      if (i.width() === 0 && i.left === this.left) return this.canConnectDir(LEFT) && r.canConnectDir(RIGHT);
      if (i.height() === 0 && i.top === this.top) return this.canConnectDir(TOP) && r.canConnectDir(BOTTOM);
      if (i.width() === 0 && i.right === this.right) return this.canConnectDir(RIGHT) && r.canConnectDir(LEFT);
      if (i.height() === 0 && i.bottom === this.bottom) return this.canConnectDir(BOTTOM) && r.canConnectDir(TOP);
      return false;
    }
    canMerge() { return false; }
    merge(lv, other, rect, terrain) { fillRect(lv, rect, terrain); }
    addNeighbour(o) {
      if (this.neighbours.includes(o)) return true;
      const i = this.intersect(o);
      if ((i.width() === 0 && i.height() >= 2) || (i.height() === 0 && i.width() >= 2)) {
        this.neighbours.push(o); o.neighbours.push(this);
        return true;
      }
      return false;
    }
    connect(room) {
      if ((this.neighbours.includes(room) || this.addNeighbour(room)) && !this.connected.has(room) && this.canConnect(room)) {
        this.connected.set(room, null); room.connected.set(this, null);
        return true;
      }
      return false;
    }
    clearConnections() {
      for (const r of this.neighbours) { const k = r.neighbours.indexOf(this); if (k >= 0) r.neighbours.splice(k, 1); }
      this.neighbours = [];
      for (const r of this.connected.keys()) r.connected.delete(this);
      this.connected.clear();
    }
    isEntrance() { return false; }
    isExit() { return false; }
    canPlaceWater() { return true; }
    canPlaceGrass() { return true; }
    doors() { return Array.from(this.connected.values()).filter(Boolean); }
    paint() {}
  }

  // ---- Level canvas: the flat terrain array the painters write into ---------
  function makeLevel(w, h) {
    return { w, h, map: new Int8Array(w * h), drops: [], mobs: [], traps: [], plants: [], keys: 0, entrance: null, exit: null };
  }
  const cell = (lv, x, y) => x + y * lv.w;
  function setT(lv, x, y, t) { if (x >= 0 && y >= 0 && x < lv.w && y < lv.h) lv.map[x + y * lv.w] = t; }
  const getT = (lv, x, y) => (x >= 0 && y >= 0 && x < lv.w && y < lv.h ? lv.map[x + y * lv.w] : T.WALL);
  // Painter.fill(level, x, y, w, h, value) — w/h are TILE counts here.
  function fill(lv, x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setT(lv, i, j, t); }
  // Painter.fill(level, room, m, value): a Room's width() is its tile count.
  function fillRoom(lv, r, m, t) { fill(lv, r.left + m, r.top + m, r.width() - 2 * m, r.height() - 2 * m, t); }
  // Painter.fill(level, Rect, value) on a plain Rect uses the Rect's own width(),
  // which is one short of its tile count — SPD relies on that in mergeRooms.
  function fillRect(lv, rc, t) { fill(lv, rc.left, rc.top, rc.width(), rc.height(), t); }
  function drawLine(lv, from, to, t) {
    let x = from.x, y = from.y, dx = to.x - from.x, dy = to.y - from.y;
    const byX = Math.abs(dx) >= Math.abs(dy);
    if (byX) { dy /= Math.abs(dx) || 1; dx /= Math.abs(dx) || 1; } else { dx /= Math.abs(dy) || 1; dy /= Math.abs(dy) || 1; }
    setT(lv, Math.round(x), Math.round(y), t);
    let guard = 0;
    while (((byX && to.x !== x) || (!byX && to.y !== y)) && guard++ < 200) {
      x += dx; y += dy;
      setT(lv, Math.round(x), Math.round(y), t);
    }
  }
  function fillEllipse(lv, r, m, t) {
    const x = r.left + m, y = r.top + m, w = r.width() - 2 * m, h = r.height() - 2 * m;
    const radH = h / 2, radW = w / 2;
    for (let i = 0; i < h; i++) {
      const rowY = -radH + 0.5 + i;
      let rowW = 2.0 * Math.sqrt(radW * radW * (1.0 - (rowY * rowY) / (radH * radH)));
      if (w % 2 === 0) rowW = Math.round(rowW / 2.0) * 2.0;
      else { rowW = Math.floor(rowW / 2.0) * 2.0; rowW++; }
      const x0 = x + Math.floor((w - rowW) / 2);
      for (let k = 0; k < rowW; k++) setT(lv, x0 + k, y + i, t);
    }
  }
  function drawInside(lv, room, from, n, t) {
    const step = { x: 0, y: 0 };
    if (from.x === room.left) step.x = 1; else if (from.x === room.right) step.x = -1;
    else if (from.y === room.top) step.y = 1; else if (from.y === room.bottom) step.y = -1;
    const p = { x: from.x + step.x, y: from.y + step.y };
    for (let i = 0; i < n; i++) { if (t !== -1) setT(lv, p.x, p.y, t); p.x += step.x; p.y += step.y; }
    return p;
  }

  // ---- Patch (SPD Patch.java): cellular-automaton blobs ---------------------
  function patchGenerate(w, h, fillRate, clustering, forceFillRate) {
    const length = w * h;
    let cur = new Array(length).fill(false), off = new Array(length).fill(false);
    let fillDiff = -Math.round(length * fillRate);
    if (forceFillRate && clustering > 0) fillRate += (0.5 - fillRate) * 0.5;
    for (let i = 0; i < length; i++) { off[i] = R.Float() < fillRate; if (off[i]) fillDiff++; }
    for (let c = 0; c < clustering; c++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const pos = x + y * w;
        let count = 0, nb = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          nb++; if (off[nx + ny * w]) count++;
        }
        cur[pos] = 2 * count >= nb;
        if (cur[pos] !== off[pos]) fillDiff += cur[pos] ? 1 : -1;
      }
      const tmp = cur; cur = off; off = tmp;
    }
    if (forceFillRate && Math.min(w, h) > 2) {
      const nbs = [-w - 1, -w, -w + 1, -1, 0, 1, w - 1, w, w + 1];
      const growing = fillDiff < 0;
      let guard = 0;
      while (fillDiff !== 0 && guard++ < length * 4) {
        let c, tries = 0;
        do { c = R.Int(1, w - 1) + R.Int(1, h - 1) * w; tries++; } while (off[c] !== growing && tries * 10 < length);
        for (const n of nbs) if (fillDiff !== 0 && off[c + n] !== growing) { off[c + n] = growing; fillDiff += growing ? 1 : -1; }
      }
    }
    return off;
  }

  // ---- Builder geometry (SPD Builder.java) -------------------------------------
  function findNeighbours(rooms) {
    for (let i = 0; i < rooms.length - 1; i++) for (let j = i + 1; j < rooms.length; j++) rooms[i].addNeighbour(rooms[j]);
  }
  function findFreeSpace(start, collision, maxSize) {
    const space = new Rect(start.x - maxSize, start.y - maxSize, start.x + maxSize, start.y + maxSize);
    let colliding = collision.slice();
    do {
      colliding = colliding.filter((room) => !(room.isEmpty()
        || Math.max(space.left, room.left) >= Math.min(space.right, room.right)
        || Math.max(space.top, room.top) >= Math.min(space.bottom, room.bottom)));
      let closest = null, closestDiff = Infinity;
      for (const cr of colliding) {
        let dx = 0, dy = 0, inside = true;
        if (start.x <= cr.left) { inside = false; dx = cr.left - start.x; }
        else if (start.x >= cr.right) { inside = false; dx = start.x - cr.right; }
        if (start.y <= cr.top) { inside = false; dy = cr.top - start.y; }
        else if (start.y >= cr.bottom) { inside = false; dy = start.y - cr.bottom; }
        if (inside) { space.set(start.x, start.y, start.x, start.y); return space; }
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < closestDiff) { closestDiff = len; closest = cr; }
      }
      if (closest) {
        let wDiff = Infinity, hDiff = Infinity;
        if (closest.left >= start.x) wDiff = (space.right - closest.left) * (space.height() + 1);
        else if (closest.right <= start.x) wDiff = (closest.right - space.left) * (space.height() + 1);
        if (closest.top >= start.y) hDiff = (space.bottom - closest.top) * (space.width() + 1);
        else if (closest.bottom <= start.y) hDiff = (closest.bottom - space.top) * (space.width() + 1);
        if (wDiff < hDiff || (wDiff === hDiff && R.Int(2) === 0)) {
          if (closest.left >= start.x && closest.left < space.right) space.right = closest.left;
          if (closest.right <= start.x && closest.right > space.left) space.left = closest.right;
        } else {
          if (closest.top >= start.y && closest.top < space.bottom) space.bottom = closest.top;
          if (closest.bottom <= start.y && closest.bottom > space.top) space.top = closest.bottom;
        }
        colliding.splice(colliding.indexOf(closest), 1);
      } else colliding = [];
    } while (colliding.length);
    return space;
  }
  const A = 180 / Math.PI;
  function angleBetweenPoints(from, to) {
    const m = (to.y - from.y) / (to.x - from.x);
    let angle = A * (Math.atan(m) + Math.PI / 2.0);
    if (from.x > to.x) angle -= 180;
    return angle;
  }
  const centreF = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  const angleBetweenRooms = (a, b) => angleBetweenPoints(centreF(a), centreF(b));
  function placeRoom(collision, prev, next, angle) {
    angle %= 360; if (angle < 0) angle += 360;
    const pc = centreF(prev);
    const m = Math.tan(angle / A + Math.PI / 2.0);
    const b = pc.y - m * pc.x;
    let start, dir;
    if (Math.abs(m) >= 1) {
      if (angle < 90 || angle > 270) { dir = TOP; start = { x: Math.round((prev.top - b) / m), y: prev.top }; }
      else { dir = BOTTOM; start = { x: Math.round((prev.bottom - b) / m), y: prev.bottom }; }
    } else {
      if (angle < 180) { dir = RIGHT; start = { x: prev.right, y: Math.round(m * prev.right + b) }; }
      else { dir = LEFT; start = { x: prev.left, y: Math.round(m * prev.left + b) }; }
    }
    if (dir === TOP || dir === BOTTOM) start.x = gate(prev.left + 1, start.x, prev.right - 1);
    else start.y = gate(prev.top + 1, start.y, prev.bottom - 1);
    const space = findFreeSpace(start, collision, Math.max(next.maxWidth(), next.maxHeight()));
    if (!next.setSizeWithLimit(space.width() + 1, space.height() + 1)) return -1;
    const tc = { x: 0, y: 0 };
    if (dir === TOP) {
      tc.y = prev.top - (next.height() - 1) / 2; tc.x = (tc.y - b) / m;
      next.setPos(Math.round(tc.x - (next.width() - 1) / 2), prev.top - (next.height() - 1));
    } else if (dir === BOTTOM) {
      tc.y = prev.bottom + (next.height() - 1) / 2; tc.x = (tc.y - b) / m;
      next.setPos(Math.round(tc.x - (next.width() - 1) / 2), prev.bottom);
    } else if (dir === RIGHT) {
      tc.x = prev.right + (next.width() - 1) / 2; tc.y = m * tc.x + b;
      next.setPos(prev.right, Math.round(tc.y - (next.height() - 1) / 2));
    } else {
      tc.x = prev.left - (next.width() - 1) / 2; tc.y = m * tc.x + b;
      next.setPos(prev.left - (next.width() - 1), Math.round(tc.y - (next.height() - 1) / 2));
    }
    if (dir === TOP || dir === BOTTOM) {
      if (next.right < prev.left + 2) next.shift(prev.left + 2 - next.right, 0);
      else if (next.left > prev.right - 2) next.shift(prev.right - 2 - next.left, 0);
      if (next.right > space.right) next.shift(space.right - next.right, 0);
      else if (next.left < space.left) next.shift(space.left - next.left, 0);
    } else {
      if (next.bottom < prev.top + 2) next.shift(0, prev.top + 2 - next.bottom);
      else if (next.top > prev.bottom - 2) next.shift(0, prev.bottom - 2 - next.top);
      if (next.bottom > space.bottom) next.shift(0, space.bottom - next.bottom);
      else if (next.top < space.top) next.shift(0, space.top - next.top);
    }
    return next.connect(prev) ? angleBetweenRooms(prev, next) : -1;
  }

  // ---- RegularBuilder + LoopBuilder + FigureEightBuilder --------------------
  // One object with SPD's knobs and state; the loop shape is picked per floor the
  // way RegularLevel.builder() picks it.
  function makeBuilder(kind, depth) {
    const B = {
      pathVariance: 45, pathLength: 0.25, pathLenJitter: [0, 0, 0, 1],
      pathTunnels: [2, 2, 1], branchTunnels: [1, 1, 0], extraConn: 0.30,
      curveExponent: 2, curveIntensity: 1, curveOffset: 0, depth,
    };
    if (kind === "loop") { B.curveIntensity = R.Float(0, 0.65) % 1; B.curveOffset = R.Float(0, 0.5) % 0.5; }
    else { B.curveIntensity = R.Float(0.3, 0.8) % 1; B.curveOffset = 0; }
    B.kind = kind;
    return B;
  }
  function curveEquation(B, x) {
    return Math.pow(4, 2 * B.curveExponent) * Math.pow((x % 0.5) - 0.25, 2 * B.curveExponent + 1) + 0.25 + 0.5 * Math.floor(2 * x);
  }
  function targetAngle(B, along) {
    along += B.curveOffset;
    return 360 * (B.curveIntensity * curveEquation(B, along) + (1 - B.curveIntensity) * along - B.curveOffset);
  }
  function setupRooms(B, rooms) {
    for (const r of rooms) r.setEmpty();
    B.entrance = B.exit = null;
    B.mainPath = []; B.multi = []; B.single = [];
    for (const r of rooms) {
      if (r.isEntrance()) B.entrance = r;
      else if (r.isExit()) B.exit = r;
      else if (r.maxConnections(ALL) > 1) B.multi.push(r);
      else if (r.maxConnections(ALL) === 1) B.single.push(r);
    }
    weightRooms(B.multi);
    R.shuffle(B.multi);
    B.multi = Array.from(new Set(B.multi));
    R.shuffle(B.multi);
    let onPath = Math.floor(B.multi.length * B.pathLength) + R.chances(B.pathLenJitter);
    while (onPath > 0 && B.multi.length) {
      const r = B.multi.shift();
      onPath -= r.sizeFactor ? r.sizeFactor() : 1;
      B.mainPath.push(r);
    }
  }
  function weightRooms(rooms) {
    for (const r of rooms.slice()) if (r.connectionWeight) for (let i = 1; i < r.connectionWeight(); i++) rooms.push(r);
  }
  function randomBranchAngle(B, r) {
    let center = null;
    if (B.kind === "loop") center = B.loopCenter;
    else if (B.firstLoop) center = B.firstLoop.includes(r) ? B.firstLoopCenter : B.secondLoopCenter;
    if (!center) return R.Float(360);
    let toCenter = angleBetweenPoints(centreF(r), center);
    if (toCenter < 0) toCenter += 360;
    let cur = R.Float(360);
    for (let i = 0; i < 4; i++) { const n = R.Float(360); if (Math.abs(toCenter - n) < Math.abs(toCenter - cur)) cur = n; }
    return cur;
  }
  function createBranches(B, rooms, branchable, toBranch, connChances) {
    let i = 0, failed = 0;
    let chances = connChances.slice();
    const thisBranch = [];
    while (i < toBranch.length) {
      if (failed > 100) return false;
      const r = toBranch[i];
      thisBranch.length = 0;
      let curr = R.element(branchable);
      let n = R.chances(chances);
      if (n === -1) { chances = connChances.slice(); n = R.chances(chances); }
      chances[n]--;
      let angle;
      for (let j = 0; j < n; j++) {
        const t = createConnectionRoom(B.depth);
        let tries = 3;
        do { angle = placeRoom(rooms, curr, t, randomBranchAngle(B, curr)); tries--; } while (angle === -1 && tries > 0);
        if (angle === -1) {
          t.clearConnections();
          for (const c of thisBranch) { c.clearConnections(); rooms.splice(rooms.indexOf(c), 1); }
          thisBranch.length = 0;
          break;
        }
        thisBranch.push(t); rooms.push(t);
        curr = t;
      }
      if (thisBranch.length !== n) { failed++; continue; }
      let tries = 10;
      do { angle = placeRoom(rooms, curr, r, randomBranchAngle(B, curr)); tries--; } while (angle === -1 && tries > 0);
      if (angle === -1) {
        r.clearConnections();
        for (const t of thisBranch) { t.clearConnections(); rooms.splice(rooms.indexOf(t), 1); }
        thisBranch.length = 0;
        failed++;
        continue;
      }
      for (const t of thisBranch) if (R.Int(3) <= 1) branchable.push(t);
      if (r.maxConnections(ALL) > 1 && R.Int(3) === 0) {
        const wgt = r.connectionWeight ? r.connectionWeight() : 1;
        for (let j = 0; j < wgt; j++) branchable.push(r);
      }
      i++;
    }
    return true;
  }
  function tunnelsFor(B, pool) {
    let n = R.chances(pool.c);
    if (n === -1) { pool.c = B.pathTunnels.slice(); n = R.chances(pool.c); }
    pool.c[n]--;
    return n;
  }
  function extraConnections(B, rooms) {
    findNeighbours(rooms);
    for (const r of rooms) for (const n of r.neighbours) if (!n.connected.has(r) && R.Float() < B.extraConn) r.connect(n);
  }
  function loopCenterOf(loop) {
    const c = { x: 0, y: 0 };
    for (const r of loop) { c.x += (r.left + r.right) / 2; c.y += (r.top + r.bottom) / 2; }
    c.x /= loop.length; c.y /= loop.length;
    return c;
  }
  function closeLoop(B, rooms, loop, prev, anchor) {
    let guard = 0;
    while (!prev.connect(anchor)) {
      if (guard++ > 20) return null;
      const c = createConnectionRoom(B.depth);
      if (placeRoom(rooms, prev, c, angleBetweenRooms(prev, anchor)) === -1) return null;
      loop.push(c); rooms.push(c);
      prev = c;
    }
    return prev;
  }
  function buildLoop(B, rooms) {
    setupRooms(B, rooms);
    if (!B.entrance) return null;
    B.entrance.setSize(); B.entrance.setPos(0, 0);
    const startAngle = R.Float(0, 360);
    B.mainPath.unshift(B.entrance);
    if (B.exit) B.mainPath.splice(Math.floor((B.mainPath.length + 1) / 2), 0, B.exit);
    const loop = [], pool = { c: B.pathTunnels.slice() };
    for (const r of B.mainPath) {
      loop.push(r);
      const n = tunnelsFor(B, pool);
      for (let j = 0; j < n; j++) loop.push(createConnectionRoom(B.depth));
    }
    let prev = B.entrance;
    for (let i = 1; i < loop.length; i++) {
      const r = loop[i];
      if (placeRoom(rooms, prev, r, startAngle + targetAngle(B, i / loop.length)) === -1) return null;
      prev = r;
      if (!rooms.includes(prev)) rooms.push(prev);
    }
    if (!closeLoop(B, rooms, loop, prev, B.entrance)) return null;
    B.loopCenter = loopCenterOf(loop);
    const branchable = loop.slice();
    const toBranch = B.multi.concat(B.single);
    weightRooms(branchable);
    if (!createBranches(B, rooms, branchable, toBranch, B.branchTunnels)) return null;
    extraConnections(B, rooms);
    return rooms;
  }
  function buildFigureEight(B, rooms) {
    setupRooms(B, rooms);
    let landmark = null;
    for (const r of B.mainPath) {
      if (r.maxConnections(ALL) >= 4 && (!landmark || landmark.minWidth() * landmark.minHeight() < r.minWidth() * r.minHeight())) landmark = r;
    }
    if (B.multi.length) B.mainPath.push(B.multi.shift());
    if (!landmark) return null;
    B.mainPath.splice(B.mainPath.indexOf(landmark), 1);
    { const k = B.multi.indexOf(landmark); if (k >= 0) B.multi.splice(k, 1); }
    let startAngle = R.Float(0, 360);
    let onFirst = Math.floor(B.mainPath.length / 2);
    if (B.mainPath.length % 2 === 1) onFirst += R.Int(2);
    const toLoop = B.mainPath.slice();
    const firstTemp = [landmark];
    for (let i = 0; i < onFirst; i++) firstTemp.push(toLoop.shift());
    firstTemp.splice(Math.floor((firstTemp.length + 1) / 2), 0, B.entrance);
    const pool = { c: B.pathTunnels.slice() };
    const first = [];
    for (const r of firstTemp) { first.push(r); const n = tunnelsFor(B, pool); for (let j = 0; j < n; j++) first.push(createConnectionRoom(B.depth)); }
    const secondTemp = [landmark].concat(toLoop);
    if (B.exit) secondTemp.splice(Math.floor((secondTemp.length + 1) / 2), 0, B.exit);
    const second = [];
    for (const r of secondTemp) { second.push(r); const n = tunnelsFor(B, pool); for (let j = 0; j < n; j++) second.push(createConnectionRoom(B.depth)); }
    landmark.setSize(); landmark.setPos(0, 0);
    let prev = landmark;
    for (let i = 1; i < first.length; i++) {
      const r = first[i];
      if (placeRoom(rooms, prev, r, startAngle + targetAngle(B, i / first.length)) === -1) return null;
      prev = r; if (!rooms.includes(prev)) rooms.push(prev);
    }
    if (!closeLoop(B, rooms, first, prev, landmark)) return null;
    prev = landmark;
    startAngle += 180;
    for (let i = 1; i < second.length; i++) {
      const r = second[i];
      if (placeRoom(rooms, prev, r, startAngle + targetAngle(B, i / second.length)) === -1) return null;
      prev = r; if (!rooms.includes(prev)) rooms.push(prev);
    }
    if (!closeLoop(B, rooms, second, prev, landmark)) return null;
    B.firstLoop = first; B.firstLoopCenter = loopCenterOf(first); B.secondLoopCenter = loopCenterOf(second);
    const branchable = first.concat(second);
    branchable.splice(branchable.indexOf(landmark), 1);
    weightRooms(branchable);
    if (!createBranches(B, rooms, branchable, B.multi.concat(B.single), B.branchTunnels)) return null;
    extraConnections(B, rooms);
    return rooms;
  }

  // ---- Connection rooms (SPD rooms/connection) --------------------------------
  class ConnectionRoom extends Room {
    constructor() { super(); this.kind = "connection"; }
    minWidth() { return 3; } maxWidth() { return 10; } minHeight() { return 3; } maxHeight() { return 10; }
    minConnections(dir) { return dir === ALL ? 2 : 0; }
  }
  // SPD TunnelRoom: an L from each door to a shared centre point.
  class TunnelRoom extends ConnectionRoom {
    connectionSpace() { const c = this.doorCenter(); return new Rect(c.x, c.y, c.x, c.y); }
    doorCenter() {
      let x = 0, y = 0;
      const ds = this.doors();
      for (const d of ds) { x += d.x; y += d.y; }
      const cx = x / ds.length, cy = y / ds.length;
      const c = { x: Math.floor(cx), y: Math.floor(cy) };
      if (R.Float() < cx % 1) c.x++;
      if (R.Float() < cy % 1) c.y++;
      c.x = gate(this.left + 1, c.x, this.right - 1);
      c.y = gate(this.top + 1, c.y, this.bottom - 1);
      return c;
    }
    paintTunnels(lv) {
      const floor = T.EMPTY;
      const c = this.connectionSpace();
      for (const door of this.doors()) {
        const start = { x: door.x, y: door.y };
        if (start.x === this.left) start.x++; else if (start.y === this.top) start.y++;
        else if (start.x === this.right) start.x--; else if (start.y === this.bottom) start.y--;
        const rs = start.x < c.left ? c.left - start.x : start.x > c.right ? c.right - start.x : 0;
        const ds = start.y < c.top ? c.top - start.y : start.y > c.bottom ? c.bottom - start.y : 0;
        let mid, end;
        if (door.x === this.left || door.x === this.right) { mid = { x: start.x + rs, y: start.y }; end = { x: mid.x, y: mid.y + ds }; }
        else { mid = { x: start.x, y: start.y + ds }; end = { x: mid.x + rs, y: mid.y }; }
        drawLine(lv, start, mid, floor);
        drawLine(lv, mid, end, floor);
      }
      for (const d of this.doors()) d.set(DOOR.TUNNEL);
    }
    paint(lv) { this.paintTunnels(lv); }
  }
  // SPD BridgeRoom / WalkwayRoom / RingBridgeRoom: the same routes across a chasm.
  function chasmBetweenBridges(lv, room) {
    for (const r of room.neighbours) {
      if (r instanceof BridgeRoom || r instanceof RingBridgeRoom || r instanceof WalkwayRoom) {
        const i = room.intersect(r);
        if (i.width() !== 0) { i.left++; i.right--; } else { i.top++; i.bottom--; }
        fill(lv, i.left, i.top, i.width() + 1, i.height() + 1, T.CHASM);
      }
    }
  }
  class BridgeRoom extends TunnelRoom {
    paint(lv) { if (Math.min(this.width(), this.height()) > 3) fillRoom(lv, this, 1, T.CHASM); this.paintTunnels(lv); chasmBetweenBridges(lv, this); }
    canMerge(lv, o, p, t) { return t === T.CHASM; }
  }
  class RingTunnelRoom extends TunnelRoom {
    minWidth() { return Math.max(5, super.minWidth()); }
    minHeight() { return Math.max(5, super.minHeight()); }
    connectionSpace() {
      if (!this._cs) {
        const c = this.doorCenter();
        c.x = gate(this.left + 2, c.x, this.right - 2); c.y = gate(this.top + 2, c.y, this.bottom - 2);
        this._cs = new Rect(c.x - 1, c.y - 1, c.x + 1, c.y + 1);
      }
      return this._cs;
    }
    paint(lv) {
      this.paintTunnels(lv);
      const ring = this.connectionSpace();
      fill(lv, ring.left, ring.top, 3, 3, T.EMPTY);
      fill(lv, ring.left + 1, ring.top + 1, 1, 1, T.WALL);
    }
  }
  class RingBridgeRoom extends RingTunnelRoom {
    paint(lv) { fillRoom(lv, this, 1, T.CHASM); super.paint(lv); chasmBetweenBridges(lv, this); }
    canMerge(lv, o, p, t) { return t === T.CHASM; }
  }
  // SPD PerimeterRoom: paths hugging the inside of the walls between the doors.
  class PerimeterRoom extends ConnectionRoom {
    paint(lv) { fillPerimeterPaths(lv, this, T.EMPTY); for (const d of this.doors()) d.set(DOOR.TUNNEL); }
  }
  class WalkwayRoom extends PerimeterRoom {
    paint(lv) { if (Math.min(this.width(), this.height()) > 3) fillRoom(lv, this, 1, T.CHASM); super.paint(lv); chasmBetweenBridges(lv, this); }
    canMerge(lv, o, p, t) { return t === T.CHASM; }
  }
  function fillPerimeterPaths(lv, r, floor) {
    const corners = [{ x: r.left + 1, y: r.top + 1 }, { x: r.right - 1, y: r.top + 1 }, { x: r.right - 1, y: r.bottom - 1 }, { x: r.left + 1, y: r.bottom - 1 }];
    const toFill = [];
    for (const d of r.doors()) {
      const p = { x: d.x, y: d.y };
      if (p.y === r.top) p.y++; else if (p.y === r.bottom) p.y--; else if (p.x === r.left) p.x++; else p.x--;
      toFill.push(p);
    }
    if (!toFill.length) return;
    const filled = [toFill.shift()];
    const space = (a, b) => Math.abs(a - b) - 1;
    const dist = (a, b) => {
      if (((a.x === r.left + 1 || a.x === r.right - 1) && a.y === b.y) || ((a.y === r.top + 1 || a.y === r.bottom - 1) && a.x === b.x)) {
        return Math.max(space(a.x, b.x), space(a.y, b.y));
      }
      return Math.min(space(r.left, a.x) + space(r.left, b.x), space(r.right, a.x) + space(r.right, b.x))
        + Math.min(space(r.top, a.y) + space(r.top, b.y), space(r.bottom, a.y) + space(r.bottom, b.y)) - 1;
    };
    const between = (from, to, depthGuard) => {
      if (depthGuard > 6) { drawLine(lv, from, to, floor); return; }
      if (((from.x === r.left + 1 || from.x === r.right - 1) && from.x === to.x) || ((from.y === r.top + 1 || from.y === r.bottom - 1) && from.y === to.y)) {
        fill(lv, Math.min(from.x, to.x), Math.min(from.y, to.y), space(from.x, to.x) + 2, space(from.y, to.y) + 2, floor);
        return;
      }
      for (const c of corners) {
        if ((c.x === from.x || c.y === from.y) && (c.x === to.x || c.y === to.y)) { drawLine(lv, from, c, floor); drawLine(lv, c, to, floor); return; }
      }
      let side;
      if (from.y === r.top + 1 || from.y === r.bottom - 1) {
        side = space(r.left, from.x) + space(r.left, to.x) <= space(r.right, from.x) + space(r.right, to.x)
          ? { x: r.left + 1, y: r.top + Math.floor(r.height() / 2) } : { x: r.right - 1, y: r.top + Math.floor(r.height() / 2) };
      } else {
        side = space(r.top, from.y) + space(r.top, to.y) <= space(r.bottom, from.y) + space(r.bottom, to.y)
          ? { x: r.left + Math.floor(r.width() / 2), y: r.top + 1 } : { x: r.left + Math.floor(r.width() / 2), y: r.bottom - 1 };
      }
      between(from, side, depthGuard + 1);
      between(side, to, depthGuard + 1);
    };
    while (toFill.length) {
      let best = Infinity, from = null, to = null;
      for (const f of filled) for (const t of toFill) { const d = dist(f, t); if (d < best) { best = d; from = f; to = t; } }
      between(from, to, 0);
      filled.push(to);
      toFill.splice(toFill.indexOf(to), 1);
    }
  }
  const CONNECTIONS = [TunnelRoom, BridgeRoom, PerimeterRoom, WalkwayRoom, RingTunnelRoom, RingBridgeRoom];
  // SPD ConnectionRoom.chances, by region (1 sewers … 5 halls). Boss floors never
  // reach here, so each region's first row is the one that matters.
  const CONN_CHANCES = [
    [20, 1, 0, 2, 2, 1],
    [0, 0, 22, 3, 0, 0],
    [12, 0, 0, 5, 5, 3],
    [0, 0, 18, 3, 3, 1],
    [15, 4, 0, 2, 3, 2],
  ];
  let connChances = CONN_CHANCES[0];
  function createConnectionRoom() { return new CONNECTIONS[R.chances(connChances)](); }

  // ---- Standard rooms (SPD rooms/standard) --------------------------------------
  const SIZE = [{ min: 4, max: 10, value: 1 }, { min: 10, max: 14, value: 2 }, { min: 14, max: 18, value: 3 }];
  class StandardRoom extends Room {
    constructor() { super(); this.kind = "standard"; this.setSizeCat(0, 2); }
    sizeCatProbs() { return [1, 0, 0]; }
    setSizeCat(minO, maxO) {
      const p = this.sizeCatProbs().slice();
      for (let i = 0; i < minO; i++) p[i] = 0;
      for (let i = maxO + 1; i < p.length; i++) p[i] = 0;
      const o = R.chances(p);
      if (o === -1) return false;
      this.sizeCat = o;
      return true;
    }
    minWidth() { return SIZE[this.sizeCat].min; } maxWidth() { return SIZE[this.sizeCat].max; }
    minHeight() { return SIZE[this.sizeCat].min; } maxHeight() { return SIZE[this.sizeCat].max; }
    sizeFactor() { return SIZE[this.sizeCat].value; }
    connectionWeight() { return this.sizeFactor() * this.sizeFactor(); }
    canMerge(lv, other, p) { const q = this.pointInside(p, 1); return !SOLID.has(getT(lv, q.x, q.y)) && getT(lv, q.x, q.y) !== T.CHASM; }
    base(lv, t) { fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, t === undefined ? T.EMPTY : t); for (const d of this.doors()) d.set(DOOR.REGULAR); }
    paint(lv) { this.base(lv); }
  }
  class EmptyRoom extends StandardRoom {}                                   // SPD EmptyRoom
  // SPD EntranceRoom / ExitRoom: a plain room, stairs two tiles in from a wall.
  class EntranceRoom extends StandardRoom {
    minWidth() { return Math.max(super.minWidth(), 5); } minHeight() { return Math.max(super.minHeight(), 5); }
    isEntrance() { return true; }
    paint(lv) { this.base(lv); const p = this.random(2); setT(lv, p.x, p.y, T.ENTRANCE); lv.entrance = p; }
  }
  class ExitRoom extends StandardRoom {
    minWidth() { return Math.max(super.minWidth(), 5); } minHeight() { return Math.max(super.minHeight(), 5); }
    isExit() { return true; }
    paint(lv) { this.base(lv); const p = this.random(2); setT(lv, p.x, p.y, T.EXIT); lv.exit = p; }
  }
  class PillarsRoom extends StandardRoom {                                  // SPD PillarsRoom
    minWidth() { return Math.max(super.minWidth(), 7); } minHeight() { return Math.max(super.minHeight(), 7); }
    sizeCatProbs() { return [9, 3, 1]; }
    paint(lv) {
      this.base(lv);
      const minDim = Math.min(this.width(), this.height());
      if (minDim === 7 || (this.sizeCat === 0 && R.Int(2) === 0)) {
        const inset = minDim >= 11 ? 2 : 1, size = Math.floor((minDim - 3) / 2) - inset;
        let px, py;
        if (R.Int(2) === 0) { px = R.IntRange(this.left + 1 + inset, this.right - size - inset); py = this.top + 1 + inset; }
        else { px = this.left + 1 + inset; py = R.IntRange(this.top + 1 + inset, this.bottom - size - inset); }
        fill(lv, px, py, size, size, T.WALL);
        px = this.right - (px - this.left + size - 1); py = this.bottom - (py - this.top + size - 1);
        fill(lv, px, py, size, size, T.WALL);
      } else {
        const inset = minDim >= 12 ? 2 : 1, size = Math.floor((minDim - 6) / (inset + 1));
        const xs = this.width() - 2 * inset - size - 2, ys = this.height() - 2 * inset - size - 2;
        const minS = Math.min(xs, ys), skew = minS > 0 ? Math.round(R.Float() * minS) / minS : 0;
        fill(lv, this.left + 1 + inset + Math.round(skew * xs), this.top + 1 + inset, size, size, T.WALL);
        fill(lv, this.right - size - inset, this.top + 1 + inset + Math.round(skew * ys), size, size, T.WALL);
        fill(lv, this.right - size - inset - Math.round(skew * xs), this.bottom - size - inset, size, size, T.WALL);
        fill(lv, this.left + 1 + inset, this.bottom - size - inset - Math.round(skew * ys), size, size, T.WALL);
      }
    }
  }
  class PlantsRoom extends StandardRoom {                                   // SPD PlantsRoom
    minWidth() { return Math.max(super.minWidth(), 5); } minHeight() { return Math.max(super.minHeight(), 5); }
    sizeCatProbs() { return [3, 1, 0]; }
    merge(lv, other, rect, t) { super.merge(lv, other, rect, t === T.EMPTY && (other instanceof PlantsRoom || other instanceof GrassyGraveRoom) ? T.GRASS : t); }
    paint(lv) {
      this.base(lv, T.GRASS);
      fillRoom(lv, this, 2, T.HIGH_GRASS);
      if (Math.min(this.width(), this.height()) >= 7) fillRoom(lv, this, 3, T.GRASS);
      const c = this.center();
      // SPD plants a random seed (never Firebloom) at each spot. `plant` is the
      // request; game.js picks the kind.
      const plant = (x, y) => lv.plants.push({ x, y, noFire: true });
      if (Math.max(this.width(), this.height()) >= 9) {
        if (Math.min(this.width(), this.height()) >= 11) {
          drawLine(lv, { x: this.left + 2, y: c.y }, { x: this.right - 2, y: c.y }, T.HIGH_GRASS);
          drawLine(lv, { x: c.x, y: this.top + 2 }, { x: c.x, y: this.bottom - 2 }, T.HIGH_GRASS);
          plant(c.x - 1, c.y - 1); plant(c.x + 1, c.y - 1); plant(c.x - 1, c.y + 1); plant(c.x + 1, c.y + 1);
        } else if (this.width() > this.height() || (this.width() === this.height() && R.Int(2) === 0)) {
          drawLine(lv, { x: c.x, y: this.top + 2 }, { x: c.x, y: this.bottom - 2 }, T.HIGH_GRASS);
          plant(c.x - 1, c.y); plant(c.x + 1, c.y);
        } else {
          drawLine(lv, { x: this.left + 2, y: c.y }, { x: this.right - 2, y: c.y }, T.HIGH_GRASS);
          plant(c.x, c.y - 1); plant(c.x, c.y + 1);
        }
      } else plant(c.x, c.y);
    }
  }
  class AquariumRoom extends StandardRoom {                                 // SPD AquariumRoom (no piranhas yet)
    minWidth() { return Math.max(super.minWidth(), 7); } minHeight() { return Math.max(super.minHeight(), 7); }
    sizeCatProbs() { return [3, 1, 0]; }
    paint(lv) { this.base(lv); fillRoom(lv, this, 2, T.EMPTY_SP); fillRoom(lv, this, 3, T.WATER); }
  }
  // SPD PatchRoom: a room whose interior is a Patch, optionally guaranteed to leave
  // every open tile reachable from every door.
  class PatchRoom extends StandardRoom {
    fillRate() { return 0.5; } clustering() { return 0; } ensurePath() { return false; } cleanEdges() { return false; }
    pc(x, y) { return (x - this.left - 1) + (y - this.top - 1) * (this.width() - 2); }
    setupPatch() {
      const pw = this.width() - 2, ph = this.height() - 2;
      if (this.ensurePath()) {
        let f = this.fillRate(), attempts = 0, valid = false, guard = 0;
        do {
          this.patch = patchGenerate(pw, ph, f, this.clustering(), true);
          let start = -1;
          for (const d of this.doors()) {
            let a, b;
            if (d.x === this.left) { a = this.pc(d.x + 1, d.y); b = this.pc(d.x + 2, d.y); }
            else if (d.x === this.right) { a = this.pc(d.x - 1, d.y); b = this.pc(d.x - 2, d.y); }
            else if (d.y === this.top) { a = this.pc(d.x, d.y + 1); b = this.pc(d.x, d.y + 2); }
            else { a = this.pc(d.x, d.y - 1); b = this.pc(d.x, d.y - 2); }
            start = a; this.patch[a] = false; if (b >= 0 && b < this.patch.length) this.patch[b] = false;
          }
          valid = start < 0 || patchConnected(this.patch, pw, ph, start);
          if (++attempts > 100) { f -= 0.01; attempts = 0; }
        } while (!valid && guard++ < 2000);
        if (!valid) this.patch = new Array(pw * ph).fill(false);
      } else this.patch = patchGenerate(pw, ph, this.fillRate(), this.clustering(), true);
      if (this.cleanEdges()) {
        const p = this.patch;
        for (let i = 0; i < p.length - pw; i++) {
          if (!p[i]) continue;
          if (i % pw !== 0 && p[i - 1 + pw] && !(p[i - 1] || p[i + pw])) p[i - 1 + pw] = false;
          if ((i + 1) % pw !== 0 && p[i + 1 + pw] && !(p[i + 1] || p[i + pw])) p[i + 1 + pw] = false;
        }
      }
    }
    fillPatch(lv, t) {
      for (let y = this.top + 1; y < this.bottom; y++) for (let x = this.left + 1; x < this.right; x++) if (this.patch[this.pc(x, y)]) setT(lv, x, y, t);
    }
    inPatch(p) { return this.patch && this.inside(p) && this.patch[this.pc(p.x, p.y)]; }
  }
  // 4-way flood over the NON-patch cells; true when every open cell is reached.
  // (SPD's PathFinder here is 8-way; 4-way is stricter, which is what we want with
  // no corner-cutting.)
  function patchConnected(patch, w, h, start) {
    if (patch[start]) return false;
    const seen = new Uint8Array(w * h), q = [start];
    seen[start] = 1;
    while (q.length) {
      const c = q.pop(), x = c % w, y = (c - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = nx + ny * w;
        if (!patch[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    for (let i = 0; i < patch.length; i++) if (!patch[i] && !seen[i]) return false;
    return true;
  }
  class CircleBasinRoom extends PatchRoom {                                 // SPD CircleBasinRoom
    minWidth() { return SIZE[this.sizeCat].min + 1; } minHeight() { return SIZE[this.sizeCat].min + 1; }
    sizeCatProbs() { return [0, 3, 1]; }
    resize(w, h) { super.resize(w, h); if (this.width() % 2 === 0) this.right--; if (this.height() % 2 === 0) this.bottom--; return this; }
    fillRate() { return 0.5; } clustering() { return 5; }
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL);
      fillEllipse(lv, this, 1, T.EMPTY);
      for (const d of this.doors()) {
        d.set(DOOR.REGULAR);
        drawInside(lv, this, d, d.x === this.left || d.x === this.right ? Math.floor(this.width() / 2) : Math.floor(this.height() / 2), T.EMPTY);
      }
      fillEllipse(lv, this, 3, T.CHASM);
      const mx = this.left + Math.floor(this.width() / 2), my = this.top + Math.floor(this.height() / 2);
      drawLine(lv, { x: mx, y: this.top + 3 }, { x: mx, y: this.bottom - 3 }, T.EMPTY_SP);
      drawLine(lv, { x: this.left + 3, y: my }, { x: this.right - 3, y: my }, T.EMPTY_SP);
      if (this.width() > 11 || this.height() > 11) { const c = this.center(); fill(lv, c.x - 1, c.y - 1, 3, 3, T.EMPTY_SP); setT(lv, c.x, c.y, T.WALL); }
      this.setupPatch();
      for (let y = this.top + 1; y < this.bottom; y++) for (let x = this.left + 1; x < this.right; x++) {
        if (getT(lv, x, y) === T.EMPTY && this.patch[this.pc(x, y)]) setT(lv, x, y, T.SHALLOW);
      }
    }
  }
  class RingRoom extends StandardRoom {                                     // SPD RingRoom
    minWidth() { return Math.max(super.minWidth(), 7); } minHeight() { return Math.max(super.minHeight(), 7); }
    sizeCatProbs() { return [9, 3, 1]; }
    paint(lv) {
      this.base(lv);
      const minDim = Math.min(this.width(), this.height());
      const pw = Math.floor(0.2 * (minDim + 3));
      fillRoom(lv, this, pw + 1, T.WALL);
      if (minDim >= 10) {
        fillRoom(lv, this, pw + 2, T.DECO);
        const c = this.center();
        let xd = 0, yd = 0;
        const mx = (this.left + this.right) / 2, my = (this.top + this.bottom) / 2;
        if (R.Int(2) === 0) xd = c.x < mx ? 1 : c.x > mx ? -1 : (R.Int(2) === 0 ? 1 : -1);
        else yd = c.y < my ? 1 : c.y > my ? -1 : (R.Int(2) === 0 ? 1 : -1);
        setT(lv, c.x, c.y, T.PEDESTAL);
        lv.drops.push({ x: c.x, y: c.y, kind: "prize" });
        let x = c.x + xd, y = c.y + yd, guard = 0;
        while (getT(lv, x, y) !== T.WALL && guard++ < 20) { setT(lv, x, y, T.EMPTY_SP); x += xd; y += yd; }
        setT(lv, x, y, T.DOOR);
      }
    }
  }
  class StripedRoom extends StandardRoom {                                  // SPD StripedRoom
    sizeCatProbs() { return [2, 1, 0]; }
    merge(lv, other, rect, t) { super.merge(lv, other, rect, other instanceof StripedRoom && t === T.EMPTY ? T.EMPTY_SP : t); }
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL);
      for (const d of this.doors()) d.set(DOOR.REGULAR);
      if (this.sizeCat === 0) {
        fillRoom(lv, this, 1, T.EMPTY_SP);
        if (this.width() > this.height() || (this.width() === this.height() && R.Int(2) === 0)) {
          for (let i = this.left + 2; i < this.right; i += 2) fill(lv, i, this.top + 1, 1, this.height() - 2, T.HIGH_GRASS);
        } else for (let i = this.top + 2; i < this.bottom; i += 2) fill(lv, this.left + 1, i, this.width() - 2, 1, T.HIGH_GRASS);
      } else {
        const layers = Math.floor((Math.min(this.width(), this.height()) - 1) / 2);
        for (let i = 1; i <= layers; i++) fillRoom(lv, this, i, i % 2 === 1 ? T.EMPTY_SP : T.HIGH_GRASS);
      }
    }
  }
  class StudyRoom extends StandardRoom {                                    // SPD StudyRoom
    minWidth() { return Math.max(super.minWidth(), 7); } minHeight() { return Math.max(super.minHeight(), 7); }
    sizeCatProbs() { return [2, 1, 0]; }
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL);
      fillRoom(lv, this, 1, T.BOOKSHELF);
      fillRoom(lv, this, 2, T.EMPTY_SP);
      for (const d of this.doors()) { drawInside(lv, this, d, 2, T.EMPTY_SP); d.set(DOOR.REGULAR); }
      if (this.sizeCat === 1) {
        const pw = Math.floor((this.width() - 7) / 2), ph = Math.floor((this.height() - 7) / 2);
        const L = this.left, Tp = this.top, Rt = this.right, B = this.bottom;
        fill(lv, L + 3, Tp + 3, pw, 1, T.BOOKSHELF); fill(lv, L + 3, Tp + 3, 1, ph, T.BOOKSHELF);
        fill(lv, L + 3, B - 3, pw, 1, T.BOOKSHELF); fill(lv, L + 3, B - 2 - ph, 1, ph, T.BOOKSHELF);
        fill(lv, Rt - 2 - pw, Tp + 3, pw, 1, T.BOOKSHELF); fill(lv, Rt - 3, Tp + 3, 1, ph, T.BOOKSHELF);
        fill(lv, Rt - 2 - pw, B - 3, pw, 1, T.BOOKSHELF); fill(lv, Rt - 3, B - 2 - ph, 1, ph, T.BOOKSHELF);
      }
      const c = this.center();
      setT(lv, c.x, c.y, T.PEDESTAL);
      lv.drops.push({ x: c.x, y: c.y, kind: R.Int(2) === 0 ? "prize" : "potionOrScroll" });
    }
  }
  class StatuesRoom extends StandardRoom {                                  // SPD StatuesRoom
    minWidth() { return Math.max(7, super.minWidth()); } minHeight() { return Math.max(7, super.minHeight()); }
    sizeCatProbs() { return [9, 3, 1]; }
    paint(lv) {
      this.base(lv);
      const rows = Math.floor((this.width() + 1) / 6), cols = Math.floor((this.height() + 1) / 6);
      const w = Math.floor((this.width() - 4 - (rows - 1)) / rows), h = Math.floor((this.height() - 4 - (cols - 1)) / cols);
      const ws = rows % 2 === this.width() % 2 ? 2 : 1, hs = cols % 2 === this.height() % 2 ? 2 : 1;
      for (let x = 0; x < rows; x++) for (let y = 0; y < cols; y++) {
        const l = this.left + 2 + x * (w + ws), t = this.top + 2 + y * (h + hs);
        fill(lv, l, t, w, h, T.EMPTY_SP);
        setT(lv, l, t, T.STATUE); setT(lv, l + w - 1, t, T.STATUE); setT(lv, l, t + h - 1, T.STATUE); setT(lv, l + w - 1, t + h - 1, T.STATUE);
        if (w >= 5 && h >= 5) setT(lv, l + Math.floor(w / 2), t + Math.floor(h / 2), T.DECO);
      }
    }
  }
  class StatueLineRoom extends StandardRoom {                               // SPD StatueLineRoom
    minWidth() { return Math.max(5, super.minWidth()); } minHeight() { return Math.max(5, super.minHeight()); }
    paint(lv) {
      this.base(lv);
      const pref = [1, 1, 1, 1];   // N E S W
      for (const d of this.doors()) {
        if (d.y === this.top) pref[0] -= 2; if (d.y === this.top + 1) pref[0] -= 1;
        if (d.y === this.bottom) pref[2] -= 2; if (d.y === this.bottom - 1) pref[2] -= 1;
        if (d.x === this.left) pref[3] -= 2; if (d.x === this.left + 1) pref[3] -= 1;
        if (d.x === this.right) pref[1] -= 2; if (d.x === this.right - 1) pref[1] -= 1;
      }
      let side = R.chances(pref.map((v) => Math.max(0, v))), guard = 0;
      while (side === -1 && guard++ < 10) { for (let i = 0; i < 4; i++) pref[i]++; side = R.chances(pref.map((v) => Math.max(0, v))); }
      const L = this.left, Tp = this.top, Rt = this.right, B = this.bottom;
      if (side === 0) drawLine(lv, { x: L + 1, y: Tp + 1 }, { x: Rt - 1, y: Tp + 1 }, T.STATUE);
      else if (side === 1) drawLine(lv, { x: Rt - 1, y: Tp + 1 }, { x: Rt - 1, y: B - 1 }, T.STATUE);
      else if (side === 2) drawLine(lv, { x: L + 1, y: B - 1 }, { x: Rt - 1, y: B - 1 }, T.STATUE);
      else drawLine(lv, { x: L + 1, y: Tp + 1 }, { x: L + 1, y: B - 1 }, T.STATUE);
      for (const d of this.doors()) drawInside(lv, this, d, 1, T.EMPTY);
    }
  }
  class GrassyGraveRoom extends StandardRoom {                              // SPD GrassyGraveRoom
    merge(lv, other, rect, t) { super.merge(lv, other, rect, t === T.EMPTY && (other instanceof GrassyGraveRoom || other instanceof PlantsRoom) ? T.GRASS : t); }
    paint(lv) {
      this.base(lv, T.GRASS);
      const w = this.width() - 2, h = this.height() - 2;
      const n = Math.floor(Math.max(w, h) / 2), index = R.Int(n), shift = R.Int(2);
      for (let i = 0; i < n; i++) {
        const p = w > h ? { x: this.left + 1 + shift + i * 2, y: this.top + 2 + R.Int(Math.max(1, h - 2)) }
                        : { x: this.left + 2 + R.Int(Math.max(1, w - 2)), y: this.top + 1 + shift + i * 2 };
        if (this.inside(p)) lv.drops.push({ x: p.x, y: p.y, kind: i === index ? "random" : "gold", tomb: true });
      }
    }
  }
  class BurnedRoom extends PatchRoom {                                      // SPD BurnedRoom
    sizeCatProbs() { return [4, 1, 0]; }
    canMerge(lv, other, p) { const q = this.pointInside(p, 1); return getT(lv, q.x, q.y) === T.EMPTY; }
    fillRate() { return Math.min(1, 1.48 - (this.width() + this.height()) * 0.03); } clustering() { return 2; }
    paint(lv) {
      this.base(lv);
      this.setupPatch();
      for (let y = this.top + 1; y < this.bottom; y++) for (let x = this.left + 1; x < this.right; x++) {
        if (!this.patch[this.pc(x, y)]) continue;
        const r = R.Int(5);
        if (r === 1) setT(lv, x, y, T.EMBERS);
        else if (r === 2 || r === 3) { setT(lv, x, y, T.EMBERS); lv.traps.push({ x, y, kind: "fire", hidden: r === 3 }); }
      }
    }
    canPlaceWater(p) { return !this.inPatch(p); }
    canPlaceGrass(p) { return !this.inPatch(p); }
  }
  class ChasmRoom extends PatchRoom {                                       // SPD ChasmRoom
    sizeCatProbs() { return [4, 2, 1]; }
    minWidth() { return Math.max(5, super.minWidth()); } minHeight() { return Math.max(5, super.minHeight()); }
    fillRate() { return 0.30 + Math.min(this.width() * this.height(), 324) / 1024; } clustering() { return 1; }
    ensurePath() { return this.connected.size > 0; } cleanEdges() { return true; }
    paint(lv) { this.base(lv); this.setupPatch(); this.fillPatch(lv, T.CHASM); }
  }
  class FissureRoom extends StandardRoom {                                  // SPD FissureRoom
    sizeCatProbs() { return [6, 3, 1]; }
    minWidth() { return Math.max(5, super.minWidth()); } minHeight() { return Math.max(5, super.minHeight()); }
    paint(lv) {
      this.base(lv);
      if (this.width() * this.height() <= 25) { const c = this.center(); setT(lv, c.x, c.y, T.CHASM); return; }
      const smallest = Math.min(this.width(), this.height());
      const floorW = Math.floor(Math.sqrt(smallest));
      let edge = Math.sqrt(smallest) % 1;
      edge = (edge + (floorW - 1) * 0.5) / floorW;
      for (let i = this.top + 2; i <= this.bottom - 2; i++) for (let j = this.left + 2; j <= this.right - 2; j++) {
        const v = Math.min(i - this.top, this.bottom - i), h = Math.min(j - this.left, this.right - j);
        if (Math.min(v, h) > floorW || (Math.min(v, h) === floorW && R.Float() > edge)) setT(lv, j, i, T.CHASM);
      }
    }
  }
  class CaveRoom extends PatchRoom {                                        // SPD CaveRoom
    sizeCatProbs() { return [4, 2, 1]; }
    minWidth() { return Math.max(5, super.minWidth()); } minHeight() { return Math.max(5, super.minHeight()); }
    fillRate() { return 0.30 + Math.min(this.width() * this.height(), 324) / 1024; } clustering() { return 3; }
    ensurePath() { return this.connected.size > 0; } cleanEdges() { return true; }
    paint(lv) { this.base(lv); this.setupPatch(); this.fillPatch(lv, T.WALL); }
  }
  class RuinsRoom extends PatchRoom {                                       // SPD RuinsRoom
    sizeCatProbs() { return [4, 2, 1]; }
    canMerge() { return true; }
    fillRate() { return 0.30 + Math.min(this.width() * this.height(), 324) / 1024; } clustering() { return 0; }
    ensurePath() { return this.connected.size > 0; } cleanEdges() { return true; }
    paint(lv) {
      this.base(lv);
      this.setupPatch();
      for (let i = this.top + 1; i < this.bottom; i++) for (let j = this.left + 1; j < this.right; j++) {
        if (!this.patch[this.pc(j, i)]) continue;
        let wall = true;
        if (i > this.top + 1 && i < this.bottom - 1 && j > this.left + 1 && j < this.right - 1) {
          let adj = 0;
          if (this.patch[this.pc(j - 1, i)]) adj++; if (this.patch[this.pc(j + 1, i)]) adj++;
          if (this.patch[this.pc(j, i - 1)]) adj++; if (this.patch[this.pc(j, i + 1)]) adj++;
          wall = R.Int(2) < adj;
        }
        setT(lv, j, i, wall ? T.WALL : T.DECO);
      }
    }
  }
  class CellBlockRoom extends StandardRoom {                                // SPD CellBlockRoom
    sizeCatProbs() { return [0, 3, 1]; }
    paint(lv) {
      this.base(lv);
      fillRoom(lv, this, 3, T.WALL);
      const inn = new Rect(this.left + 3, this.top + 3, this.right - 3, this.bottom - 3);
      const iw = inn.width() + 1, ih = inn.height() + 1;   // an EmptyRoom's width(): tile count
      let rows = Math.floor((iw - 1) / 3), cols = Math.floor((ih - 1) / 3);
      if (ih === 11) cols--; if (iw === 11) rows--;
      if (rows < 1 || cols < 1) return;
      const w = Math.floor((iw - 2 - (rows - 1)) / rows), h = Math.floor((ih - 2 - (cols - 1)) / cols);
      const ws = rows * w + (rows + 1) === iw ? 1 : 2, hs = cols * h + (cols + 1) === ih ? 1 : 2;
      let tb = rows > cols || (rows === cols && R.Int(2) === 0);
      if (rows === 1 || cols === 1) tb = !tb;
      if (rows === 1 && cols === 1) tb = null;
      for (let x = 0; x < rows; x++) for (let y = 0; y < cols; y++) {
        if (rows === 3 && cols === 3 && x === 1 && y === 1) continue;
        const l = inn.left + 1 + x * (w + ws), t = inn.top + 1 + y * (h + hs);
        fill(lv, l, t, w, h, T.EMPTY_SP);
        if (tb === null) {
          const k = R.Int(4);
          if (k === 0) setT(lv, inn.left, inn.top + Math.floor(ih / 2), T.DOOR);
          else if (k === 1) setT(lv, inn.left + Math.floor(iw / 2), inn.top, T.DOOR);
          else if (k === 2) setT(lv, inn.right, inn.top + Math.floor(ih / 2), T.DOOR);
          else setT(lv, inn.left + Math.floor(iw / 2), inn.bottom, T.DOOR);
        } else if (tb) {
          if (y === 0) setT(lv, l + Math.floor(w / 2), t - 1, T.DOOR);
          else if (y === cols - 1) setT(lv, l + Math.floor(w / 2) - 1, t + h, T.DOOR);
          else if (x === 0) setT(lv, l - 1, t + Math.floor(h / 2) - 1, T.DOOR);
          else if (x === rows - 1) setT(lv, l + w, t + Math.floor(h / 2), T.DOOR);
        } else {
          if (x === 0) setT(lv, l - 1, t + Math.floor(h / 2) - 1, T.DOOR);
          else if (x === rows - 1) setT(lv, l + w, t + Math.floor(h / 2), T.DOOR);
          else if (y === 0) setT(lv, l + Math.floor(w / 2), t - 1, T.DOOR);
          else if (y === cols - 1) setT(lv, l + Math.floor(w / 2) - 1, t + h, T.DOOR);
        }
      }
    }
  }
  class SegmentedRoom extends StandardRoom {                                // SPD SegmentedRoom
    minWidth() { return Math.max(super.minWidth(), 7); } minHeight() { return Math.max(super.minHeight(), 7); }
    sizeCatProbs() { return [9, 3, 1]; }
    paint(lv) {
      this.base(lv);
      for (const d of this.doors()) setT(lv, d.x, d.y, T.EMPTY);
      this.walls(lv, new Rect(this.left + 1, this.top + 1, this.right - 1, this.bottom - 1));
    }
    walls(lv, a) {
      if (Math.max(a.width() + 1, a.height() + 1) < 5 || Math.min(a.width() + 1, a.height() + 1) < 3) return;
      let tries = 10;
      if (a.width() > a.height() || (a.width() === a.height() && R.Int(2) === 0)) {
        do {
          const sx = R.IntRange(a.left + 2, a.right - 2);
          if (getT(lv, sx, a.top - 1) === T.WALL && getT(lv, sx, a.bottom + 1) === T.WALL) {
            tries = 0;
            drawLine(lv, { x: sx, y: a.top }, { x: sx, y: a.bottom }, T.WALL);
            const s = R.IntRange(a.top, a.bottom - 1);
            setT(lv, sx, s, T.EMPTY); setT(lv, sx, s + 1, T.EMPTY);
            this.walls(lv, new Rect(a.left, a.top, sx - 1, a.bottom));
            this.walls(lv, new Rect(sx + 1, a.top, a.right, a.bottom));
          }
        } while (--tries > 0);
      } else {
        do {
          const sy = R.IntRange(a.top + 2, a.bottom - 2);
          if (getT(lv, a.left - 1, sy) === T.WALL && getT(lv, a.right + 1, sy) === T.WALL) {
            tries = 0;
            drawLine(lv, { x: a.left, y: sy }, { x: a.right, y: sy }, T.WALL);
            const s = R.IntRange(a.left, a.right - 1);
            setT(lv, s, sy, T.EMPTY); setT(lv, s + 1, sy, T.EMPTY);
            this.walls(lv, new Rect(a.left, a.top, a.right, sy - 1));
            this.walls(lv, new Rect(a.left, sy + 1, a.right, a.bottom));
          }
        } while (--tries > 0);
      }
    }
  }
  class PlatformRoom extends StandardRoom {                                 // SPD PlatformRoom
    minWidth() { return Math.max(super.minWidth(), 6); } minHeight() { return Math.max(super.minHeight(), 6); }
    sizeCatProbs() { return [6, 3, 1]; }
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL);
      fillRoom(lv, this, 1, T.CHASM);
      const plats = [];
      this.split(new Rect(this.left + 2, this.top + 2, this.right - 2, this.bottom - 2), plats);
      for (const p of plats) fill(lv, p.left, p.top, p.width() + 1, p.height() + 1, T.EMPTY_SP);
      for (const d of this.doors()) { d.set(DOOR.REGULAR); drawInside(lv, this, d, 2, T.EMPTY_SP); }
    }
    split(cur, all) {
      const area = (cur.width() + 1) * (cur.height() + 1);
      if (R.Float() < (area - 25) / 11) {
        if (cur.width() > cur.height() || (cur.width() === cur.height() && R.Int(2) === 0)) {
          const sx = R.IntRange(cur.left + 2, cur.right - 2);
          this.split(new Rect(cur.left, cur.top, sx - 1, cur.bottom), all);
          this.split(new Rect(sx + 1, cur.top, cur.right, cur.bottom), all);
          const by = R.NormalIntRange(cur.top, cur.bottom);
          all.push(new Rect(sx - 1, by, sx + 1, by));
        } else {
          const sy = R.IntRange(cur.top + 2, cur.bottom - 2);
          this.split(new Rect(cur.left, cur.top, cur.right, sy - 1), all);
          this.split(new Rect(cur.left, sy + 1, cur.right, cur.bottom), all);
          const bx = R.NormalIntRange(cur.left, cur.right);
          all.push(new Rect(bx, sy - 1, bx, sy + 1));
        }
      } else all.push(cur);
    }
  }
  // SPD SkullsRoom / CirclePitRoom / CircleWallRoom: ellipses with a door-to-centre cross.
  function ellipseWithSpokes(lv, r) {
    fillRoom(lv, r, 0, T.WALL);
    fillEllipse(lv, r, 1, T.EMPTY);
    for (const d of r.doors()) {
      d.set(DOOR.REGULAR);
      drawInside(lv, r, d, d.x === r.left || d.x === r.right ? Math.floor(r.width() / 2) : Math.floor(r.height() / 2), T.EMPTY);
    }
  }
  class SkullsRoom extends StandardRoom {
    minWidth() { return Math.max(7, super.minWidth()); } minHeight() { return Math.max(7, super.minHeight()); }
    sizeCatProbs() { return [0, 3, 1]; }
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL);
      fillEllipse(lv, this, 2, T.EMPTY);
      for (const d of this.doors()) {
        d.set(DOOR.REGULAR);
        drawInside(lv, this, d, d.x === this.left || d.x === this.right ? Math.floor(this.width() / 2) : Math.floor(this.height() / 2), T.EMPTY);
      }
      fillEllipse(lv, this, 4, T.STATUE);
      fillEllipse(lv, this, 6, T.WALL);
    }
  }
  class CirclePitRoom extends StandardRoom {
    minWidth() { return Math.max(8, super.minWidth()); } minHeight() { return Math.max(8, super.minHeight()); }
    sizeCatProbs() { return [4, 2, 1]; }
    paint(lv) { ellipseWithSpokes(lv, this); fillEllipse(lv, this, 3, T.CHASM); }
  }
  class CircleWallRoom extends StandardRoom {
    sizeCatProbs() { return [0, 3, 1]; }
    paint(lv) { ellipseWithSpokes(lv, this); fillEllipse(lv, this, 3, T.WALL); }
  }
  // SPD StandardBridgeRoom → WaterBridgeRoom / ChasmBridgeRoom: a band of water or
  // chasm across the room, spanned by a bridge.
  class StandardBridgeRoom extends StandardRoom {
    minWidth() { return Math.max(5, super.minWidth()); } minHeight() { return Math.max(5, super.minHeight()); }
    canMerge(lv, other, p) { const q = this.pointInside(p, 1); return getT(lv, q.x, q.y) !== this.spaceTile(); }
    paint(lv) {
      this.base(lv);
      let xy = 0;
      for (const d of this.doors()) xy += d.x === this.left || d.x === this.right ? 1 : -1;
      xy += Math.trunc((this.width() - this.height()) / 2);
      let space, bridge;
      if (xy > 0 || (xy === 0 && R.Int(2) === 0)) {
        const pts = this.doors().filter((d) => d.y === this.top || d.y === this.bottom).map((d) => d.x);
        pts.push(this.left + 1, this.right - 1);
        pts.sort((a, b) => a - b);
        let s = -1, e = -1;
        for (let i = 0; i < pts.length - 1; i++) if (e - s < pts[i + 1] - pts[i]) { s = pts[i]; e = pts[i + 1]; }
        while (e - s > this.maxBridgeWidth(this.width()) + 1) { if (R.Int(2) === 0) s++; else e--; }
        space = new Rect(s + 1, this.top + 1, e, this.bottom);
        const by = R.NormalIntRange(space.top + 1, space.bottom - 2);
        bridge = new Rect(space.left, by, space.right, by + 1);
      } else {
        const pts = this.doors().filter((d) => d.x === this.left || d.x === this.right).map((d) => d.y);
        pts.push(this.top + 1, this.bottom - 1);
        pts.sort((a, b) => a - b);
        let s = -1, e = -1;
        for (let i = 0; i < pts.length - 1; i++) if (e - s < pts[i + 1] - pts[i]) { s = pts[i]; e = pts[i + 1]; }
        while (e - s > this.maxBridgeWidth(this.height()) + 1) { if (R.Int(2) === 0) s++; else e--; }
        space = new Rect(this.left + 1, s + 1, this.right, e);
        const bx = R.NormalIntRange(space.left + 1, space.right - 2);
        bridge = new Rect(bx, space.top, bx + 1, space.bottom);
      }
      fillRect(lv, space, this.spaceTile());
      fillRect(lv, bridge, T.EMPTY_SP);
    }
  }
  class WaterBridgeRoom extends StandardBridgeRoom {
    maxBridgeWidth(d) { return d >= 8 ? 3 : 2; } spaceTile() { return T.WATER; } canPlaceWater() { return false; }
  }
  class ChasmBridgeRoom extends StandardBridgeRoom {
    maxBridgeWidth(d) { return d >= 7 ? 2 : 1; } spaceTile() { return T.CHASM; }
  }
  class RitualRoom extends PatchRoom {                                      // SPD RitualRoom
    minWidth() { return Math.max(super.minWidth(), 9); } minHeight() { return Math.max(super.minHeight(), 9); }
    sizeCatProbs() { return [6, 3, 1]; }
    fillRate() { return 0.30 + Math.min(this.width() * this.height(), 324) / 1024; } clustering() { return 0; }
    ensurePath() { return this.connected.size > 0; } cleanEdges() { return true; }
    paint(lv) {
      this.base(lv);
      const c = this.center();
      this.setupPatch(); this.fillPatch(lv, T.DECO);
      fill(lv, c.x - 3, c.y - 3, 7, 7, T.EMPTY);
      for (const [dx, dy] of [[-2, -1], [-1, -2], [2, -1], [1, -2], [-2, 1], [-1, 2], [2, 1], [1, 2]]) setT(lv, c.x + dx, c.y + dy, T.STATUE);
      fill(lv, c.x - 1, c.y - 1, 3, 3, T.EMBERS);
      setT(lv, c.x, c.y, T.PEDESTAL);
      lv.drops.push({ x: c.x, y: c.y, kind: R.Int(2) === 0 ? "prize" : "potionOrScroll" });
    }
  }
  const STANDARD = {
    Empty: EmptyRoom, Pillars: PillarsRoom, Plants: PlantsRoom, Aquarium: AquariumRoom, CircleBasin: CircleBasinRoom,
    Ring: RingRoom, Striped: StripedRoom, Study: StudyRoom, Statues: StatuesRoom, StatueLine: StatueLineRoom,
    GrassyGrave: GrassyGraveRoom, Burned: BurnedRoom, Chasm: ChasmRoom, Fissure: FissureRoom, Cave: CaveRoom,
    Ruins: RuinsRoom, CellBlock: CellBlockRoom, Segmented: SegmentedRoom, Platform: PlatformRoom, Skulls: SkullsRoom,
    CirclePit: CirclePitRoom, CircleWall: CircleWallRoom, WaterBridge: WaterBridgeRoom, ChasmBridge: ChasmBridgeRoom,
    Ritual: RitualRoom,
  };

  // ---- Special rooms (SPD rooms/special) ----------------------------------------
  // One door, always. Every one here but Storage is behind a LOCKED door whose key
  // spawns elsewhere on the floor (lv.keys counts them; game.js places them).
  class SpecialRoom extends Room {
    constructor() { super(); this.kind = "special"; }
    minWidth() { return 5; } maxWidth() { return 10; } minHeight() { return 5; } maxHeight() { return 10; }
    maxConnections(dir) { return 1; }
    entranceDoor() { return this.doors()[0]; }
    lock(lv) { this.entranceDoor().set(DOOR.LOCKED); lv.keys++; }
    spot(lv, want) {
      for (let tries = 0; tries < 60; tries++) {
        const p = this.random();
        if (getT(lv, p.x, p.y) === want && !lv.drops.some((d) => d.x === p.x && d.y === p.y) && !lv.mobs.some((m) => m.x === p.x && m.y === p.y)) return p;
      }
      return null;
    }
    drop(lv, want, kind, extra) { const p = this.spot(lv, want); if (p) lv.drops.push(Object.assign({ x: p.x, y: p.y, kind, room: this.name }, extra || {})); }
    // The tile two in from the far wall, facing the door (Armory, Crypt, Statue use it).
    far() {
      const d = this.entranceDoor(), c = this.center();
      if (d.x === this.left) return { side: "E", c: { x: this.right - 2, y: c.y } };
      if (d.x === this.right) return { side: "W", c: { x: this.left + 2, y: c.y } };
      if (d.y === this.top) return { side: "S", c: { x: c.x, y: this.bottom - 2 } };
      return { side: "N", c: { x: c.x, y: this.top + 2 } };
    }
  }
  class GardenRoom extends SpecialRoom {                                    // SPD GardenRoom
    // SPD plants a Sungrass (or a Blandfruit bush, which needs food) in about a
    // third of gardens, sometimes two. Blandfruit becomes a second random plant.
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.HIGH_GRASS); fillRoom(lv, this, 2, T.GRASS); this.lock(lv);
      const spot = () => this.spot(lv, T.GRASS);
      const k = R.Int(3);
      const put = (kind) => { const p = spot(); if (p && !lv.plants.some((q) => q.x === p.x && q.y === p.y)) lv.plants.push({ x: p.x, y: p.y, kind }); };
      if (k === 0) put("sungrass");
      else if (k === 1) put(null);
      else if (R.Int(5) === 0) { put("sungrass"); put(null); }
      this.drop(lv, T.GRASS, "seed");
    }
  }
  class LibraryRoom extends SpecialRoom {                                   // SPD LibraryRoom
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.EMPTY_SP);
      fill(lv, this.left + 1, this.top + 1, this.width() - 2, 1, T.BOOKSHELF);
      drawInside(lv, this, this.entranceDoor(), 1, T.EMPTY_SP);
      const n = R.NormalIntRange(1, 3);
      for (let i = 0; i < n; i++) this.drop(lv, T.EMPTY_SP, i === 0 ? "scrollIdentify" : "scroll");
      this.lock(lv);
    }
  }
  class ArmoryRoom extends SpecialRoom {                                    // SPD ArmoryRoom
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.EMPTY);
      const d = this.entranceDoor(), flip = R.Int(2) === 0;
      let st;
      if (d.x === this.left) st = { x: this.right - 1, y: flip ? this.top + 1 : this.bottom - 1 };
      else if (d.x === this.right) st = { x: this.left + 1, y: flip ? this.top + 1 : this.bottom - 1 };
      else if (d.y === this.top) st = { x: flip ? this.left + 1 : this.right - 1, y: this.bottom - 1 };
      else st = { x: flip ? this.left + 1 : this.right - 1, y: this.top + 1 };
      setT(lv, st.x, st.y, T.STATUE);
      const cats = R.shuffle(["weapon", "armor", "weapon", "armor"]).slice(0, R.IntRange(2, 3));
      for (const k of cats) this.drop(lv, T.EMPTY, k);
      this.lock(lv);
    }
  }
  class TreasuryRoom extends SpecialRoom {                                  // SPD TreasuryRoom
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.EMPTY);
      const c = this.center(); setT(lv, c.x, c.y, T.STATUE);
      const n = R.IntRange(2, 3);
      for (let i = 0; i < n; i++) this.drop(lv, T.EMPTY, "goldBig");
      for (let i = 0; i < 6; i++) this.drop(lv, T.EMPTY, "gold");
      this.lock(lv);
    }
  }
  class StorageRoom extends SpecialRoom {                                   // SPD StorageRoom (locked, not barricaded, until fire lands)
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.EMPTY_SP);
      const n = R.IntRange(3, 4);
      for (let i = 0; i < n; i++) this.drop(lv, T.EMPTY_SP, R.Int(3) !== 0 ? "prize" : "consumable");
      this.lock(lv);
    }
  }
  class CryptRoom extends SpecialRoom {                                     // SPD CryptRoom
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.EMPTY);
      const f = this.far(), L = this.left, Tp = this.top, Rt = this.right, B = this.bottom;
      if (f.side === "E") { setT(lv, Rt - 1, Tp + 1, T.STATUE); setT(lv, Rt - 1, B - 1, T.STATUE); }
      else if (f.side === "W") { setT(lv, L + 1, Tp + 1, T.STATUE); setT(lv, L + 1, B - 1, T.STATUE); }
      else if (f.side === "S") { setT(lv, L + 1, B - 1, T.STATUE); setT(lv, Rt - 1, B - 1, T.STATUE); }
      else { setT(lv, L + 1, Tp + 1, T.STATUE); setT(lv, Rt - 1, Tp + 1, T.STATUE); }
      lv.drops.push({ x: f.c.x, y: f.c.y, kind: "armorGood", tomb: true, room: this.name });
      this.lock(lv);
    }
  }
  class StatueRoom extends SpecialRoom {                                    // SPD StatueRoom
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.EMPTY);
      const f = this.far(), L = this.left, Tp = this.top, Rt = this.right, B = this.bottom;
      if (f.side === "E") fill(lv, Rt - 1, Tp + 1, 1, this.height() - 2, T.STATUE);
      else if (f.side === "W") fill(lv, L + 1, Tp + 1, 1, this.height() - 2, T.STATUE);
      else if (f.side === "S") fill(lv, L + 1, B - 1, this.width() - 2, 1, T.STATUE);
      else fill(lv, L + 1, Tp + 1, this.width() - 2, 1, T.STATUE);
      lv.mobs.push({ x: f.c.x, y: f.c.y, kind: "statue", room: this.name });
      this.lock(lv);
    }
  }
  class MagicWellRoom extends SpecialRoom {                                 // SPD MagicWellRoom
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.EMPTY);
      const c = this.center(); setT(lv, c.x, c.y, T.WELL);
      (lv.wells = lv.wells || []).push({ x: c.x, y: c.y, water: R.Int(2) === 0 ? "health" : "awareness" });
      this.lock(lv);
    }
  }
  class RunestoneRoom extends SpecialRoom {                                 // SPD RunestoneRoom (runestones → consumables)
    minWidth() { return 6; } minHeight() { return 6; }
    paint(lv) {
      fillRoom(lv, this, 0, T.WALL); fillRoom(lv, this, 1, T.CHASM);
      drawInside(lv, this, this.entranceDoor(), 2, T.EMPTY_SP);
      fillRoom(lv, this, 2, T.EMPTY);
      const n = R.NormalIntRange(2, 3);
      for (let i = 0; i < n; i++) this.drop(lv, T.EMPTY, "consumable");
      this.lock(lv);
    }
  }
  const SPECIAL = { Garden: GardenRoom, Library: LibraryRoom, Armory: ArmoryRoom, Treasury: TreasuryRoom, Storage: StorageRoom,
    Crypt: CryptRoom, Statue: StatueRoom, MagicWell: MagicWellRoom, Runestone: RunestoneRoom };

  // ---- Painter (SPD RegularPainter.paint) ---------------------------------------
  function placeDoors(r) {
    for (const n of r.connected.keys()) {
      if (r.connected.get(n)) continue;
      const i = r.intersect(n);
      const spots = i.getPoints().filter((p) => r.canConnectPoint(p) && n.canConnectPoint(p));
      if (!spots.length) continue;
      const p = R.element(spots), d = new Door(p.x, p.y);
      r.connected.set(n, d); n.connected.set(r, d);
    }
  }
  // Room-graph reachability, walking only doors a player can pass freely. SPD's
  // Graph.buildDistanceMap over Room.edges().
  function graphReaches(rooms, from, to) {
    const ok = (d) => d && (d.type === DOOR.EMPTY || d.type === DOOR.TUNNEL || d.type === DOOR.UNLOCKED || d.type === DOOR.REGULAR);
    const seen = new Set([from]), q = [from];
    while (q.length) {
      const r = q.pop();
      if (r === to) return true;
      for (const [n, d] of r.connected) if (ok(d) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    return false;
  }
  function mergeRooms(lv, r, n, start) {
    if (!(r instanceof StandardRoom) || !(n instanceof StandardRoom)) return false;
    const i = r.intersect(n);
    if (i.left === i.right) {
      const m = new Rect(i.left, start ? start.y : i.center().y, i.left, start ? start.y : i.center().y);
      const p = { x: m.left, y: m.top };
      while (m.top > i.top && n.canMerge(lv, r, p, T.EMPTY) && r.canMerge(lv, n, p, T.EMPTY)) { m.top--; p.y--; }
      p.y = m.bottom;
      while (m.bottom < i.bottom && n.canMerge(lv, r, p, T.EMPTY) && r.canMerge(lv, n, p, T.EMPTY)) { m.bottom++; p.y++; }
      if (m.height() >= 3) { r.merge(lv, n, new Rect(m.left, m.top + 1, m.left + 1, m.bottom), T.EMPTY); return true; }
      return false;
    }
    if (i.top === i.bottom) {
      const m = new Rect(start ? start.x : i.center().x, i.top, start ? start.x : i.center().x, i.top);
      const p = { x: m.left, y: m.top };
      while (m.left > i.left && n.canMerge(lv, r, p, T.EMPTY) && r.canMerge(lv, n, p, T.EMPTY)) { m.left--; p.x--; }
      p.x = m.right;
      while (m.right < i.right && n.canMerge(lv, r, p, T.EMPTY) && r.canMerge(lv, n, p, T.EMPTY)) { m.right++; p.x++; }
      if (m.width() >= 3) { r.merge(lv, n, new Rect(m.left + 1, m.top, m.right, m.top + 1), T.EMPTY); return true; }
      return false;
    }
    return false;
  }
  function paintDoors(lv, rooms, depth) {
    const hiddenChance = depth > 1 ? Math.min(1, depth / 20) : 0;
    const merged = new Map();
    for (const r of rooms) {
      for (const [n, d] of r.connected) {
        if (!d) continue;
        if (merged.get(r) === n || merged.get(n) === r) continue;
        if (!merged.has(r) && !merged.has(n) && mergeRooms(lv, r, n, d)) {
          if (r.sizeCat === 0) merged.set(r, n);
          if (n.sizeCat === 0) merged.set(n, r);
          continue;
        }
        if (d.type === DOOR.REGULAR) {
          if (R.Float() < hiddenChance) {
            d.type = DOOR.HIDDEN;
            if (!graphReaches(rooms, r, n)) d.type = DOOR.UNLOCKED;
          } else d.type = DOOR.UNLOCKED;
        }
        const t = d.type === DOOR.EMPTY || d.type === DOOR.TUNNEL ? T.EMPTY
          : d.type === DOOR.WATER ? T.SHALLOW
          : d.type === DOOR.UNLOCKED ? T.DOOR
          : d.type === DOOR.HIDDEN ? T.SECRET_DOOR
          : d.type === DOOR.LOCKED || d.type === DOOR.BARRICADE || d.type === DOOR.CRYSTAL ? T.LOCKED_DOOR
          : T.WALL;
        setT(lv, d.x, d.y, t);
      }
    }
  }
  function paintPatches(lv, rooms, water, grass) {
    if (water.fill > 0) {
      const lake = patchGenerate(lv.w, lv.h, water.fill, water.smooth, true);
      for (const r of rooms) for (let x = r.left; x <= r.right; x++) for (let y = r.top; y <= r.bottom; y++) {
        const p = { x, y };
        if (lake[cell(lv, x, y)] && getT(lv, x, y) === T.EMPTY && r.canPlaceWater(p)) setT(lv, x, y, T.SHALLOW);
      }
    }
    if (grass.fill > 0) {
      const g = patchGenerate(lv.w, lv.h, grass.fill, grass.smooth, true);
      const cells = [];
      for (const r of rooms) for (let x = r.left; x <= r.right; x++) for (let y = r.top; y <= r.bottom; y++) {
        if (g[cell(lv, x, y)] && getT(lv, x, y) === T.EMPTY && r.canPlaceGrass({ x, y })) cells.push([x, y]);
      }
      for (const [x, y] of cells) {
        let count = 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && g[cell(lv, x + dx, y + dy)]) count++;
        setT(lv, x, y, R.Float() < count / 12 ? T.HIGH_GRASS : T.GRASS);
      }
    }
  }

  // ---- The floor: SPD RegularLevel.initRooms + build + paint --------------------
  const REGION_DEFAULTS = [
    // forest (SPD sewers' shapes, a greener table)
    { standard: [4, 6], special: [1, 2], water: [0.30, 5], grass: [0.30, 4],
      rooms: { Empty: 8, Ring: 8, WaterBridge: 8, Plants: 6, CircleBasin: 4, Aquarium: 1, Platform: 1, Burned: 1, Fissure: 1, GrassyGrave: 2, Striped: 1, Study: 1 } },
    // caves
    { standard: [6, 7], special: [2, 3], water: [0.30, 6], grass: [0.15, 3],
      rooms: { Cave: 16, CirclePit: 8, CircleWall: 8, Chasm: 4, Empty: 4, Plants: 1, Aquarium: 1, Platform: 1, Burned: 1, Fissure: 1, GrassyGrave: 1, Striped: 1, Study: 1 } },
    // crypt (SPD prison's shapes)
    { standard: [5, 6], special: [1, 3], water: [0.20, 4], grass: [0.10, 3],
      rooms: { Segmented: 10, Pillars: 10, ChasmBridge: 10, CellBlock: 5, StatueLine: 5, GrassyGrave: 2, Burned: 1, Fissure: 1, Study: 1, Platform: 1 } },
    // town (SPD city's shapes)
    { standard: [6, 8], special: [2, 3], water: [0.30, 4], grass: [0.20, 3],
      rooms: { Statues: 16, Study: 8, Pillars: 8, Segmented: 4, Ring: 4, Plants: 1, Aquarium: 1, Platform: 1, Burned: 1, Fissure: 1, GrassyGrave: 1, Striped: 1 } },
    // haunted lake (SPD halls' shapes)
    { standard: [7, 9], special: [2, 3], water: [0.35, 6], grass: [0.10, 3],
      rooms: { Ruins: 10, Chasm: 10, Skulls: 10, Ritual: 5, WaterBridge: 5, Aquarium: 2, Platform: 1, Burned: 1, Fissure: 1, CirclePit: 1 } },
  ];
  const DEFAULT_SPECIALS = ["Garden", "Library", "Armory", "Treasury", "Storage", "Crypt", "Statue", "MagicWell", "Runestone"];

  function pickWeighted(table) {
    const keys = Object.keys(table).filter((k) => STANDARD[k] && table[k] > 0);
    if (!keys.length) return EmptyRoom;
    return STANDARD[keys[R.chances(keys.map((k) => table[k]))]];
  }
  function initRooms(cfg) {
    const rooms = [new EntranceRoom(), new ExitRoom()];
    const standards = R.IntRange(cfg.standard[0], cfg.standard[1]);
    for (let i = 0; i < standards; i++) {
      let s, guard = 0;
      do { s = new (pickWeighted(cfg.rooms))(); } while (!s.setSizeCat(0, Math.max(0, standards - i - 1)) && guard++ < 50);
      i += s.sizeFactor() - 1;
      s.name = Object.keys(STANDARD).find((k) => s instanceof STANDARD[k] && STANDARD[k] === s.constructor) || "Empty";
      rooms.push(s);
    }
    const nSpecial = R.IntRange(cfg.special[0], cfg.special[1]);
    const pool = R.shuffle((cfg.specials || DEFAULT_SPECIALS).filter((k) => SPECIAL[k]));
    for (let i = 0; i < nSpecial && i < pool.length; i++) { const s = new SPECIAL[pool[i]](); s.name = pool[i]; rooms.push(s); }
    return rooms;
  }

  function generate(opts) {
    rnd = opts.rand || Math.random;
    const region = Math.max(0, Math.min(4, opts.region | 0));
    const base = REGION_DEFAULTS[region];
    const cfg = {
      standard: opts.standard || base.standard, special: opts.special || base.special,
      rooms: opts.rooms || base.rooms, specials: opts.specials,
      water: opts.water || base.water, grass: opts.grass || base.grass,
    };
    connChances = opts.conn || CONN_CHANCES[region];
    const maxW = opts.maxW || 47, maxH = opts.maxH || 47;
    let attempt = 0;
    while (attempt++ < 60) {
      // After enough oversized floors, shed a room at a time rather than loop.
      const shrink = Math.floor(attempt / 15);
      const c = Object.assign({}, cfg, { standard: [Math.max(3, cfg.standard[0] - shrink), Math.max(3, cfg.standard[1] - shrink)] });
      const init = initRooms(c);
      R.shuffle(init);
      let rooms = null, tries = 0;
      while (!rooms && tries++ < 40) {
        for (const r of init) { r.neighbours = []; r.connected = new Map(); }
        const B = makeBuilder(R.Int(2) === 0 ? "loop" : "figure8", opts.depth || 1);
        rooms = (B.kind === "loop" ? buildLoop : buildFigureEight)(B, init.slice());
      }
      if (!rooms) continue;
      if (rooms.some((r) => r.connected.size === 0)) continue;
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
      for (const r of rooms) { l = Math.min(l, r.left); t = Math.min(t, r.top); rr = Math.max(rr, r.right); bb = Math.max(bb, r.bottom); }
      const w = rr - l + 1 + 2, h = bb - t + 1 + 2;   // one tile of padding each side, as SPD's painter
      if (w > maxW || h > maxH) continue;
      for (const r of rooms) r.shift(-l + 1, -t + 1);
      const lv = makeLevel(w, h);
      R.shuffle(rooms);
      for (const r of rooms) { placeDoors(r); r.paint(lv); }
      paintDoors(lv, rooms, opts.depth || 1);
      paintPatches(lv, rooms, { fill: cfg.water[0], smooth: cfg.water[1] }, { fill: cfg.grass[0], smooth: cfg.grass[1] });
      if (!lv.entrance || !lv.exit) continue;
      lv.rooms = rooms.map((r) => ({
        kind: r.kind, name: r.name || (r.isEntrance() ? "Entrance" : r.isExit() ? "Exit" : r.constructor.name.replace(/Room$/, "")),
        left: r.left, top: r.top, right: r.right, bottom: r.bottom,
        entrance: r.isEntrance(), exit: r.isExit(),
        locked: r.kind === "special" && r.doors().some((d) => d.type === DOOR.LOCKED),
        doors: r.doors().map((d) => ({ x: d.x, y: d.y, type: d.type })),
      }));
      lv.attempts = attempt;
      return lv;
    }
    return null;
  }

  const api = { T, SOLID, DOOR, R, Rect, Room, Door, ConnectionRoom, TunnelRoom, STANDARD, SPECIAL, REGION_DEFAULTS, DEFAULT_SPECIALS,
    makeLevel, setT, getT, fill, fillRoom, fillRect, drawLine, fillEllipse, drawInside, patchGenerate,
    makeBuilder, buildLoop, buildFigureEight, CONN_CHANCES, generate,
    _setRand(f) { rnd = f || Math.random; }, _setConn(c) { connChances = c; }, ALL, LEFT, TOP, RIGHT, BOTTOM };
  (typeof window !== "undefined" ? window : globalThis).CantoriSPD = api;
})();

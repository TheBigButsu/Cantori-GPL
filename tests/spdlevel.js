#!/usr/bin/env node
/* Headless stress test for spdlevel.js — the SPD floor builder, without the page.

     node tests/spdlevel.js            # 400 floors per biome
     node tests/spdlevel.js 3000       # more
     node tests/spdlevel.js 1 --draw   # print one floor per biome as ASCII

   For every floor it checks what game.js relies on and cannot cheaply repair:
   the builder returned a floor that fits the map, it has stairs both ways, the
   exit is reachable on foot from the entrance WITHOUT passing a locked door,
   deep water or a chasm, and every locked room is reachable once its door is
   opened. Movement is 8-way with no corner-cutting, which is Cantori's rule and
   stricter than SPD's — the thing most likely to break a port like this. */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = undefined;
eval(fs.readFileSync(path.join(__dirname, "..", "spdlevel.js"), "utf8"));
const S = globalThis.CantoriSPD;
const T = S.T;

const N = Number(process.argv[2]) || 400;
const DRAW = process.argv.includes("--draw");

// Tiles that stop feet, in Cantori terms (see TERRAIN_TO_TILE in game.js).
const BLOCK = new Set([T.WALL, T.STATUE, T.BOOKSHELF, T.WELL, T.LOCKED_DOOR, T.SECRET_DOOR, T.CHASM, T.WATER]);
function reach(lv, sx, sy, extraOpen) {
  const open = (x, y) => x >= 0 && y >= 0 && x < lv.w && y < lv.h && (!BLOCK.has(lv.map[x + y * lv.w]) || (extraOpen && extraOpen.has(x + y * lv.w)));
  const seen = new Set([sx + sy * lv.w]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, k = nx + ny * lv.w;
      if (!open(nx, ny) || seen.has(k)) continue;
      if (dx && dy && !open(x + dx, y) && !open(x, y + dy)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
const GLYPH = { [T.WALL]: "#", [T.EMPTY]: ".", [T.EMPTY_SP]: ",", [T.WATER]: "~", [T.SHALLOW]: "-", [T.GRASS]: "\"", [T.HIGH_GRASS]: "&",
  [T.CHASM]: " ", [T.STATUE]: "S", [T.BOOKSHELF]: "B", [T.EMBERS]: ";", [T.PEDESTAL]: "p", [T.WELL]: "W", [T.DOOR]: "+",
  [T.LOCKED_DOOR]: "L", [T.SECRET_DOOR]: "?", [T.ENTRANCE]: "<", [T.EXIT]: ">", [T.DECO]: "%" };
function draw(lv) {
  let s = "";
  for (let y = 0; y < lv.h; y++) { for (let x = 0; x < lv.w; x++) s += GLYPH[lv.map[x + y * lv.w]] || "?"; s += "\n"; }
  return s;
}

let failures = 0;
const t0 = Date.now();
for (let region = 0; region < 5; region++) {
  let fails = 0, cut = 0, lockedCut = 0, sumW = 0, sumH = 0, maxW = 0, maxH = 0, sumAtt = 0, specials = 0, names = {};
  for (let i = 0; i < N; i++) {
    const lv = S.generate({ region, depth: region * 5 + 1 + (i % 4) });
    if (!lv) { fails++; continue; }
    sumW += lv.w; sumH += lv.h; maxW = Math.max(maxW, lv.w); maxH = Math.max(maxH, lv.h); sumAtt += lv.attempts;
    for (const r of lv.rooms) names[r.name] = (names[r.name] || 0) + 1;
    const r0 = reach(lv, lv.entrance.x, lv.entrance.y);
    if (!r0.has(lv.exit.x + lv.exit.y * lv.w)) { cut++; if (cut <= 2 && !DRAW) console.log(`region ${region}: exit cut off\n` + draw(lv)); }
    // Open every locked door: each locked room's interior must then be reachable.
    const doors = new Set();
    for (let k = 0; k < lv.map.length; k++) if (lv.map[k] === T.LOCKED_DOOR) doors.add(k);
    const r1 = reach(lv, lv.entrance.x, lv.entrance.y, doors);
    for (const room of lv.rooms.filter((r) => r.locked)) {
      specials++;
      let ok = false;
      for (let y = room.top + 1; y < room.bottom && !ok; y++) for (let x = room.left + 1; x < room.right && !ok; x++) ok = r1.has(x + y * lv.w);
      if (!ok) { lockedCut++; if (lockedCut <= 2 && !DRAW) console.log(`region ${region}: locked ${room.name} unreachable\n` + draw(lv)); }
    }
    if (DRAW && i === 0) console.log(`--- region ${region} (${lv.w}x${lv.h}) ---\n` + draw(lv));
  }
  const ok = N - fails;
  console.log(`region ${region}: ${ok}/${N} built, avg ${(sumW / ok).toFixed(1)}x${(sumH / ok).toFixed(1)} (max ${maxW}x${maxH}), ` +
    `avg attempts ${(sumAtt / ok).toFixed(2)}, exit cut ${cut}, locked rooms ${specials} (${lockedCut} unreachable)`);
  if (!DRAW) console.log("   rooms: " + Object.entries(names).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(", "));
  failures += fails + cut + lockedCut;
}
console.log(`${Date.now() - t0} ms`);
if (failures) { console.log(`FAIL — ${failures} problem floors`); process.exit(1); }
console.log("ok");

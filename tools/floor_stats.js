#!/usr/bin/env node
/* Measure the SHAPE of generated floors — the numbers behind docs/FLOOR-DESIGN.md.
 *
 * `tests/smoke.js` proves a floor is *finishable*. Nothing proved a floor was worth
 * walking, so every judgement about layout was an eyeballed screenshot, and the
 * generator has already been re-tuned twice on that basis — once in a direction that
 * made a measured problem worse (see the doc). This prints the numbers instead.
 *
 * Usage:  node tools/floor_stats.js [--floors 60] [--depth 1]
 *
 *   --depth picks the biome: 1-5 forest, 6-10 cave, 11-15 crypt, 16-20 town, 21-25 lake.
 *   Boss depths (every 5th) are hand-laid arenas and are skipped with a warning.
 *
 * Same Playwright resolution as tests/smoke.js: this repo has no dependencies, so the
 * test resolves it from a local node_modules if there is one, otherwise the global install.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { createRequire } = require("module");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const argNum = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt; };
const FLOORS = argNum("--floors", 60);
const DEPTH = argNum("--depth", 1);

function loadChromium() {
  try { return require("playwright").chromium; } catch (e) { /* global install below */ }
  try {
    const g = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(path.join(g, "index.js"))("playwright").chromium;
  } catch (e) { /* fall through */ }
  console.error("Playwright not found.  npm i -g playwright && npx playwright install chromium");
  process.exit(2);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".md": "text/plain",
};
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const rel = path.normalize(url === "/" ? "/index.html" : url).replace(/^(\.\.[/\\])+/, "");
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// ---- WCAG relative luminance, for the floor-map contrast check ---------------
// The map draws wall and floor as filled cells of near-identical brown. "Near" is
// not an opinion once it is a contrast ratio: 3:1 is the floor for a non-text
// graphic, and both of the map's pairs come in under 1.4.
const lum = (hex) => {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

async function main() {
  const chromium = loadChromium();
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 930 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.cantori && window.CANTORI_DATA, null, { timeout: 20000 });
  await page.evaluate(() => window.cantori.pickClass(window.cantori.classRoster()[0]));

  if (DEPTH % 5 === 0) {
    console.error(`depth ${DEPTH} is a boss depth — a hand-laid arena, not a generated floor. Pick another.`);
    await browser.close(); server.close(); process.exit(2);
  }
  // There is no setDepth hook, so walk down the way tests/smoke.js does: descend()
  // advances a floor, and from a boss depth it lands on the merchant den first
  // (which does not consume a depth number), so that costs one extra call.
  await page.evaluate((d) => {
    const c = window.cantori;
    for (let guard = 0; guard < 80 && c.peek().depth < d; guard++) c.descend();
    if (c.peek().inShop) c.descend();
  }, DEPTH);

  const r = await page.evaluate(({ n, R }) => {
    const c = window.cantori;
    const rows = [], areas = [], fovFrac = [];
    let roomsTot = 0, bare = 0, withMon = 0, withItem = 0, withTerr = 0, withPillar = 0, slots = 0, fovWhole = 0;
    // Tiles you can stand on. Deliberately not `passable()` — this walks the map the
    // way the player does, so deep water is out and grass/rubble are in.
    const walkable = (t) => t === 1 || t === 2 || t === 3 || t === 7 || t === 8;
    for (let i = 0; i < n; i++) {
      c.regenerate();
      const p = c.peek(), W = p.grid.w, H = p.grid.h;
      // Start -> stairs, 8-direction, over walkable tiles: the shortest the floor
      // can be finished in, which is the closest thing to "how long is this floor".
      const st = c.stairsAt();
      let dist = -1;
      if (st) {
        const q = [[p.x, p.y, 0]], seen = new Set([p.y * W + p.x]);
        while (q.length) {
          const [x, y, d] = q.shift();
          if (x === st.x && y === st.y) { dist = d; break; }
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy, k = ny * W + nx;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k) || !walkable(c.tileAt(nx, ny))) continue;
            seen.add(k); q.push([nx, ny, d + 1]);
          }
        }
      }
      let x0 = W, x1 = 0, y0 = H, y1 = 0, terrain = 0, floorT = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const t = c.tileAt(x, y);
        if (t === 0) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (t === 1 || t === 2 || t === 3) floorT++;
        if (t === 5 || t === 6 || t === 7 || t === 8) terrain++;
      }
      const rs = c.rooms();
      for (const r2 of rs) {
        roomsTot++; areas.push(r2.w * r2.h);
        if (r2.w <= 3 || r2.h <= 3) slots++;
        const inR = (x, y) => x >= r2.x && x < r2.x + r2.w && y >= r2.y && y < r2.y + r2.h;
        const mon = p.mlist.some((o) => inR(o.x, o.y)), item = p.items.some((o) => inR(o.x, o.y));
        let terr = 0, pil = 0;
        for (let y = r2.y; y < r2.y + r2.h; y++) for (let x = r2.x; x < r2.x + r2.w; x++) {
          const t = c.tileAt(x, y);
          if (t === 4 || t === 5 || t === 6 || t === 7 || t === 8) terr++;
          if (t === 0) pil++;
        }
        if (mon) withMon++; if (item) withItem++; if (terr) withTerr++; if (pil) withPillar++;
        if (!mon && !item && !terr && !pil) bare++;
        // How much of the room a player standing in its doorway already sees. This is
        // the geometric CEILING (Chebyshev distance, no occlusion) — pillars inside can
        // only lower it — and the whole point of the FOV radius was that it should be
        // well under 1. Every doorway on the ring is tried; the best one counts,
        // because that is the one the floor is likely to route you through.
        const doors = [];
        for (let x = r2.x - 1; x <= r2.x + r2.w; x++) for (const y of [r2.y - 1, r2.y + r2.h]) {
          const t = c.tileAt(x, y); if (t === 1 || t === 3) doors.push([x, y]);
        }
        for (let y = r2.y - 1; y <= r2.y + r2.h; y++) for (const x of [r2.x - 1, r2.x + r2.w]) {
          const t = c.tileAt(x, y); if (t === 1 || t === 3) doors.push([x, y]);
        }
        if (!doors.length) continue;
        let best = 0;
        for (const [dx, dy] of doors) {
          let seen = 0, cells = 0;
          for (let y = r2.y; y < r2.y + r2.h; y++) for (let x = r2.x; x < r2.x + r2.w; x++) {
            if (c.tileAt(x, y) === 0) continue;
            cells++;
            if (Math.max(Math.abs(x - dx), Math.abs(y - dy)) <= R) seen++;
          }
          if (cells && seen / cells > best) best = seen / cells;
        }
        fovFrac.push(best);
        if (best >= 0.999) fovWhole++;
      }
      rows.push({
        rooms: rs.length, attach: c.attachInfo().attached, dist,
        extentW: x1 - x0 + 1, extentH: y1 - y0 + 1, fill: p.fill,
        terrain, floorT, mon: p.mlist.length, items: p.items.length,
        maxArea: Math.max.apply(null, rs.map((q) => q.w * q.h)),
      });
    }
    return { rows, areas, roomsTot, bare, withMon, withItem, withTerr, withPillar, slots, fovWhole, fovFrac,
             depth: c.peek().depth };
  }, { n: FLOORS, R: 6 });

  const rows = r.rows;
  const avg = (f) => (rows.reduce((a, x) => a + f(x), 0) / rows.length).toFixed(1);
  const areas = r.areas.slice().sort((a, b) => a - b);
  const q = (p) => areas[Math.floor(areas.length * p)];
  const pct = (v) => (100 * v / r.roomsTot).toFixed(0) + "%";
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

  console.log(`\n${FLOORS} floors at depth ${r.depth}\n`);
  console.log("SHAPE");
  console.log(`  rooms per floor        ${avg((x) => x.rooms)}   of which attached ${avg((x) => x.attach)}`);
  console.log(`  room area              mean ${mean(areas).toFixed(1)}  median ${q(0.5)}  p90 ${q(0.9)}  max ${areas[areas.length - 1]}`);
  console.log(`  biggest room per floor ${avg((x) => x.maxArea)}          <- the floor's one landmark`);
  console.log(`  a side of 3 or less    ${pct(r.slots)}                 <- a slot, not a room`);
  console.log(`  used extent            ${avg((x) => x.extentW)} x ${avg((x) => x.extentH)} of 47 x 47`);
  console.log(`  start -> stairs        ${avg((x) => x.dist)} steps`);
  console.log(`  corridor share         ${avg((x) => 100 * x.fill.corridorPct / x.fill.floorPct)}% of walkable`);
  console.log("\nCONTENT");
  console.log(`  rooms with a monster   ${pct(r.withMon)}`);
  console.log(`  ...an item             ${pct(r.withItem)}`);
  console.log(`  ...any terrain         ${pct(r.withTerr)}`);
  console.log(`  ...a pillar            ${pct(r.withPillar)}`);
  console.log(`  completely bare        ${pct(r.bare)}`);
  console.log(`  terrain tiles/floor    ${avg((x) => x.terrain)} (${(100 * rows.reduce((a, x) => a + x.terrain, 0) / rows.reduce((a, x) => a + x.floorT + x.terrain, 0)).toFixed(1)}% of walkable)`);
  console.log(`  monsters / items       ${avg((x) => x.mon)} / ${avg((x) => x.items)}`);
  console.log("\nSURPRISE  (share of a room already visible from its own doorway, at FOV radius 6)");
  console.log(`  fully visible          ${pct(r.fovWhole)}`);
  console.log(`  mean visible share     ${(100 * mean(r.fovFrac)).toFixed(0)}%`);
  console.log("\nFLOOR-MAP LEGIBILITY  (drawMap fill colours, WCAG contrast; 3:1 is the floor for a graphic)");
  console.log(`  wall vs floor, walked  ${contrast("#4b3d27", "#332a1c").toFixed(2)}:1`);
  console.log(`  wall vs floor, mapped  ${contrast("#3a2f1d", "#241c11").toFixed(2)}:1`);
  console.log("");
  if (errors.length) console.log("page errors: " + errors.join(" | "));

  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

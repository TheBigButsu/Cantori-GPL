#!/usr/bin/env node
/* Cantori smoke test.
 *
 * Boots the real page in headless Chromium and drives it through the window.cantori
 * dev hooks, checking the two things that actually break the game when a packet goes
 * wrong: a floor you cannot finish, and a crash in the turn loop.
 *
 * For every depth 1..25 it regenerates the floor N times and asserts that
 *   - the way onward exists and is reachable on foot from where you start
 *     (stairs on a normal floor; the boss on a boss floor, since the exit only
 *      opens when the boss dies)
 *   - monsters actually spawned
 * then runs the world forward some turns to shake out monster-AI and boss-playbook
 * crashes. Any console error or uncaught exception anywhere fails the run.
 *
 * Usage:  node tests/smoke.js [--iterations 6] [--depths 25] [--turns 25] [--headed]
 *
 * Needs Playwright. This repo has no dependencies and no build step, so the test
 * resolves Playwright from a local node_modules if there is one, otherwise from the
 * global install.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { createRequire } = require("module");

const ROOT = path.resolve(__dirname, "..");

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const argNum = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const ITERATIONS = argNum("--iterations", 6);   // regenerations per depth
const DEPTHS = argNum("--depths", 25);
const TURNS = argNum("--turns", 25);            // world turns run per depth
const HEADED = argv.includes("--headed");

// ---- playwright resolution -------------------------------------------------
function loadChromium() {
  try {
    return require("playwright").chromium;
  } catch (e) { /* fall through to the global install */ }
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(path.join(globalRoot, "index.js"))("playwright").chromium;
  } catch (e) { /* fall through to the error below */ }
  console.error(
    "Playwright not found.\n" +
    "  Install it locally:  npm i -D playwright && npx playwright install chromium\n" +
    "  ...or globally:      npm i -g playwright"
  );
  process.exit(2);
}

// ---- a tiny static server (no dependencies) --------------------------------
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

// ---- reporting -------------------------------------------------------------
const failures = [];
let checks = 0;
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return ok;
}

async function main() {
  const chromium = loadChromium();
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 430, height: 930 } });

  const errors = [];
  page.on("pageerror", (err) => errors.push("uncaught: " + err.message));
  page.on("console", (msg) => {
    // A failed asset shows up here only as a bare "404" with no URL, which is
    // useless to act on — the response handler below reports those instead.
    if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) {
      errors.push("console: " + msg.text());
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      const url = res.url().replace(`http://127.0.0.1:${port}`, "");
      const hint = /assets\/tiles\//.test(url)
        ? " — a data.js entry has no matching sprite (see CLAUDE.md rule 3)" : "";
      errors.push(`missing asset ${res.status()}: ${url}${hint}`);
    }
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.cantori && window.CANTORI_DATA, null, { timeout: 15000 });

  // The run opens on the hero-select overlay — pick the first startable class.
  await page.evaluate(() => {
    const roster = window.cantori.classRoster();
    window.cantori.pickClass(roster[0]);
  });

  const bossKeys = await page.evaluate(() => Object.keys(window.CANTORI_DATA.bosses));

  // C1: every tile constant must have a row in the TILE property table, so a
  // future tile can't be added without declaring what it is (CLAUDE.md rule 5).
  const undeclared = await page.evaluate(() => {
    const consts = window.cantori.tileConstants();
    return Object.entries(consts).filter(([, v]) => !window.cantori.tileDeclared(v)).map(([k]) => k);
  });
  check(undeclared.length === 0, `tile constant(s) with no TILE row: ${undeclared.join(", ")}`);

  // C2: a clean boot must agree with the data.js the server actually serves.
  // The game re-fetches data.js with cache:"no-store" and raises a bar if the
  // two differ, because a stale Playtest draft or a cached index.html can leave
  // a player weeks behind a shipped build with nothing on screen to say so.
  // Here there is neither, so the bar must stay away — a failure means the
  // comparison itself has started crying wolf, which would train the user to
  // ignore the one warning that matters.
  await page.waitForFunction(() => window.cantori.dataSource().checked, null, { timeout: 15000 })
    .catch(() => {});
  const src = await page.evaluate(() => window.cantori.dataSource());
  check(src.checked === true, "the data freshness check never ran on a clean boot");
  check(src.stale === null, `clean boot reported stale content (${src.stale})`);
  check(src.draft === false, "clean boot thinks it is running an editor draft");

  // C3: EVERY worn slot must gain identification progress from XP. This shipped
  // broken: idFromXP walked a hand-written slot list containing "ring", but the
  // player has ring1 and ring2 and no ring, so both rings sat at 0% for an entire
  // run while every other slot learned normally. The list is wornItems() now, and
  // this asserts the property rather than the spelling — add a seventh slot and
  // it is covered automatically.
  const idGains = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA;
    const first = (cat) => Object.keys(D.gear).find((k) => D.gear[k].cat === cat && !D.gear[k].noDrop);
    // Roll until an unidentified one turns up — an all-plain roll is born known.
    for (const cat of ["weapon", "armor", "ring", "ring", "necklace", "trinket"]) {
      const k = first(cat);
      if (!k) continue;
      for (let t = 0; t < 80; t++) {
        c.give(k);
        const inv = c.peek().invItems, i = inv.length - 1;
        if (inv[i] && inv[i].identified === false) { c.equip(i); break; }
      }
    }
    const slots = ["weapon", "armor", "ring1", "ring2", "artifact", "necklace"];
    const read = () => { const st = c.peek(), o = {}; for (const sl of slots) if (st[sl]) o[sl] = st[sl].idXp || 0; return o; };
    const before = read();
    c.addXp(3);
    const after = read();
    const worn = Object.keys(after);
    const stuck = worn.filter((sl) => after[sl] - (before[sl] || 0) !== 3);
    for (const sl of slots) c.unequip(sl);      // leave the run as we found it
    return { worn, stuck };
  });
  check(idGains.worn.length >= 5, `only ${idGains.worn.length} slots could be filled for the identification check`);
  check(idGains.stuck.length === 0, `worn slot(s) gained no identification XP: ${idGains.stuck.join(", ")}`);

  // Rings (SPD's): a ring is a disguised gem until it identifies — wearing it
  // alone names nothing, though it works at once — identifying names the type for
  // the run, and what it does is its effect at its level — not a stat affix. And
  // the flex slots: a trinket goes in the second ring slot or at the neck.
  const rings = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA, out = { problems: [] };
    c.regenerate(); c.hurt(-999);                 // a quiet floor: this block spends turns
    for (const sl of ["ring1", "ring2", "necklace"]) c.unequip(sl);
    const before = c.ringInfo();
    c.give("ring_haste");
    let inv = c.peek().invItems, i = inv.length - 1;
    const disguised = c.nameOf(i);
    if (/Haste/.test(disguised)) out.problems.push("an unworn Ring of Haste is not disguised (" + disguised + ")");
    c.equip(i);
    const worn = c.ringInfo();
    if (!worn.ring1 || worn.ring1.key !== "ring_haste") out.problems.push("the ring did not go in the ring slot");
    else {
      if (/Haste/.test(worn.ring1.name)) out.problems.push("putting the ring on named it before it identified (" + worn.ring1.name + ")");
      if (!(worn.walkCost < before.walkCost)) out.problems.push(`Ring of Haste did not speed walking (${before.walkCost} -> ${worn.walkCost})`);
      if (worn.levels.haste < 1) out.problems.push("Ring of Haste has no level");
    }
    c.idWorn(9999);
    if (!/Haste/.test(c.ringInfo().ring1.name)) out.problems.push("identifying the ring did not name it (" + c.ringInfo().ring1.name + ")");
    c.give("ring_haste"); inv = c.peek().invItems;
    if (!/Haste/.test(c.nameOf(inv.length - 1))) out.problems.push("a second Ring of Haste was not known by name once the first identified");
    c.trimInv(1);
    c.give("ring_accuracy"); inv = c.peek().invItems; c.equip(inv.length - 1);
    const two = c.ringInfo();
    if (!two.ring2 || two.ring2.key !== "ring_accuracy") out.problems.push("the second ring did not take the ring/trinket slot");
    else if (!(two.toHit > worn.toHit)) out.problems.push("Ring of Accuracy did not raise to-hit");
    const trink = Object.keys(D.gear).find((k) => D.gear[k].cat === "trinket" && !D.gear[k].noDrop);
    if (trink) {
      c.give(trink); inv = c.peek().invItems; c.equip(inv.length - 1);
      if (c.ringInfo().necklace !== trink) out.problems.push("with both ring slots full, a trinket did not go to the neck");
    }
    for (const sl of ["ring1", "ring2", "necklace"]) c.unequip(sl);
    return out;
  });
  check(rings.problems.length === 0, "rings: " + rings.problems.join("; "));

  // Artifacts (SPD's): each one goes in the artifact slot, fires without an
  // error, and the ones with a visible effect show it.
  const arts = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA, problems = [], fired = [];
    // Every equip costs a turn, and this block spends dozens of them: on a fresh
    // floor at full health, a monster that happens to be awake cannot kill a
    // level-1 hero in the middle of it (which made artifacts "fail" at random).
    c.regenerate(); c.hurt(-999);
    if (c.peek().dead) return { problems: ["the player was dead before the artifact test"], fired: 0, total: 0 };
    const keys = Object.keys(D.gear).filter((k) => D.gear[k].cat === "artifact");
    for (const k of keys) {
      c.give(k);
      const inv = c.peek().invItems;
      c.equip(inv.length - 1);
      const info = c.artInfo();
      if (!info || info.key !== k) { problems.push(k + " did not go in the artifact slot"); continue; }
      c.chargeArtifact(); c.hurt(-999);
      const before = c.artInfo();
      c.useArtifact();
      const after = c.artInfo();
      if (after.pending) c.useArtifact();       // a targeted one arms rather than fires — put it away
      fired.push(k);
      const art = D.gear[k].art;
      if (art === "hourglass" && !(after.freeze > 0)) problems.push("the hourglass did not stop time");
      if (art === "cloak" && !(after.invisible > 0)) problems.push("the cloak did not hide you");
      if (art === "rose" && !after.ghost) problems.push("the rose summoned no ghost");
      if (art === "chalice" && !(after.lvl > before.lvl) && c.peek().hp > 10) problems.push("the chalice did not level on a prick");
      if (!/level \d+\/10/.test(after.text)) problems.push(k + " card text is missing its level: " + after.text);
      c.unequip("artifact");
      c.trimInv(1);                             // the artifact just unequipped — keep the pack from filling
    }
    return { problems, fired: fired.length, total: keys.length };
  });
  check(arts.total >= 11, `expected 11 artifacts in data.js, found ${arts.total}`);
  check(arts.problems.length === 0, "artifacts: " + arts.problems.join("; "));

  // Gases (SPD's Blobs): toxic spreads, hurts what stands in it and fades to
  // nothing; fire burns grass to embers and frost puts it out; a gas trap lets its
  // gas out; and a new floor starts clean.
  const gas = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    c.regenerate(); c.hurt(-999);
    const p = c.peek();
    // somewhere open, a few tiles from you, to let a cloud loose in
    let spot = null;
    // Straight lines first, then the whole ring: a start tucked into a corridor
    // can have nothing open on its four axes.
    const ring = (r) => { const out = [[r, 0], [-r, 0], [0, r], [0, -r]]; for (let i = -r; i <= r; i++) out.push([i, r], [i, -r], [r, i], [-r, i]); return out; };
    for (let r = 3; r <= 6 && !spot; r++) for (const [dx, dy] of ring(r)) {
      const x = p.x + dx, y = p.y + dy;
      if (c.passableAt(x, y) && !c.peek().mlist.some((m) => m.x === x && m.y === y)) { spot = { x, y }; break; }
    }
    if (!spot) return { problems: ["no open tile to test gas on"] };
    c.spawnMonsterAt("rat", spot.x, spot.y);
    const hp0 = c.monsterHpAt(spot.x, spot.y);
    c.spawnGas("toxic", spot.x, spot.y, 400);
    c.gasTick();
    const hp1 = c.monsterHpAt(spot.x, spot.y);
    if (!(hp1 === null || hp1 < hp0)) problems.push("toxic gas did not hurt the rat standing in it");
    let spread = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (c.gasAt("toxic", spot.x + dx, spot.y + dy) > 0) spread++;
    if (!spread) problems.push("toxic gas did not spread to a neighbouring tile");
    for (let i = 0; i < 400 && c.gasTotal("toxic") > 0; i++) c.gasTick();
    if (c.gasTotal("toxic") > 0) problems.push("toxic gas never faded away");
    // fire through grass, then frost over it
    c.setTerrain(spot.x, spot.y, "GRASS");
    c.spawnGas("fire", spot.x, spot.y, 2);
    for (let i = 0; i < 6; i++) c.gasTick();
    if (!c.terrainIs(spot.x, spot.y, "EMBERS")) problems.push("fire did not burn the grass to embers");
    c.spawnGas("fire", spot.x, spot.y, 5);
    c.spawnGas("frost", spot.x, spot.y, 5);
    c.gasTick();
    if (c.gasAt("fire", spot.x, spot.y) > 0) problems.push("frost did not put the fire out");
    // a gas trap
    c.addTrap("paralytic", spot.x, spot.y);
    c.springTrap(c.trapCount() - 1, true);        // remote: a lucky foot cannot skip it
    if (!(c.gasAt("paralytic", spot.x, spot.y) > 0)) problems.push("a paralytic gas trap let no gas out");
    c.regenerate();
    if (c.gasKinds().length) problems.push("gas carried over to a new floor: " + c.gasKinds().join(", "));
    c.hurt(-999);
    return { problems };
  });
  check(gas.problems.length === 0, "gases: " + gas.problems.join("; "));

  // SPD's depth scaling: the XP cap (maxLvl), 5-tier gear bands, the Monk's
  // parry, Town's roster and the Horror's 600-turn clock.
  const scale = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA, problems = [];
    c.regenerate(); c.hurt(-999);
    const p = c.peek();
    const open = () => {
      const q = c.peek();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = q.x + dx, y = q.y + dy;
        if (c.passableAt(x, y) && !q.mlist.some((m) => m.x === x && m.y === y)) return { x, y, dx, dy };
      }
      return null;
    };
    // XP cap: a rat pays at level 1 and nothing once you've outgrown it.
    let s = open();
    if (!s) return { problems: ["no open tile beside the player"] };
    if (p.level <= 1) {
      c.spawnMonsterAt("rat", s.x, s.y);
      const xp1 = c.killAt(s.x, s.y);
      if (!(xp1 > 0)) problems.push("a rat paid no XP at level 1");
    }
    c.setLevel(12);
    c.spawnMonsterAt("rat", s.x, s.y);
    if (c.monsterFx(s.x, s.y).maxLvl !== D.monsters.rat.maxLvl) problems.push("rat maxLvl does not come from data.js");
    const xp2 = c.killAt(s.x, s.y);
    if (xp2 !== 0) problems.push("a rat still paid " + xp2 + " XP at level 12 (maxLvl " + D.monsters.rat.maxLvl + ")");
    // Town: every monster it names exists.
    const town = D.biomes.find((b) => b.key === "town");
    for (const k of town.monsters) if (!D.monsters[k]) problems.push("Town names a missing monster: " + k);
    for (const k of ["gnoll_scout", "prison_guard", "gnoll_brute", "gnoll_shaman"]) if (town.monsters.indexOf(k) < 0) problems.push("Town has no " + k);
    // Gear: tier 4 and 5 actually drop in the Lake.
    const h = c.tierHist(22, 2000);
    if (!(h[4] > 0 && h[5] > 0)) problems.push("no tier 4/5 gear in 2000 drops at depth 22: " + JSON.stringify(h));
    // The Horror's clock.
    if (c.floorStages().grant !== 600) problems.push("floor grant is " + c.floorStages().grant + ", not 600");
    c.hurt(-999);
    return { problems };
  });
  check(scale.problems.length === 0, "scaling: " + scale.problems.join("; "));

  // Playtest fixes: a hunter follows you through a closed bush instead of
  // forgetting you at it; SPD floors carry no torches; the floor is lit brighter;
  // a status shows over your head with a draining timer.
  const play = await page.evaluate(() => {
    const c = window.cantori, T = c.tileConstants(), problems = [];
    // Built on the spot in any open patch of floor: a wall with a bush in it,
    // and on the player's side a short wall to duck behind — so the tile where
    // the rat last saw you does NOT see where you went. That is the forest case:
    // through the bush and round the corner.
    //
    //        . . . . . .          P = where the player ends up
    //        . . P . . |          R = the rat, hunting
    //        . # # # . |          + = a closed bush (door)
    //        . . . s . + . R      s = where the player stood when last seen
    //        . . . . . |
    let tries = 0, spot = null;
    while (!spot && tries++ < 25) {
      c.regenerate(); c.hurt(-999);
      const g = c.peek().grid;
      // no plant or trap in the patch: a Blindweed under the rat's feet blinds
      // it into wandering, which is the plant working, not the hunt failing
      const busy = new Set(c.plantList().concat(c.peek().traps).map((q) => q.x + "," + q.y));
      for (let y = 4; y < g.h - 4 && !spot; y++) for (let x = 6; x < g.w - 4 && !spot; x++) {
        let ok = true;
        for (let yy = y - 2; yy <= y + 2 && ok; yy++) for (let xx = x - 4; xx <= x + 2 && ok; xx++) {
          // plain ground only (floor, grass, and SPD's shallows 9 / lawn 10 /
          // special floor 11): passableAt says yes to a chasm (you may jump), and
          // a rat will not follow you down one
          const t = c.tileAt(xx, yy);
          if (!c.passableAt(xx, yy) || [T.FLOOR, T.GRASS, 9, 10, 11].indexOf(t) < 0 || busy.has(xx + "," + yy)) ok = false;
        }
        if (ok) spot = { x, y };
      }
    }
    if (!spot) problems.push("no open patch of floor to test hunting on");
    else {
      const x0 = spot.x, y = spot.y;
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
      for (let yy = y - 2; yy <= y + 2; yy++) c.setTerrain(x0, yy, yy === y ? "DOOR" : "WALL");
      for (let xx = x0 - 3; xx <= x0 - 1; xx++) c.setTerrain(xx, y - 1, "WALL");
      c.place(x0 - 1, y);
      c.spawnMonsterAt("rat", x0 + 2, y);
      c.huntNow(x0 + 2, y);                            // it last saw you at s
      c.place(x0 - 2, y - 2);                          // through the bush and round the corner
      let caught = false;
      for (let i = 0; i < 16 && !caught; i++) {
        c.hurt(-999); c.tick(1);
        const r = c.peek().mlist.find((m) => m.type === "rat");
        if (!r) break;
        if (Math.max(Math.abs(r.x - (x0 - 2)), Math.abs(r.y - (y - 2))) <= 1) caught = true;
      }
      if (!caught) problems.push("a hunting rat lost the player through a bush and round a corner");
      c.regenerate();
    }
    const f = c.spdFloor();
    if (f && c.peek().torches.length) problems.push("an SPD floor placed " + c.peek().torches.length + " torches");
    const p = c.peek();
    if (!(c.lightAt(p.x + 6, p.y) >= 0.6)) problems.push("the edge of sight is lit at " + c.lightAt(p.x + 6, p.y));
    if (!(c.memLight() >= 0.35)) problems.push("remembered tiles are lit at " + c.memLight());
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    c.hexMe("vertigo");
    const s0 = c.statusIcons().find((st) => st.key === "vertigo");
    c.tick(1);
    const s1 = c.statusIcons().find((st) => st.key === "vertigo");
    if (!s0 || s0.left !== s0.peak) problems.push("a fresh vertigo timer does not start full");
    else if (!s1 || !(s1.left < s1.peak)) problems.push("the vertigo timer did not run down after a turn");
    for (let i = 0; i < 4; i++) { c.hurt(-999); c.tick(1); }   // let it wear off: later checks walk in straight lines
    c.hurt(-999);
    return { problems };
  });
  check(play.problems.length === 0, "playtest fixes: " + play.problems.join("; "));

  // SPD's King's Crown window for boons (row + ⓘ + confirm), the attack
  // button (melee and ranged), and the trimmed stats screen.
  const ui = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    c.regenerate(); c.hurt(-999);
    // boons
    const before = (c.peek().boons || []).length;
    c.offerBoons();
    const offer = c.boonChoices();
    if (offer.length !== 3) problems.push("a boon offer showed " + offer.length + " choices");
    if (document.querySelectorAll("#boonChoices .boon-info").length !== offer.length) problems.push("not every boon row has an info button");
    document.querySelector("#boonChoices .boon-info").click();
    if (document.getElementById("boonPop").hidden) problems.push("the boon info button opened nothing");
    document.querySelector("#boonPopBtns button").click();
    document.querySelector("#boonChoices .boon-choice").click();
    if (!document.querySelector("#boonPopBtns button.primary")) problems.push("choosing a boon did not ask to confirm");
    if (document.getElementById("boons").hidden) problems.push("the boon was taken before it was confirmed");
    document.querySelector("#boonPopBtns button.primary").click();
    const after = (c.peek().boons || []).length;
    if (after !== before + 1) problems.push("confirming a boon did not grant it (" + before + " → " + after + ")");
    if (!document.getElementById("boons").hidden) problems.push("the boon window stayed open after a pick");
    // attack button: nothing in reach
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    if (c.attackBtnShown()) problems.push("the attack button shows with nothing in reach");
    // melee: a rat beside you
    const p = c.peek();
    const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => c.passableAt(p.x + dx, p.y + dy));
    if (side) {
      const [dx, dy] = side;
      c.spawnMonsterAt("rat", p.x + dx, p.y + dy);
      const t = c.attackTarget();
      if (!t || t.type !== "rat") problems.push("the attack button did not pick the adjacent rat");
      let hit = false;
      for (let i = 0; i < 30 && !hit; i++) { c.hurt(-999); c.attackNearest(); const hp = c.monsterHpAt(p.x + dx, p.y + dy); if (hp === null || hp < 8) hit = true; }
      if (!hit) problems.push("pressing attack never hurt the adjacent rat");
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    }
    // ranged: with a bow, a rat three tiles off in the open is a target; the
    // same rat behind a wall is not
    c.giveGear("shortbow");
    c.equip(c.peek().invItems.length - 1);
    if (c.peek().weapon === "shortbow" || (c.peek().weapon && c.peek().weapon.key === "shortbow")) {
      const q = c.peek();
      const lane = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [1, 2, 3].every((k) => c.passableAt(q.x + dx * k, q.y + dy * k) && c.tileAt(q.x + dx * k, q.y + dy * k) !== 3));
      if (lane) {
        const [dx, dy] = lane;
        c.spawnMonsterAt("rat", q.x + dx * 3, q.y + dy * 3);
        const t = c.attackTarget();
        if (!t || t.x !== q.x + dx * 3 || t.y !== q.y + dy * 3) problems.push("with a bow, the attack button did not target a rat 3 tiles off");
        c.setTerrain(q.x + dx * 2, q.y + dy * 2, "WALL");
        if (c.attackBtnShown()) problems.push("the attack button targets a rat behind a wall");
        c.setTerrain(q.x + dx * 2, q.y + dy * 2, "FLOOR");
        for (const m of c.peek().mlist) c.killAt(m.x, m.y);
      }
    } else problems.push("could not equip a shortbow to test ranged targeting (" + JSON.stringify(c.peek().weapon) + ")");
    // stats screen
    const st = c.statsText();
    for (const w of ["d20", "RESmod", "acts through its modifier", "step = 1"]) if (st.indexOf(w) >= 0) problems.push("the stats screen still says '" + w + "'");
    c.hurt(-999);
    return { problems };
  });
  check(ui.problems.length === 0, "ui: " + ui.problems.join("; "));

  // Pick-up is SPD's: an item comes with you only if you tapped its tile (or
  // your own); walking over it on the way elsewhere leaves it. Regeneration
  // lasts until the last 10% of the floor's time bar.
  const pick = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    let lane = null;
    for (let t = 0; t < 10 && !lane; t++) {
      c.regenerate(); c.hurt(-999);
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
      const q = c.peek();
      lane = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [1, 2].every((k) => c.passableAt(q.x + dx * k, q.y + dy * k) && c.tileAt(q.x + dx * k, q.y + dy * k) === 1 && !c.itemCountAt(q.x + dx * k, q.y + dy * k)));
    }
    if (!lane) return { problems: ["no straight lane of floor to test pick-up on"] };
    const q = c.peek(), [dx, dy] = lane;
    const ax = q.x + dx, ay = q.y + dy, bx = q.x + dx * 2, by = q.y + dy * 2;
    c.putItem("heal", ax, ay);
    c.tapAt(bx, by); c.finishWalk();
    if (c.peek().x !== bx || c.peek().y !== by) problems.push("the tap-walk did not arrive");
    else if (!c.itemCountAt(ax, ay)) problems.push("walking over an item on the way elsewhere picked it up");
    c.tapAt(ax, ay); c.finishWalk();
    if (c.itemCountAt(ax, ay)) problems.push("tapping an item's tile and walking there did not pick it up");
    c.putItem("heal", ax, ay);
    c.tapAt(ax, ay);            // standing on it: tap your own tile
    if (c.itemCountAt(ax, ay)) problems.push("tapping the tile you stand on did not pick up the item there");
    // regeneration: still on at 85% of the bar, gone at 90%
    c.regenerate();
    const pat = c.peek().patience || c.floorStages().patience;
    c.setTurns(Math.floor(pat * 0.85)); c.tick(1);
    if (c.sparkGone()) problems.push("regeneration stopped before the last 10% of the time bar");
    c.setTurns(Math.floor(pat * 0.9)); c.tick(1);
    if (!c.sparkGone()) problems.push("regeneration did not stop at the last 10% of the time bar");
    c.regenerate(); c.hurt(-999);
    return { problems };
  });
  check(pick.problems.length === 0, "pick-up/regen: " + pick.problems.join("; "));

  // Biome 3's Necromancer: marks a tile beside you, raises a skeleton there the
  // next turn, and takes it with it when it dies.
  const necro = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    let lane = null;
    for (let t = 0; t < 15 && !lane; t++) {
      c.regenerate(); c.hurt(-999);
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
      const q = c.peek();
      lane = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [1, 2, 3].every((k) => c.passableAt(q.x + dx * k, q.y + dy * k) && [1, 9, 10, 11].indexOf(c.tileAt(q.x + dx * k, q.y + dy * k)) >= 0));
    }
    if (!lane) return { problems: ["no straight lane to test the necromancer on"] };
    const q = c.peek(), [dx, dy] = lane, nx = q.x + dx * 3, ny = q.y + dy * 3;
    c.spawnMonsterAt("necromancer", nx, ny); c.huntNow(nx, ny);
    let sk = null;
    for (let i = 0; i < 4 && !sk; i++) { c.hurt(-999); c.tick(1); sk = c.peek().mlist.find((m) => m.type === "skeleton"); }
    if (!sk) problems.push("the necromancer never raised a skeleton");
    else if (Math.max(Math.abs(sk.x - q.x), Math.abs(sk.y - q.y)) !== 1) problems.push("the skeleton was not raised beside the player");
    const nm = c.peek().mlist.find((m) => m.type === "necromancer");
    if (nm) c.killAt(nm.x, nm.y);
    if (c.peek().mlist.some((m) => m.type === "skeleton")) problems.push("the skeleton outlived its necromancer");
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    // Biome 4's Brute rises once on a rage shield, then falls when it drains.
    c.place(q.x, q.y);
    c.spawnMonsterAt("gnoll_brute", q.x + dx, q.y + dy);
    c.killAt(q.x + dx, q.y + dy);
    const br = c.peek().mlist.find((m) => m.type === "gnoll_brute");
    if (!br) problems.push("the brute died at the first killing blow instead of raging");
    else {
      c.setMonsterAt(br.x, br.y, { stun: 99 });              // hold it still while the rage drains
      for (let i = 0; i < 40 && c.peek().mlist.some((m) => m.type === "gnoll_brute"); i++) { c.hurt(-999); c.tick(1); }
      if (c.peek().mlist.some((m) => m.type === "gnoll_brute")) problems.push("the brute's rage never drained");
    }
    // The Guard's chain hauls you to it once, and cripples you.
    c.spawnMonsterAt("prison_guard", nx, ny); c.huntNow(nx, ny);
    let pulled = false;
    for (let i = 0; i < 30 && !pulled; i++) {
      c.hurt(-999); c.place(q.x, q.y);
      const gi = c.peek().mlist.findIndex((m) => m.type === "prison_guard");
      if (gi >= 0) c.placeMonster(gi, nx, ny);              // keep it three tiles off: chain range, not sword range
      c.tick(1);
      const g = c.peek().mlist.find((m) => m.type === "prison_guard");
      if (!g) break;
      const p2 = c.peek();
      if (Math.max(Math.abs(p2.x - g.x), Math.abs(p2.y - g.y)) === 1 && (p2.x !== q.x || p2.y !== q.y)) pulled = true;
    }
    if (!pulled) problems.push("the prison guard never chained the player in");
    else if (!c.statusIcons().some((st) => st.key === "cripple")) problems.push("the guard's chain did not cripple");
    c.regenerate(); c.hurt(-999);
    return { problems };
  });
  check(necro.problems.length === 0, "necromancer/brute/guard: " + necro.problems.join("; "));

  // Biome 4: the climb. A tall shaft climbed to stairs at the top, closets off
  // to the sides, crates that never cut the way on, and a fire that rises from
  // the bottom — a line marked, then burned, one line every two turns.
  const gaunt = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    const back = c.peek().depth;
    let crates = 0, closets = 0;
    for (let r = 0; r < 6; r++) {
      c.goDepth(16 + (r % 4));
      if (c.peek().biome !== window.CANTORI_DATA.biomes.find((b) => b.key === "town").name) { problems.push("depth " + c.peek().depth + " is not the Town"); break; }
      const ci = c.climbInfo(), st = c.stairsAt(), p = c.peek();
      if (ci.h < 100) problems.push("the climb is only " + ci.h + " tall");
      if (!st || !c.reach(st.x, st.y)) problems.push("a climb's stairs are unreachable");
      else if (!(st.y < 10 && p.y > ci.h - 10)) problems.push("the climb does not run bottom (" + p.y + ") to top (" + st.y + ")");
      crates += c.crateCount(); closets += ci.closets;
      const bl = c.blazeInfo();
      if (!bl || bl.axis !== "y") problems.push("a climb has no rising fire");
    }
    if (!crates) problems.push("no crates on six climbs");
    if (!closets) problems.push("no side closets on six climbs");
    const H = c.climbInfo().h;
    c.blazeHold(false);
    for (let i = 0; i < 10 + 20; i++) { c.hurt(-999); c.tick(1); }
    const pos = c.blazeInfo().pos;
    if (!(pos <= H - 9 && pos >= H - 11)) problems.push("after 30 turns the fire front is at row " + pos + " of " + H + " (expected ~" + (H - 10) + ")");
    const p = c.peek(), hp0 = p.hp;
    if (p.y >= pos) { c.tick(1); if (!(c.peek().hp < hp0)) problems.push("standing in the fire did not hurt"); }
    c.blazeHold(true);
    c.goDepth(back); c.hurt(-999);
    return { problems };
  });
  check(gaunt.problems.length === 0, "gauntlet: " + gaunt.problems.join("; "));

  // Biome 4's boss, the Djinn: the furnace keeps a fire only it moves; Meteor
  // Swarm telegraphs 3–5 unique plus-shaped strikes; Fan the Flames pushes the
  // front 1–4 columns after a 2-turn warning.
  const djinn = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    const back = c.peek().depth;
    c.goDepth(20);
    const dj = c.peek().mlist.find((m) => m.type === "djinn");
    if (!dj) return { problems: ["no djinn on depth 20"] };
    const b0 = c.blazeInfo();
    if (!b0 || !b0.manual) problems.push("the djinn's floor has no fanned fire");
    c.blazeHold(false);
    // stand beside it so it can see you, and make it cast
    const spot = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [dj.x + dx, dj.y + dy]).find(([x, y]) => c.passableAt(x, y));
    if (spot) c.place(spot[0], spot[1]);
    c.setMonsterAt(dj.x, dj.y, { state: "hunting", aware: true, meteorCd: 0, fanCd: 99 });
    let w = null;
    for (let i = 0; i < 4 && !(w && w.kind === "meteor"); i++) { c.hurt(-999); c.tick(1); w = c.bossWindup(); }
    if (!w || w.kind !== "meteor") problems.push("the djinn never began a Meteor Swarm");
    else {
      const keys = new Set(w.centers.map((q) => q.join(",")));
      if (w.centers.length < 3 || w.centers.length > 5) problems.push("Meteor Swarm called " + w.centers.length + " meteors");
      if (keys.size !== w.centers.length) problems.push("two meteors shared a centre");
      c.hurt(-999); c.tick(1);
      if (c.bossWindup() && c.bossWindup().kind === "meteor") problems.push("the Meteor Swarm never landed");
    }
    const dj2 = c.peek().mlist.find((m) => m.type === "djinn");
    const col0 = c.blazeInfo().col;
    c.setMonsterAt(dj2.x, dj2.y, { meteorCd: 99, fanCd: 0, windup: null });
    let fan = null;
    for (let i = 0; i < 3 && !fan; i++) { c.hurt(-999); c.tick(1); const ww = c.bossWindup(); if (ww && ww.kind === "fan") fan = ww; }
    if (!fan) problems.push("the djinn never fanned the flames");
    else {
      for (let i = 0; i < 3; i++) { c.hurt(-999); c.tick(1); }
      const d = c.blazeInfo().col - col0;
      if (d !== fan.k || d < 1 || d > 4) problems.push("Fan the Flames moved the fire " + d + " column(s), expected " + fan.k);
    }
    c.blazeHold(true);
    c.goDepth(back); c.hurt(-999);
    return { problems };
  });
  check(djinn.problems.length === 0, "djinn: " + djinn.problems.join("; "));

  // Boons, Hades-style: three gods per offer, a sworn god always among them,
  // one boon per slot (a new one replaces), upgrades, gated passives/capstones,
  // hooks that fire, and a stress run with every boon at III.
  const boons = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA, problems = [];
    c.regenerate(); c.hurt(-999); c.boonClear();
    const o0 = c.boonOfferPreview();
    if (o0.length !== 3) problems.push("an offer had " + o0.length + " cards");
    if (new Set(o0.map((x) => x.god)).size !== o0.length) problems.push("an offer repeated a god: " + JSON.stringify(o0));
    if (c.boonOfferable("k_ironlaw")) problems.push("a passive was offerable with none of its god's boons");
    c.giveBoon("k_judgement");
    if (!c.boonOfferable("k_ironlaw")) problems.push("a passive was not offerable after taking its god's boon");
    for (let i = 0; i < 25; i++) if (!c.boonOfferPreview().some((x) => x.god === "kethara")) { problems.push("an offer after swearing to Kethara had no Kethara boon"); break; }
    c.giveBoon("m_rot");
    let st = c.boonState();
    if (st.lv.k_judgement) problems.push("taking a second Attack boon did not replace the first");
    if (st.slots.attack !== "m_rot") problems.push("the attack slot is " + st.slots.attack);
    c.giveBoon("m_rot"); st = c.boonState();
    if (st.lv.m_rot !== 2) problems.push("taking a held boon again did not upgrade it (lv " + st.lv.m_rot + ")");
    if (c.boonOfferable("second_chance")) problems.push("a capstone was offerable with one Maelon boon");
    c.giveBoon("grace"); c.giveBoon("m_fester");
    if (!c.boonOfferable("second_chance")) problems.push("the Maelon capstone was not offerable with three Maelon boons");
    // hooks: Rotting Touch poisons, Rebuke binds, Emergency Kit heals below 20%
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    const p = c.peek();
    const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => c.passableAt(p.x + dx, p.y + dy));
    if (side) {
      const [dx, dy] = side, rx = p.x + dx, ry = p.y + dy;
      c.spawnMonsterAt("rat", rx, ry); c.setMonsterAt(rx, ry, { hp: 999, maxHp: 999 });   // a hit that kills never poisons
      let poisoned = false;
      for (let i = 0; i < 20 && !poisoned; i++) { c.hurt(-999); c.step(dx, dy); const r = c.peek().mlist.find((m) => m.type === "rat"); if (!r) break; poisoned = r.dots.some((d) => d.tag === "poison"); }
      if (!poisoned) problems.push("Rotting Touch never poisoned the rat");
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    }
    c.boonClear(); c.giveBoon("g_kit");
    const mx = c.peek().maxHp;
    c.hurt(c.peek().hp - Math.max(1, Math.floor(mx * 0.1)));
    const low = c.peek().hp; c.tick(1);
    if (!(c.peek().hp > low)) problems.push("Emergency Kit did not heal below 20% HP");
    // stress: every boon at III, a crowd, many turns — no errors, and the game goes on
    c.boonClear(); c.boonGrantAll();
    for (let f = 0; f < 3; f++) {
      c.regenerate(); c.hurt(-999);
      const q = c.peek();
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]]) if (c.passableAt(q.x + ddx, q.y + ddy)) c.spawnMonsterAt(["rat", "bat", "snake"][f % 3], q.x + ddx, q.y + ddy);
      for (let t = 0; t < 80; t++) {
        c.hurt(-999);
        if (t % 17 === 0) c.hurt(c.peek().hp - Math.max(1, Math.floor(c.peek().maxHp * 0.1)));
        const mm = c.peek().mlist.find((m) => Math.max(Math.abs(m.x - c.peek().x), Math.abs(m.y - c.peek().y)) === 1);
        if (mm) c.step(Math.sign(mm.x - c.peek().x), Math.sign(mm.y - c.peek().y));
        else { const dd = [[1, 0], [-1, 0], [0, 1], [0, -1]][t % 4]; if (!c.step(dd[0], dd[1])) c.tick(1); }
      }
    }
    c.boonClear(); c.hurt(-999);
    return { problems };
  });
  check(boons.problems.length === 0, "boons: " + boons.problems.join("; "));

  // Branch skill trees: a node opens by points spent in its branch, a capstone
  // pair allows one, and every node of each class can be learned and every
  // active fired on a crowd without an error.
  const trees = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA, problems = [];
    for (const cls of Object.keys(D.classes)) {
      const C = D.classes[cls];
      if (!Array.isArray(C.branches) || !C.branches.length) continue;
      c.setClass(cls); c.regenerate(); c.hurt(-999);
      const nodes = C.skillTree, br = C.branches[C.branches.length - 1].id;
      const inB = nodes.filter((n) => n.branch === br).sort((a, b) => a.bt - b.bt);
      const t3 = inB.find((n) => n.bt === 3), caps = inB.filter((n) => n.cap);
      c.grant(60);
      c.learn(t3.id);
      if (c.skillState()[t3.id].rank) problems.push(cls + ": " + t3.id + " was learned with no points in its branch");
      const gate = c.branchGate()[4];
      let probed = false;
      for (const n of inB.filter((x) => !x.cap)) for (let r = 0; r < n.ranks.length; r++) {
        if (!probed && c.branchPoints(br) === gate - 1) {
          probed = true;
          c.learn(caps[0].id);
          if (c.skillState()[caps[0].id].rank) problems.push(cls + ": capstone learned at " + (gate - 1) + " points, one short of the gate");
        }
        c.learn(n.id);
      }
      if (c.branchPoints(br) < gate) problems.push(cls + ": only " + c.branchPoints(br) + " points fit in " + br + " before its capstone");
      c.learn(caps[0].id); c.learn(caps[1].id);
      const ss = c.skillState();
      if (!ss[caps[0].id].rank) problems.push(cls + ": capstone " + caps[0].id + " could not be learned at 9 points");
      if (ss[caps[1].id].rank) problems.push(cls + ": both capstones of a pair were learned");
      // A whole run's 37 points, spent branch by branch, buy at most two capstones.
      c.setClass(cls); c.grant(37);
      for (const b of C.branches) {
        const bn = nodes.filter((n) => n.branch === b.id);
        for (const n of bn.filter((x) => !x.cap)) for (let r = 0; r < n.ranks.length; r++) c.learn(n.id);
        c.learn(bn.find((x) => x.cap).id);
      }
      const capsHeld = nodes.filter((n) => n.cap && c.skillState()[n.id] && c.skillState()[n.id].rank).length;
      if (capsHeld > 2) problems.push(cls + ": 37 points bought " + capsHeld + " capstones");
      if (capsHeld < 1) problems.push(cls + ": 37 points bought no capstone at all");
      // everything else, then fire every active on a crowd
      c.grant(200);
      for (let pass = 0; pass < 4; pass++) for (const n of nodes) c.learn(n.id);
      const q = c.peek();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, -1]]) if (c.passableAt(q.x + dx, q.y + dy)) c.spawnMonsterAt("rat", q.x + dx, q.y + dy);
      for (const n of nodes) {
        if (n.kind === "passive") continue;
        c.resetCds(); c.hurt(-999);
        c.doSkill(n.id);
        if (c.pendingSkill()) {
          const m = c.peek().mlist.find((mm) => Math.max(Math.abs(mm.x - c.peek().x), Math.abs(mm.y - c.peek().y)) <= 2) || c.peek().mlist[0];
          if (m) c.tapAt(m.x, m.y); else c.tapAt(c.peek().x + 2, c.peek().y);
        }
        for (let i = 0; i < 3; i++) { c.hurt(-999); c.tick(1); }
      }
      for (let t = 0; t < 30; t++) { c.hurt(-999); c.tick(1); }
    }
    c.setClass("warrior"); c.regenerate(); c.hurt(-999);
    return { problems };
  });
  check(trees.problems.length === 0, "trees: " + trees.problems.join("; "));

  // ToneTum's new spells, one at a time, on a quiet floor.
  const tone = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    const fresh = () => {
      c.setClass("mage"); c.regenerate(); c.hurt(-999);
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
      for (let i = 0; i < 5 && c.boonChoices().length; i++) c.pickBoonAt(0);   // the kills can level you into an offer
      c.boonClear();
      c.grant(80);
    };
    const free1 = (dist) => {
      const p = c.peek();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = p.x + dx * dist, y = p.y + dy * dist;
        let ok = true;
        // walkable AND in sight: a bush or tall grass in the line blocks the cast
        for (let i = 1; i <= dist; i++) if (!c.passableAt(p.x + dx * i, p.y + dy * i) || !c.visibleAt(p.x + dx * i, p.y + dy * i)) ok = false;
        if (ok) return { x, y, dx, dy };
      }
      return null;
    };
    // A cramped start (a corridor, a corner) can have no open line at all; reroll
    // the floor rather than fail — skills and cooldown state survive a regenerate.
    const free = (dist) => {
      let r = free1(dist);
      for (let i = 0; i < 8 && !r; i++) { c.regenerate(); c.hurt(-999); for (const m of c.peek().mlist) c.killAt(m.x, m.y); r = free1(dist); }
      return r;
    };
    const learnN = (id, n) => { for (let i = 0; i < n; i++) c.learn(id); };
    fresh();
    learnN("ward", 5); learnN("counterspell", 5); learnN("sanctum", 5);
    // Counterspell breaks a wind-up
    let s = free(2);
    c.spawnMonsterAt("rat", s.x, s.y); c.setWindup(s.x, s.y);
    c.resetCds(); c.doSkill("counterspell");
    const m1 = c.peek().mlist.find((m) => m.x === s.x && m.y === s.y);
    if (!m1 || m1.windup) problems.push("counterspell did not break a wind-up");
    if (!m1 || m1.stun < 1) problems.push("counterspell rank 3 did not stun the caster");
    c.killAt(s.x, s.y);
    // Sanctum repels and keeps out
    s = free(1);
    c.spawnMonsterAt("rat", s.x, s.y);
    c.resetCds(); c.doSkill("sanctum");
    const inside = () => c.peek().mlist.some((m) => Math.abs(m.x - c.toneState().sanctum.x) <= 1 && Math.abs(m.y - c.toneState().sanctum.y) <= 1);
    if (!c.toneState().sanctum) problems.push("sanctum did not rise");
    else if (inside()) problems.push("sanctum left a foe inside it");
    for (let t = 0; t < 5 && c.toneState().sanctum; t++) { c.hurt(-999); c.tick(1); if (c.toneState().sanctum && inside()) { problems.push("a foe walked into the sanctum"); break; } }
    for (let t = 0; t < 8; t++) { c.hurt(-999); c.tick(1); }
    if (c.toneState().sanctum) problems.push("sanctum never faded");
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    // Banishment (abjuration capstone, 9 points in)
    c.learn("banishment");
    s = free(2);
    c.spawnMonsterAt("rat", s.x, s.y);
    c.resetCds(); c.doSkill("banishment"); c.tapAt(s.x, s.y);
    if (c.peek().mlist.length || c.toneState().banished.length !== 1) problems.push("banishment did not lift the foe off the board");
    for (let t = 0; t < 12; t++) { c.hurt(-999); c.tick(1); }
    if (c.toneState().banished.length || c.peek().mlist.length !== 1) problems.push("the banished foe did not come back");
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    // Portal: step off one end and back on, come out the other
    fresh();
    learnN("blink", 5); learnN("portal", 5); learnN("mirror_image", 5); c.learn("legion");
    s = free(3);
    const start = { x: c.peek().x, y: c.peek().y };
    c.resetCds(); c.doSkill("portal"); c.tapAt(s.x, s.y);
    if (!c.toneState().portal) problems.push("portal did not open");
    else {
      const back = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => c.passableAt(start.x + dx, start.y + dy) && !(start.x + dx === s.x && start.y + dy === s.y));
      c.step(back[0], back[1]); c.step(-back[0], -back[1]);
      if (c.peek().x !== s.x || c.peek().y !== s.y) problems.push("walking into a portal did not come out of the other end");
    }
    // Legion: three images
    c.place(start.x, start.y);
    c.resetCds(); c.doSkill("mirror_image");
    if (c.decoys().length < 3 && [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].filter(([dx, dy]) => c.passableAt(start.x + dx, start.y + dy)).length >= 3) problems.push("Legion did not make three images (" + c.decoys().length + ")");
    // Rewind and Time Loop
    fresh();
    learnN("frost_nova", 5); learnN("foresight", 5); learnN("rewind", 5); c.learn("time_loop");
    c.regenerate(); c.hurt(-999);
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    for (let i = 0; i < 5 && c.boonChoices().length; i++) c.pickBoonAt(0);
    if (c.toneState().foresight < 3) problems.push("Foresight did not stock 3 free misses on a new floor");
    const p0 = { x: c.peek().x, y: c.peek().y };
    for (let t = 0; t < 6; t++) c.tick(1);
    s = free(2);
    c.place(s.x, s.y);
    for (let t = 0; t < 3; t++) c.tick(1);
    c.hurt(c.peek().hp - 5);
    const hpLow = c.peek().hp;
    c.resetCds(); c.doSkill("rewind");
    if (c.peek().x !== p0.x || c.peek().y !== p0.y) problems.push("rewind did not return to where you stood 5 turns ago");
    if (c.peek().hp <= hpLow) problems.push("rewind did not restore the health you had");
    for (let t = 0; t < 12; t++) c.tick(1);
    c.hurt(9999);
    if (c.peek().hp <= 0 || !c.toneState().timeLoopUsed) problems.push("Time Loop did not undo a death");
    // Stop Time (the other capstone), on a fresh tree
    fresh();
    learnN("frost_nova", 5); learnN("foresight", 5); learnN("rewind", 5); c.learn("stop_time");
    c.resetCds(); c.doSkill("stop_time");
    if (c.toneState().freeze < 3) problems.push("Stop Time did not freeze the world for 3 turns");
    // Crimson Bands (conjuration capstone)
    learnN("blink", 5); learnN("portal", 5); learnN("mirror_image", 5); c.learn("crimson_bands");
    s = free(2);
    c.spawnMonsterAt("rat", s.x, s.y);
    c.resetCds(); c.doSkill("crimson_bands"); c.tapAt(s.x, s.y);
    const m2 = c.peek().mlist.find((m) => m.x === s.x && m.y === s.y);
    if (!m2 || m2.stun < 2) problems.push("Crimson Bands did not bind");
    for (let t = 0; t < 8; t++) c.tick(1);
    c.setClass("warrior"); c.regenerate(); c.hurt(-999);
    return { problems };
  });
  check(tone.problems.length === 0, "tonetum: " + tone.problems.join("; "));

  // Sera's new tree: Modulate moves a note, Dirge poisons, Last Rites heals and
  // resets, Danse Macabre turns a note's kill into a note, Wake lifts Death's Door.
  const sera = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    const fresh = () => {
      c.setClass("bard"); c.regenerate(); c.hurt(-999);
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
      for (let i = 0; i < 5 && c.boonChoices().length; i++) c.pickBoonAt(0);
      c.boonClear();
      c.grant(80);
    };
    // a tile `dist` out along an open line, and its mirror on the other side if open
    const lines = (dist) => {
      const p = c.peek(), out = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        let ok = true;
        for (let i = 1; i <= dist; i++) if (!c.passableAt(p.x + dx * i, p.y + dy * i) || !c.visibleAt(p.x + dx * i, p.y + dy * i)) ok = false;
        if (ok) out.push({ x: p.x + dx * dist, y: p.y + dy * dist, dx, dy });
      }
      return out;
    };
    const learnN = (id, n) => { for (let i = 0; i < n; i++) c.learn(id); };
    const cast = (id, x, y) => { c.resetCds(); c.hurt(-999); c.doSkill(id); if (c.pendingSkill()) c.tapAt(x, y); };
    fresh();
    learnN("counterpoint", 5); learnN("carrying_tone", 5); learnN("modulate", 5);
    let L = lines(3);
    if (L.length < 2) { c.regenerate(); L = lines(2); }
    if (L.length >= 2) {
      cast("sharp_note", L[0].x, L[0].y);
      for (let t = 0; t < 2; t++) c.tick(1);
      const before = c.notes()[0];
      const tBefore = c.turns();
      cast("modulate", L[1].x, L[1].y);
      const after = c.notes()[0];
      if (!after || after.x !== L[1].x || after.y !== L[1].y) problems.push("Modulate did not move the note");
      else if (after.age !== before.age) problems.push("Modulate did not keep the note's age");
      if (c.turns() - tBefore >= 1) problems.push("Modulate rank 3 took time");
    } else problems.push("no two open lines for the Modulate check");
    // Dirge, Last Rites, Danse Macabre
    fresh();
    learnN("dirge", 5); learnN("last_rites", 5); learnN("ballad", 5); c.learn("danse_macabre");
    L = lines(4);
    for (let i = 0; i < 5 && !L.length; i++) { c.regenerate(); c.hurt(-999); for (const m of c.peek().mlist) c.killAt(m.x, m.y); L = lines(4); }
    if (L.length) {
      const a = { x: L[0].x - L[0].dx, y: L[0].y - L[0].dy, dx: L[0].dx, dy: L[0].dy };   // the note 3 out, the target at 4
      cast("dirge", a.x, a.y);
      const rx = a.x + a.dx, ry = a.y + a.dy;
      if (c.spawnMonsterAt("rat", rx, ry) || c.peek().mlist.some((m) => m.x === rx && m.y === ry)) {
        c.setMonsterAt(rx, ry, { hp: 500, maxHp: 500, atkMin: 0, atkMax: 0 });
        for (let t = 0; t < 2; t++) { c.hurt(-999); c.tick(1); }
        const r = c.peek().mlist.find((m) => m.type === "rat");
        if (!r || !r.dots.some((d) => d.tag === "poison")) problems.push("Dirge did not poison a foe in range");
        const pd = r && r.dots.find((d) => d.tag === "poison");
        for (let t = 0; t < 4; t++) { c.hurt(-999); c.tick(1); }
        const r2 = c.peek().mlist.find((m) => m.type === "rat"), pd2 = r2 && r2.dots.find((d) => d.tag === "poison");
        if (pd && pd2 && pd2.dmg > pd.dmg + 2) problems.push("Dirge's poison stacked instead of topping up (" + pd.dmg + " → " + pd2.dmg + ")");
        // Last Rites: kill it beside the note while hurt
        c.hurt(-999); c.hurt(c.peek().hp - 5);
        const hp0 = c.peek().hp, n0 = c.notes()[0];
        if (r2) c.killAt(r2.x, r2.y);
        if (c.peek().hp <= hp0) problems.push("Last Rites did not heal on a kill beside a note");
        const n1 = c.notes().find((n) => n.x === n0.x && n.y === n0.y);
        if (!n1 || n1.turns < n0.turns) problems.push("Last Rites did not reset the note");
      } else problems.push("no room for the Dirge target");
    }
    // Danse Macabre: a sharp note kills a 1-HP rat and a note rises in its place
    fresh();
    learnN("dirge", 5); learnN("last_rites", 5); learnN("ballad", 5); c.learn("danse_macabre");
    L = lines(3);
    if (L.length) {
      const a = L[0], rx = a.x + a.dx, ry = a.y + a.dy;
      cast("sharp_note", a.x, a.y);
      if (c.spawnMonsterAt("rat", rx, ry)) {
        c.setMonsterAt(rx, ry, { hp: 1, maxHp: 1, atkMin: 0, atkMax: 0, state: "SLEEPING" });
        for (let t = 0; t < 2; t++) { c.hurt(-999); c.tick(1); }
        if (!c.notes().some((n) => n.danse)) problems.push("Danse Macabre did not raise a note from a note's kill");
      }
    }
    // Wake: 30% while a note rings, 20% otherwise
    fresh();
    learnN("dirge", 5); learnN("last_rites", 5); learnN("ballad", 5); c.learn("wake");
    if (c.doorThreshold() !== 0.2) problems.push("Wake raised Death's Door with no note ringing");
    L = lines(3);
    if (L.length) { cast("sharp_note", L[0].x, L[0].y); if (Math.abs(c.doorThreshold() - 0.3) > 1e-9) problems.push("Wake did not lift Death's Door to 30% while a note rings"); }
    c.setClass("warrior"); c.regenerate(); c.hurt(-999);
    return { problems };
  });
  check(sera.problems.length === 0, "sera: " + sera.problems.join("; "));

  // The gods' weapon enchants: each one, fired with its proc forced, leaves the
  // mark it promises; bosses are never maddened or terrified; and a gold weapon
  // rolls its two from the weapon pool.
  const ench = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA, problems = [];
    c.setClass("warrior"); c.regenerate(); c.hurt(-999);
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    for (let i = 0; i < 5 && c.boonChoices().length; i++) c.pickBoonAt(0);
    c.boonClear();
    const E = D.loot.enchants;
    const weaponEnch = Object.keys(E).filter((k) => (E[k].slots || []).indexOf("weapon") >= 0);
    if (weaponEnch.length !== 12) problems.push("expected 12 weapon enchants, found " + weaponEnch.length);
    for (const g of ["kethara", "auvris", "maelon", "ourn", "label", "guild"])
      if (weaponEnch.filter((k) => E[k].god === g).length !== 2) problems.push(g + " does not have exactly two weapon enchants");
    const sword = Object.keys(D.gear).find((k) => D.gear[k].cat === "weapon" && (D.gear[k].tier || 1) === 3) || Object.keys(D.gear).find((k) => D.gear[k].cat === "weapon");
    const p = c.peek();
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => [p.x + dx, p.y + dy]).filter(([x, y]) => c.passableAt(x, y));
    if (spots.length < 2) return { problems: problems.concat(["no room beside the start for the enchant checks"]) };
    const [ax, ay] = spots[0], [bx, by] = spots[1];
    const fresh = () => {
      for (const m of c.peek().mlist) c.killAt(m.x, m.y);
      c.spawnMonsterAt("rat", ax, ay); c.spawnMonsterAt("rat", bx, by);
      c.setMonsterAt(ax, ay, { hp: 999, maxHp: 999, atkMin: 0, atkMax: 0, stun: 0, chill: 0, berserk: 0, fleeing: 0, dots: [] });
      c.setMonsterAt(bx, by, { hp: 999, maxHp: 999, atkMin: 0, atkMax: 0 });
    };
    const at = (x, y) => c.peek().mlist.find((m) => m.x === x && m.y === y);
    const check1 = (key, test) => {
      fresh(); c.hurt(-999); c.hurt(c.peek().hp - 5);
      const before = { a: at(ax, ay), b: at(bx, by), hp: c.peek().hp, haste: c.hasteBuff(), crit: c.critChance(), plants: c.plantList().length };
      c.wieldEnchanted(sword, [key]);
      if (key === "keen") { if (!(c.critChance() > before.crit)) problems.push("Keen did not raise crit chance"); return; }
      c.procAt(ax, ay);
      const msg = test(before, { a: at(ax, ay), b: at(bx, by), hp: c.peek().hp, haste: c.hasteBuff(), plants: c.plantList().length });
      if (msg) problems.push(key + ": " + msg);
    };
    check1("binding", (b, a) => (a.a && a.a.stun >= 2 ? null : "the foe was not Bound for 2 turns"));
    check1("judging", (b, a) => (a.a && a.a.hp === 999 ? null : "hurt a foe that was not Bound"));
    fresh(); c.setMonsterAt(ax, ay, { stun: 3 }); c.wieldEnchanted(sword, ["judging"]); c.procAt(ax, ay);
    if (!(at(ax, ay) && at(ax, ay).hp < 999)) problems.push("judging: did not hurt a Bound foe");
    check1("wild", (b, a) => (a.a && (a.a.hp < 999 || a.a.chill > 0 || a.a.dots.length) || a.plants > b.plants ? null : "nothing happened"));
    check1("stormcalled", (b, a) => (a.b && a.b.hp < 999 ? null : "lightning did not reach the second foe"));
    check1("rotting", (b, a) => (a.a && a.a.dots.some((d) => d.tag === "poison") ? null : "no poison"));
    check1("vampiric", (b, a) => (a.hp > b.hp ? null : "no healing"));
    check1("chilling", (b, a) => (a.a && a.a.chill > 0 ? null : "no chill"));
    check1("hastening", (b, a) => (a.haste > 0 ? null : "no haste"));
    check1("maddening", (b, a) => (a.a && a.a.berserk > 0 ? null : "not berserk"));
    check1("dreadful", (b, a) => (a.a && a.a.fleeing > 0 ? null : "not fleeing"));
    check1("tempered", (b, a) => (a.a && a.a.hp < 999 ? null : "no extra damage"));
    check1("keen", () => null);
    // bosses shrug off the Label
    fresh(); c.setMonsterAt(ax, ay, { boss: true }); c.wieldEnchanted(sword, ["maddening", "dreadful"]); c.procAt(ax, ay);
    const bs = at(ax, ay);
    if (bs && (bs.berserk > 0 || bs.fleeing > 0)) problems.push("a boss was maddened or terrified");
    fresh(); c.setMonsterAt(ax, ay, { boss: false });
    // the card names the god
    if (!/Kethara/.test(c.enchantText(sword, ["binding"]))) problems.push("the card does not name the enchant's god: " + c.enchantText(sword, ["binding"]));
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    c.setClass("warrior"); c.regenerate(); c.hurt(-999);
    return { problems };
  });
  check(ench.problems.length === 0, "enchants: " + ench.problems.join("; "));

  // A statue stands guard until it is struck; and every Bind lasts at least two
  // turns, bosses included — Rush's too.
  const guard = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    c.setClass("warrior"); c.regenerate(); c.hurt(-999);
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    for (let i = 0; i < 5 && c.boonChoices().length; i++) c.pickBoonAt(0);
    c.boonClear();
    const p = c.peek();
    const line = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [1, 2, 3].every((i) => c.passableAt(p.x + dx * i, p.y + dy * i) && c.visibleAt(p.x + dx * i, p.y + dy * i)));
    if (!line) return { problems: ["no open line from the start for the statue / bind checks"] };
    const [dx, dy] = line, sx = p.x + dx * 2, sy = p.y + dy * 2;
    // statue
    c.spawnStatueAt(sx, sy);
    const hp0 = c.peek().hp;
    for (let t = 0; t < 10; t++) c.tick(1);
    const st = c.peek().mlist.find((m) => m.type === "animated_statue");
    if (!st) problems.push("the statue did not spawn");
    else {
      if (st.x !== sx || st.y !== sy) problems.push("a statue left its post before it was struck");
      if (c.peek().hp < hp0) problems.push("a statue attacked before it was struck");
      c.setMonsterAt(st.x, st.y, { hp: st.maxHp - 1 });
      c.tick(1);
      const st2 = c.peek().mlist.find((m) => m.type === "animated_statue");
      if (!st2 || st2.state !== "hunting") problems.push("a struck statue did not wake (" + (st2 && st2.state) + ")");
      c.killAt(st2 ? st2.x : sx, st2 ? st2.y : sy);
    }
    // the Bind floor: a rat and a boss both held 2
    c.spawnMonsterAt("rat", sx, sy);
    if ((c.bindAt(sx, sy, 1) || 0) < 2) problems.push("a 1-turn Bind held a foe for less than 2");
    c.setMonsterAt(sx, sy, { boss: true, stun: 0 });
    if ((c.bindAt(sx, sy, 1) || 0) < 2) problems.push("a Bind held a boss for less than 2");
    c.setMonsterAt(sx, sy, { boss: false, stun: 0, hp: 999, maxHp: 999 });
    // Rush: after its own turn the foe must still be held (2 applied, 1 spent)
    c.killAt(sx, sy); c.spawnMonsterAt("rat", p.x + dx * 3, p.y + dy * 3);
    c.setMonsterAt(p.x + dx * 3, p.y + dy * 3, { hp: 999, maxHp: 999, atkMin: 0, atkMax: 0 });
    c.grant(5); c.learn("rush"); c.resetCds(); c.hurt(-999);
    c.doSkill("rush"); c.tapAt(p.x + dx, p.y + dy);
    const r = c.peek().mlist.find((m) => m.type === "rat");
    if (!r || !(r.stun >= 1)) problems.push("Rush did not leave its target Bound past its own turn (stun " + (r && r.stun) + ")");
    for (const m of c.peek().mlist) c.killAt(m.x, m.y);
    c.setClass("warrior"); c.regenerate(); c.hurt(-999);
    return { problems };
  });
  check(guard.problems.length === 0, "statue/bind: " + guard.problems.join("; "));

  // The forest's woodcutter's cottage (in place of the Study) and pantry (in place
  // of the Library): no bookshelves in the forest, the table's loot is reachable,
  // and every decor sprite actually loads.
  const cottage = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    let sawCottage = false, sawPantry = false, forestBooks = 0;
    for (let t = 0; t < 80 && !(sawCottage && sawPantry); t++) {
      c.goDepth(1 + (t % 4)); c.hurt(-999);
      const f = c.spdFloor(); if (!f) continue;
      const names = f.rooms.map((r) => r.name);
      if (names.includes("Study") || names.includes("Library")) forestBooks++;
      const dl = c.decorList();
      for (const d of dl) for (const n of [d.wall, d.floor, d.prop]) if (n && !c.spriteLoaded(n)) problems.push("decor sprite " + n + " did not load");
      for (const d of dl) if (d.prop && d.tile !== 13 && d.tile !== 15) problems.push("a " + d.prop + " prop sits on walkable ground (tile " + d.tile + ")");
      if (names.includes("Cottage")) {
        sawCottage = true;
        const tables = dl.filter((d) => d.prop === "cottage_table");
        if (!tables.length) problems.push("a cottage has no table");
        for (const tb of tables) if (!c.reach(tb.x, tb.y)) problems.push("a cottage table at " + tb.x + "," + tb.y + " cannot be reached");
      }
      if (names.includes("Pantry")) {
        sawPantry = true;
        if (!dl.some((d) => d.prop === "pantry_shelf")) problems.push("a pantry has no shelves");
      }
    }
    if (forestBooks) problems.push(forestBooks + " forest floor(s) still rolled a Study or Library");
    if (!sawCottage) problems.push("no cottage appeared in 80 forest floors");
    if (!c.spriteLoaded("bookshelf")) problems.push("the shared bookshelf sprite did not load");
    c.goDepth(1); c.hurt(-999);
    return { problems: Array.from(new Set(problems)), sawPantry };
  });
  check(cottage.problems.length === 0, "cottage: " + cottage.problems.join("; "));

  // SPD's bags: seeds go to the Velvet Pouch you start with; a bag bought later
  // takes its category out of the backpack, and new ones go straight into it.
  const bags = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA, problems = [];
    const seed = Object.keys(D.consumables).find((k) => D.consumables[k].cat === "seed");
    const potion = Object.keys(D.consumables).find((k) => D.consumables[k].cat === "potion" && !D.consumables[k].noDrop);
    if (!c.bags().bag_seed) problems.push("the run did not start with the Velvet Pouch");
    c.give(seed);
    if (!(c.bags().bag_seed || []).some((e) => e.key === seed)) problems.push("a seed did not go into the pouch");
    if (c.peek().inv.includes(seed)) problems.push("a seed landed in the backpack while the pouch had room");
    c.give(potion);
    if (!c.peek().inv.includes(potion)) problems.push("with no bandolier, a potion did not go in the backpack");
    c.giveBag("bag_potion");
    if (c.peek().inv.includes(potion)) problems.push("buying the bandolier did not move the potion out of the backpack");
    if (!(c.bags().bag_potion || []).some((e) => e.key === potion)) problems.push("the bandolier does not hold the potion");
    return { problems };
  });
  check(bags.problems.length === 0, "bags: " + bags.problems.join("; "));

  // A chasm asks before it takes you, and a plant goes off when trodden on.
  const terrain = await page.evaluate(() => {
    const c = window.cantori, problems = [];
    c.regenerate(); c.hurt(-999);
    const p = c.peek();
    const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => c.passableAt(p.x + dx, p.y + dy) && !c.peek().mlist.some((m) => m.x === p.x + dx && m.y === p.y + dy));
    if (!side) return { problems: ["no free tile beside the start for the terrain checks"] };
    const [dx, dy] = side, tx = p.x + dx, ty = p.y + dy;
    c.setTerrain(tx, ty, "CHASM");
    c.step(dx, dy);
    if (!c.confirmUp()) problems.push("walking into a chasm did not ask first");
    if (c.peek().depth !== p.depth) problems.push("walking into a chasm dropped you without asking");
    c.closeConfirm();
    c.setTerrain(tx, ty, "FLOOR");
    c.plantHere("sungrass", tx, ty);
    c.hurt(5);
    c.step(dx, dy);
    if (c.plantList().some((q) => q.x === tx && q.y === ty)) problems.push("stepping on a Sungrass did not set it off");
    return { problems };
  });
  check(terrain.problems.length === 0, "terrain: " + terrain.problems.join("; "));

  // C4: identification costs loot.identifyXp x the item's TIER, and nothing else.
  // Rarity and drop depth must not enter into it — they used to, and a price the
  // player cannot read is the reason the progress bar stopped meaning anything.
  const idCost = await page.evaluate(() => {
    const c = window.cantori, D = window.CANTORI_DATA;
    const unit = D.loot.identifyXp != null ? D.loot.identifyXp : 20;
    const bad = [];
    for (const k of Object.keys(D.gear)) {
      if (D.gear[k].noDrop) continue;
      const tier = D.gear[k].tier || 1;
      for (let t = 0; t < 12; t++) {
        const before = c.peek().invItems.filter((x) => x.key === k).length;
        c.give(k);
        const mine = c.peek().invItems.filter((x) => x.key === k);
        if (mine.length <= before) break;        // 25-slot inventory is full; stop, do not read a stale entry
        const it = mine[mine.length - 1];
        if (it.identified === false && it.idNeed !== unit * tier) {
          bad.push(`${k} (tier ${tier}, ${it.rarity}): idNeed ${it.idNeed}, expected ${unit * tier}`);
          break;
        }
      }
    }
    return bad;
  });
  check(idCost.length === 0, `identification cost is not identifyXp x tier: ${idCost.slice(0, 3).join("; ")}`);

  let spdFloors = 0, spdSpecials = 0, spdPlants = 0;
  // Biome 4's chasing fire is its own test below; here it is held, or the AI
  // churn (which stands the player still for many turns) would burn to death.
  await page.evaluate(() => window.cantori.blazeHold(true));
  for (let d = 1; d <= DEPTHS; d++) {
    const state = await page.evaluate(() => window.cantori.peek());

    if (state.inShop) {                       // merchant floor: one room, nothing to prove
      await page.evaluate(() => window.cantori.descend());
      d--;                                    // the merchant sits between depths
      continue;
    }

    for (let i = 0; i < ITERATIONS; i++) {
      const r = await page.evaluate((bosses) => {
        window.cantori.regenerate();
        const s = window.cantori.peek();
        const stairs = window.cantori.stairsAt();
        const boss = s.mlist.find((m) => bosses.indexOf(m.type) >= 0) || null;
        const data = window.CANTORI_DATA.monsters;
        return {
          depth: s.depth, bossActive: s.bossActive, monsters: s.monsters, biome: s.biome,
          stairs, boss,
          stairsReachable: stairs ? window.cantori.reach(stairs.x, stairs.y) : false,
          bossReachable: boss ? window.cantori.reach(boss.x, boss.y) : false,
          // Deep water blocks ground movement, so nothing that walks may be standing
          // in it, and the start tile must not have been painted over.
          startStuck: !window.cantori.passableAt(s.x, s.y),
          drowning: s.mlist.filter((m) => !(data[m.type] && data[m.type].flying) && !window.cantori.passableAt(m.x, m.y))
            .map((m) => `${m.type} at ${m.x},${m.y}`),
          // SPD floors: every locked door needs an iron key lying somewhere you can
          // walk to without opening any locked door first.
          spd: (() => {
            const f = window.cantori.spdFloor();
            if (!f) return null;
            return { specials: f.rooms.filter((q) => q.kind === "special").length, locked: f.lockedDoors.length, plants: window.cantori.plantList().length,
                     keys: f.keysOnFloor.length, keysReachable: f.keysOnFloor.every((k) => window.cantori.reach(k.x, k.y)) };
          })(),
        };
      }, bossKeys);

      const at = `depth ${r.depth} (${r.biome}) iter ${i + 1}`;

      check(!r.startStuck, `${at}: the player starts on a tile they can't stand on`);
      check(r.drowning.length === 0, `${at}: ground monster spawned in deep water — ${r.drowning.join(", ")}`);

      if (r.bossActive) {
        check(!!r.boss, `${at}: boss floor spawned no boss`);
        if (r.boss) check(r.bossReachable, `${at}: boss at ${r.boss.x},${r.boss.y} is unreachable on foot`);
      } else {
        check(!!r.stairs, `${at}: no stairs on the floor`);
        if (r.stairs) check(r.stairsReachable, `${at}: stairs at ${r.stairs.x},${r.stairs.y} are unreachable on foot`);
        check(r.monsters > 0, `${at}: no monsters spawned`);
        if (r.spd) {
          spdFloors++; spdSpecials += r.spd.specials; spdPlants += r.spd.plants;
          check(r.spd.keys >= r.spd.locked, `${at}: ${r.spd.locked} locked door(s) but only ${r.spd.keys} iron key(s) on the floor`);
          check(r.spd.keysReachable, `${at}: an iron key lies somewhere you cannot walk to`);
        }
      }
    }

    // Run the world forward: monster AI, boss playbooks, traps, damage over time.
    // Keep the player alive so a death doesn't cut the sweep short.
    //
    // Every turn also checks the path each monster actually walked. A monster
    // may only ever step to a neighbouring tile, and the renderer draws whatever
    // tiles it reports — so a chain with a gap in it is a monster teleporting
    // through a wall, a bush or the player, whatever the animation does with it.
    const teleports = await page.evaluate((turns) => {
      const bad = [];
      const adj = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;
      for (let t = 0; t < turns; t++) {
        if (t % 5 === 0) window.cantori.hurt(-500);   // top up HP; negative damage heals
        // Plant a trail a couple of tiles off every few turns. The player never
        // moves here, so monsters would otherwise only ever chase or patrol —
        // and the hunt→arrive→search handover is exactly where movement used to
        // spill two tiles into one action.
        if (t % 3 === 0) {
          const ms = window.cantori.peek().mlist;
          for (let i = 0; i < ms.length; i++) {
            const dx = (i % 3) - 1, dy = ((i / 3) | 0) % 3 - 1;
            window.cantori.forceAware(i, ms[i].x + dx * 2, ms[i].y + dy * 2);
          }
        }
        for (const p of window.cantori.tickPaths()) {
          if (p.charge || p.boss || p.teleported) continue;   // these move in ways that set their own animation (a Fadeleaf teleports)
          if (p.legs.length > p.acts) {
            bad.push(`${p.type} moved ${p.legs.length} tiles in ${p.acts} action(s)`);
            continue;
          }
          const chain = [p.from].concat(p.legs);
          if (!p.legs.length) {
            if (adj(p.from, p.to) || (p.from[0] === p.to[0] && p.from[1] === p.to[1])) continue;
            bad.push(`${p.type} jumped ${p.from} → ${p.to} with no path recorded`);
            continue;
          }
          for (let i = 1; i < chain.length; i++) {
            if (!adj(chain[i - 1], chain[i])) { bad.push(`${p.type} skipped from ${chain[i - 1]} to ${chain[i]}`); break; }
          }
          const last = chain[chain.length - 1];
          if (last[0] !== p.to[0] || last[1] !== p.to[1]) bad.push(`${p.type} ended at ${p.to} but its path ends at ${last}`);
        }
        if (bad.length > 4) break;
      }
      return bad;
    }, TURNS);
    for (const t of teleports) check(false, `depth ${d}: ${t}`);

    const after = await page.evaluate(() => window.cantori.peek());
    check(after.hp > 0, `depth ${d}: player died during the AI churn`);

    if (d < DEPTHS) await page.evaluate(() => window.cantori.descend());
  }

  for (const e of errors) check(false, e);

  await browser.close();
  server.close();

  // The SPD builder must actually be the thing making ordinary floors — a silent
  // fall back to the old generator would pass every check above.
  check(spdFloors > 0, "no ordinary floor was built by the SPD builder (spdlevel.js)");
  check(spdSpecials > 0, "SPD floors were built, but not one special room appeared");
  check(spdPlants > 0, "SPD floors were built, but not one plant grew on any of them");

  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} of ${checks} checks failed:\n`);
    const seen = new Map();
    for (const f of failures) seen.set(f, (seen.get(f) || 0) + 1);
    for (const [msg, n] of seen) console.error("  · " + msg + (n > 1 ? `  (×${n})` : ""));
    console.error("");
    process.exit(1);
  }
  console.log(`ok — ${checks} checks passed across ${DEPTHS} depths × ${ITERATIONS} regenerations (${spdFloors} SPD floors, ${spdSpecials} special rooms, ${spdPlants} plants)`);
}

main().catch((err) => { console.error(err); process.exit(1); });

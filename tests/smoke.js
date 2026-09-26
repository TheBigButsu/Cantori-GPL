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

  // Rings (SPD's): a ring is a disguised gem until worn, wearing it names it for
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
      if (!/Haste/.test(worn.ring1.name)) out.problems.push("wearing the ring did not name it (" + worn.ring1.name + ")");
      if (!(worn.walkCost < before.walkCost)) out.problems.push(`Ring of Haste did not speed walking (${before.walkCost} -> ${worn.walkCost})`);
      if (worn.levels.haste < 1) out.problems.push("Ring of Haste has no level");
    }
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
    for (let r = 3; r <= 6 && !spot; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
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
    // The Monk: a focused Monk parries the first blow, and can be hit once it's spent.
    s = open();
    c.spawnMonsterAt("monk", s.x, s.y);
    c.setMonsterAt(s.x, s.y, { state: "hunting", aware: true, focus: true, focusCd: 0 });
    const hp0 = c.monsterFx(s.x, s.y).hp;
    c.hurt(-999); c.step(s.dx, s.dy);
    const f1 = c.monsterFx(s.x, s.y);
    if (!f1) problems.push("the monk vanished after one blow");
    else {
      if (f1.hp !== hp0) problems.push("a focused monk took damage instead of parrying");
      if (f1.focus) problems.push("the monk's parry did not spend its focus");
      let hit = false;
      for (let i = 0; i < 40 && !hit; i++) {
        const m = c.monsterFx(s.x, s.y);
        if (!m) { hit = true; break; }
        if (m.hp < hp0) { hit = true; break; }
        c.setMonsterAt(s.x, s.y, { focus: false, focusCd: 9 });
        c.hurt(-999); c.step(s.dx, s.dy);
      }
      if (!hit) problems.push("an unfocused monk could not be hit in 40 swings");
    }
    const mk = c.monsterFx(s.x, s.y); if (mk) c.killAt(s.x, s.y);
    // Town: every monster it names exists.
    const town = D.biomes.find((b) => b.key === "town");
    for (const k of town.monsters) if (!D.monsters[k]) problems.push("Town names a missing monster: " + k);
    for (const k of ["monk", "warlock"]) if (town.monsters.indexOf(k) < 0) problems.push("Town has no " + k);
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
          if (p.charge || p.boss) continue;           // both move in ways that set their own animation
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

# Packets

A **packet** is one unit of work small enough to hand to a cheap model in a fresh
session: one branch, one commit, one clear "done when". Briefs live in `docs/packets/`.

Division of labour: **you author content** (class feel, boss kits, monster rosters, tuning)
through `editor.html` and `data.js`. **Packets build the frameworks and plumbing** those
rest on — new skill `kind`s, new monster behaviour flags, the boss playbook registry,
terrain, save, dread, sprites, menus.

---

## The cost rules

`game.js` is ~78k tokens. Reading it whole, on a 15-turn agent session, is roughly
**$0.40 of input on Sonnet 5 with caching — $2.30 without**. Reading one 4k section is
about **$0.04**. That ~10× matters, but the real cost is elsewhere: a model buried in 78k
tokens of unrelated code makes more mistakes, and **retries are what actually blow the
budget**. Every rule below exists to keep the model's working set small.

1. **Never read `game.js` whole.** Open `docs/MAP.md`, find your section, and
   `Read(game.js, offset=…, limit=…)`. Grep for a symbol when you only need one function.
2. **Every brief names the files you may touch.** Anything outside that list is out of
   scope — including "while I was here" cleanups.
3. **Let the smoke test do the checking.** `node tests/smoke.js` is far cheaper than
   re-reading code to convince yourself it works. Run it; read the failure; fix that.
4. **One packet, one commit.** If you find a second problem, note it in the commit
   message — don't fix it.
5. **Rerun `python3 tools/make_map.py`** — before you start, so the map matches today's
   `game.js`, and again at the end if you moved code between sections. Line numbers drift with
   every merge; `docs/MAP.md` is the only file allowed to contain them, which is why briefs
   name sections and symbols instead.

Model guidance: **Haiku 4.5** ($1/$5 per Mtok) is enough for the `data.js` and asset
packets marked *content*. **Sonnet 5** ($2/$10) for everything marked *code*. The
extraction packets (A-track) are the riskiest — do those with a stronger model or review
them carefully, because a broken extraction breaks everything downstream.

---

## Running a packet

Packets are named by track — `A1`, `B1`, `F1` — and **this file is the only list that
matters**. (An earlier roadmap numbered things P0–P9; that was milestones, not work orders.
P1 became track A, P2→D1–D2, P3→D3–D5, P4→C, P5→B2–B4, P6→B5–B6, P7→B1, P8→E1–E2, P9→E3–E4.
Ignore the P numbers.)

**Do not paste the brief's contents.** Paste the block below, with the packet's filename
in it — the model reads the brief out of the repo itself, which is cheaper and keeps one copy
of the truth.

```
First run `python3 tools/make_map.py` to refresh docs/MAP.md, then read CLAUDE.md
and docs/packets/<id>.md. Do exactly what that brief says.

Do NOT read game.js in full — use docs/MAP.md to find the sections you need
and read only those ranges. Briefs name sections and symbols, never line
numbers; if you need a line number, get it from MAP.md or grep for the symbol.

Touch only the files the brief lists. `node tests/smoke.js` must pass before
you commit. One commit, message explaining why, not what.
```

---

## Track A — split `game.js` *(code; do these first, in order)*

Each extraction follows the pattern `loot.js` already established: a
`window.CantoriX = function (deps) { … return { … }; }` factory taking its dependencies
explicitly, wired up in `game.js` with `const _x = window.CantoriX({ … })`. **Behaviour must
not change** — these are pure moves.

| Packet | Extracts | ~size | Status |
|---|---|---|---|
| [A1](packets/A1-extract-bosses.md) | `bosses.js` — Piper + Golem playbooks | 5k | **brief ready** |
| A2 | `levelgen.js` — generation, traps, doors, vaults | 11k | brief after A1 |
| A3 | `render.js` — colours, sprites, animation, draw | 10k | brief after A1 |
| A4 | `ui.js` — pack, inventory, character, hotbar, shop | 8k | brief after A1 |

A1 is deliberately first and smallest: it proves the pattern on the least entangled code.
**A2–A4 have no briefs yet on purpose** — they copy whatever shape A1 settles on, and A1 may
show the closure is too entangled to split this way. Write them once A1 has landed, using its
brief as the template and `tools/make_map.py` for the new line numbers.

## Track B — frameworks for the content you're authoring *(code)*

These are the packets that unblock your own work on classes, bosses and monsters.

| Packet | Gives you | ~size | Status |
|---|---|---|---|
| [B1](packets/B1-boss-playbooks.md) | A boss registry, so a new boss is a data row + one playbook file — no `monsterAct` surgery | 4k | todo |
| [B2](packets/B2-skill-kind-bolt.md) | `bolt` skill kind — MP-spending targeted spell (Mage) | 3k | todo |
| [B3](packets/B3-skill-kind-taunt-guard.md) | `taunt` + `guard` kinds (Tank) | 3k | todo |
| [B4](packets/B4-skill-kind-song.md) | `song` sustained-aura kind + charm state (Bard) | 4k | todo |
| [B5](packets/B5-monster-flags-1.md) | `summoner`, `healer`, `blinker` behaviour flags | 3k | todo |
| [B6](packets/B6-monster-flags-2.md) | `webber`, `drain`, `splitter`, `ambusher` flags | 3k | todo |
| B7 | Teach `editor.js` every field B1–B6 added, so the editor stops dropping them | 3k | todo |
| [B8](packets/B8-smite-variants.md) | Smite upgrades into one of three mutually exclusive variants; `exclusiveGroup` and `supersedes` | 5k | **brief ready** |
| [B9](packets/B9-heal-and-aura.md) | `heal` kind (Lay on Hands) + Kethara's Will as a passive — no new kind needed | 4k | **brief ready** |

## Track C — terrain and rooms *(code, then content)*

| Packet | Does | ~size | Status |
|---|---|---|---|
| [C1](packets/C1-tile-properties.md) | Tile property table replacing scattered constant checks; declares `WATER/CHASM/RUBBLE/GRASS`. **No behaviour change** — nothing places them yet | 5k | **brief ready** |
| [C2](packets/C2-biome-painters.md) | Water, grass and rubble painted per biome, driven from `data.js` | 5k | **brief ready** |
| C3 | Caves painter: chasms + rubble, and falling to the next floor | 5k | todo |
| C4 | Generalize `makeThornVaults` into a room-template system | 5k | todo |
| C5 | Six room templates as data: library, garden, flooded, crossing, sarcophagus, ritual circle | 4k | todo |
| C6 | Doors-and-connectors invariant: merge flush-attached pairs into one L-shaped room, door every connector mouth, no door without a connector. `LAYOUT_DEFAULT` + `generateLevel` + `placeDoors`, asserted in the smoke test — see `docs/FLOOR-DESIGN.md` | 6k | todo |
| C7 | Every dead-end stub terminates in a secret rather than being sealed: lift `SECRET_MAX`, rebalance the per-floor loot budget against it | 3k | todo |

**`docs/FLOOR-DESIGN.md` is the argument for this track**, with the measurements behind it:
floors are a warren of 3-tile slots that hold nothing, 95% of rooms are fully visible from
their own doorway, and C4/C5 are the fix. Run `node tools/floor_stats.js` before and after
any packet here — it prints the numbers that document quotes.

C1 is the dangerous one — rule 5 in `CLAUDE.md` exists because a tile missed in one
predicate makes rare seeds unwinnable. Do it alone, and extend the smoke test with it.
C1 changes no behaviour on purpose — it is the refactor that makes C2/C3 small.

## Track D — systems *(code)*

| Packet | Does | ~size | Status |
|---|---|---|---|
| D1 | Save/resume: serialize + restore a run to `localStorage`, versioned | 7k | todo |
| D2 | Save/resume: the `Set`s and edge cases — `propOpenDoors`, `identified`, `player.boons`, `biomeScrollFloors`, potion colours; clear on death and win | 4k | todo |
| D3 | Dread meter: per-floor turn clock driving the existing `FD` bar, thresholds in `data.js` | 4k | todo |
| D4 | Dread escalation: extra spawns, FOV shrink, vignette | 3k | todo |
| D5 | Dread tier 3: the stalker that hunts you off the floor | 4k | todo |

## Track E — presentation *(code)*

| Packet | Does | ~size | Status |
|---|---|---|---|
| E1 | Sprite-sheet loader: `<key>_sheet.png` + `frames`/`fps` in `data.js`, falling back to today's single PNG | 4k | todo |
| E2 | Idle / attack / hit / death frames and directional facing, driven off the existing `bumpAt` and `hitAt` timers | 4k | todo |
| E3 | Title screen + settings (motion, haptics, sound, text size) | 5k | todo |
| E4 | Run summary on death + a bestiary that fills in as you meet things | 5k | todo |
| E5 | Floor-map legibility: wall and floor are drawn 1.3:1 apart, so the map reads as one brown mass. `drawMap` only — see `docs/FLOOR-DESIGN.md` §1 | 1k | todo |

## Track F — skill trees as real trees *(code)*

The mechanics are further along than the screen suggests: ranks, level gates, point spending and
**enforced prerequisites** all already work. The tree is just *drawn* as a flat list of cards, and
the rigid 5×5 grid is the only thing preventing real branching.

| Packet | Does | ~size | Status |
|---|---|---|---|
| [F1](packets/F1-skill-node-model.md) | Nodes with ids and `x`/`y`; prerequisites by id instead of grid coordinate; migration both ways | 6k | **DONE** (PR #2) |
| [F2](packets/F2-skill-tree-render.md) | Draw it: circular nodes, state rings, rank badges, prerequisite arrows, pan/zoom | 7k | **brief ready** |
| F3 | Drag-and-drop tree builder in `editor.html`, replacing the 5×5 form | 8k | brief after F1 |
| F4 | Named branch paths per class (Tank → Bulwark / Vanguard), tinted per path | 4k | brief after F2 |

F1 is the risky one — `editor.html` rewrites `data.js` wholesale, so a shape mismatch between the
game and the editor silently destroys authored trees. Its brief covers the migration both ways;
do not skip the editor round-trip check.

---

## Order

```
A1 → A2 → A3 → A4        the split; unlocks everything else running in parallel
   ├── B1 … B7           frameworks for your content work   ← start here after A1
   ├── C1 → C2/C3/C4 → C5
   ├── D1 → D2, D3 → D4 → D5
   ├── E1 → E2, E3 → E4
   └── F1 → F2 → F3/F4      skill trees
```

B1 only needs A1 (it lands in the same file A1 creates), so the boss registry is available
almost immediately. Everything in B, C, D, E and F is independent once A is done.

**One collision to avoid:** A4 extracts `game.js` lines ~3899–4906 into `ui.js`, which contains
the Skills and Character-screen code that F1/F2 rewrite. Do **F1 and F2 before A4**, or A4's
brief has to be written against the new tree renderer. Running them in parallel will conflict.

---

## S-track: ports from Shattered Pixel Dungeon

This repo is the GPLv3 line (see `README.md`), and the S-track brings SPD systems across.
Each S packet translates one SPD system, pinned to the commit in `vendor/spd/README.md`,
into the matching `game.js` section. Its content goes in `data.js`, with editor support.
Name the SPD source file in a comment beside the port. Progression stays **insight
potions + gear**, so strength potions, upgrade scrolls and wands are out of scope.
MP already exists.

```
S1 blobs ──┬── S2 potion actions
           ├── S3 grass, plants, seeds
           └── S6 special rooms + their guaranteed key item
S4 hunger & food      (independent)
S5 rings with effects (independent)
S8 multi-rank skills  (independent; needs the editor cell-shape change)
S7 SPD art pass       (last; every sprite credited in ART-CREDITS.md)
```

- **S1 Blobs.** SPD `actors/blobs/Blob.java`: a per-tile volume that spreads and decays
  each turn. Add Fire (burns grass and doors), ToxicGas, ParalyticGas, Freezing, and Web.
  Burning terrain goes through every map predicate in CLAUDE.md rule 5.
- **S2 Potion actions.** Thrown or shattered potions release blobs: liquid flame, frost,
  toxic gas, paralytic gas, levitation, invisibility, mind vision, purity.
- **S3 Grass, plants, seeds.** Tall and trampled grass, seeds that plant, and plants that
  fire when stepped on (SPD `plants/`).
- **S4 Hunger & food.** SPD `actors/buffs/Hunger.java`, rations, mystery meat, and a
  per-floor food guarantee. The rates live in `data.js` so it can be tuned or switched off.
- **S5 Rings with effects.** SPD `items/rings/`, with Energy driving skill cooldowns and
  MP regen instead of wands.
- **S6 Special rooms.** SPD `levels/rooms/special/`, plus the rule that each room's
  solution spawns on the same floor (fire wall → frost potion, piranhas → invisibility,
  and so on). Pass the connectivity checks from rule 5.
- **S7 SPD art pass.**
- **S8 Multi-rank skills.** An optional `ranks` per skill-tree cell, as SPD talents have.

Briefs are written into `docs/packets/` as each packet is picked up.

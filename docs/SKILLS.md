# Skill trees — the canon

Generated from `data.js` by `tools/make_skills_doc.py` — the class `skillTree`s are the source of truth.

## How the trees work

- **Core** nodes are open from the start.
- Each hero has **three branches**, of 5-rank nodes. A node opens by points spent *in its branch*: tier 2 at 3 points, tier 3 at 7, the capstone at 15.
- The last node of each branch is a **pair of capstones — choose one**, for the rest of the run.
- A run pays **37 points**: one Potion of Insight a floor (25) and 3 from each of the first four bosses (12). That is 16 by the Golem on floor 10 — exactly one branch and its capstone, going all-in — and a second capstone near the 32nd point. The third branch's capstone is out of reach: which two is the build.
- One branch per hero (✦) belongs to that hero's god. It stands alone, and pairs with that god's boons.

## ⚔ Chadwick

*Human knight of the church. Will Smite in the name of Kethara.*

### Core

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| start | 💥 **Smite** — A single devastating blow, empowered by your Strength. Tap a foe within range. 5 MP, 100-turn cooldown. | active | 1. Weapon damage + STR damage.<br>2. Weapon damage + STR×1.5 damage.<br>3. Weapon damage + STR×2 damage, +1 range. |
| start | ⚔ **Melee Master** — Every blade and every haft: while you hold a dagger, a sword or an axe. | passive | 1. +1 to hit.<br>2. +2 to hit and +1 max damage.<br>3. +3 to hit, +1 min and max damage — and a blue sword of your own. |

### 🛡 Bulwark

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | 🛡 **Raise Shield** — Set your shield and let them break on it: for a few turns every blow that reaches you is halved, and part of it goes back at whoever threw it. | active | 1. 4 turns: blows halved, 20% reflected. 80-turn cooldown.<br>2. 4 turns, 30% reflected. 75-turn cooldown.<br>3. 5 turns, 35% reflected. 70-turn cooldown.<br>4. 5 turns, 45% reflected. 60-turn cooldown.<br>5. 6 turns, 60% reflected. 50-turn cooldown. |
| 3 pts | 🏰 **Stalwart** — Planted. Your armour blocks more the heavier it is, and nothing drags you off your feet — no chain, no shove. | passive | 1. You cannot be pulled or knocked back.<br>2. +1 armour block per tier of your armour.<br>3. +2 block per armour tier.<br>4. +3 block per armour tier.<br>5. +4 block per armour tier. |
| 7 pts | ✚ **Lay on Hands** — Mend yourself. Healing beyond your maximum is not wasted — it shortens the wait. | active | 1. Heals for VIT + STR. 15 MP, 200-turn cooldown.<br>2. …+ half your level.<br>3. …+ your level, 180-turn cooldown.<br>4. …+ 1.5× your level.<br>5. …+ twice your level, 150-turn cooldown. |
| 15 pts · choose one | 🗿 **Unbreakable** — Below 20% health, every blow that reaches you is halved again. | passive | 1. Below 20% HP, damage taken is halved. |
| 15 pts · choose one | 🔰 **Aegis** — A quarter of the blows that reach you are turned wholly back on whoever threw them. | passive | 1. 25% of blows: you take nothing and the attacker takes the hit. |

### 💥 Zealot

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | 🌟 **Radiant Smite** — Your Smite breaks like a sunrise: every foe beside the target takes a share of the blow. | passive | 1. Foes beside the target take 25% of the Smite.<br>2. 35%.<br>3. 50%.<br>4. 65%.<br>5. 80%. |
| 3 pts | 💖 **Healing Smite** — A Smite that returns what it deals. | active | 1. Deals Smite damage and heals you as much. 100-turn cooldown.<br>2. 90-turn cooldown.<br>3. 80-turn cooldown.<br>4. 70-turn cooldown.<br>5. 60-turn cooldown, and healing past your maximum becomes a shield. |
| 7 pts | 🔥 **Zeal** — Every blow you land brings the next Smite closer. | passive | 1. Each weapon hit takes 2 turns off Smite's cooldown.<br>2. 3 turns.<br>3. 5 turns.<br>4. 7 turns.<br>5. 10 turns. |
| 15 pts · choose one | ⚡ **Divine Wrath** — Every sixth blow you land is a Smite, free. | passive | 1. Every 6th weapon hit also Smites the target, at no cost. |
| 15 pts · choose one | ✝ **Crusader** — A Smite that kills is ready again at once. | passive | 1. A killing Smite resets its cooldown. |

### ⚖ Oath of Kethara ✦ (Kethara)

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | 🐂 **Rush** — Charge in a line until you hit something. The foe you hit is Bound — stunned — for a turn. | active | 1. Charge; the foe you hit is Bound. 90-turn cooldown.<br>2. +2 damage, 80-turn cooldown.<br>3. +3 damage, 70-turn cooldown.<br>4. +5 damage, 60-turn cooldown.<br>5. +7 damage, 45-turn cooldown, Bound for 2. |
| 3 pts | 👁 **Eye of Kethara** — Tap a foe: Kethara's eye fixes it in place. Cooldown falls with RES. | active | 1. Held for 8 turns.<br>2. Held for 12 turns.<br>3. Held for 16 turns.<br>4. Held for 20 turns.<br>5. Held for 28 turns. |
| 7 pts | 🧱 **Wall of Faith** — Tap a tile: a wall of stone rises across it, shoving any foe in the way back a step. | active | 1. A 3-tile wall. 150-turn cooldown.<br>2. A 5-tile wall.<br>3. A 5-tile wall, 120-turn cooldown.<br>4. A 7-tile wall.<br>5. A 9-tile wall, 90-turn cooldown. |
| 15 pts · choose one | ⛓ **Chains of Faith** — Your Smite binds what it does not kill. | passive | 1. A Smite Binds its target for 2 turns. |
| 15 pts · choose one | 😡 **Anger of Kethara** — Tap a foe: Kethara's anger turns it on everything around it for 10 turns. | active | 1. Send a foe berserk for 10 turns. Cooldown falls with RES. |

## 👊 Brynn

*Goliath monk from the Western shores. Mobile fighter that will move quickly around the map.*

### Core

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| start | 👊 **Unarmed Master** — Empty hands, full of surprises. Only while no weapon is held. | passive | 1. +1 min / +2 max unarmed damage; unarmed attack speed 1.5.<br>2. +4 min / +12 max unarmed damage.<br>3. …plus your DEX and VIT modifiers as bonus damage. |
| start | 👣 **Happy Feet** — Footwork you cannot do in plate — only in cloth or medium armour. | passive | 1. +2 AC.<br>2. +4 AC and 5% to slip a blow that already connected.<br>3. +4 AC and 10% to slip a blow. |

### 🌊 Flow

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | 🐉 **Dragon Kick** — Launch yourself down a line and strike at the end of it: the run-up is the blow. | active | 1. Kick for (attack − 1) per square crossed. 5 MP, 60-turn cooldown.<br>2. 50-turn cooldown.<br>3. The first kick does not start the cooldown — kick again at once, free.<br>4. 40-turn cooldown.<br>5. Both kicks cost no time, and every square counts in full. |
| 3 pts | ↺ **Riposte** — Every blow you slip is an opening: answer it at once. | passive | 1. Counter a dodged blow for 40%.<br>2. 55%.<br>3. 70%.<br>4. 85%.<br>5. A full swing, and a little more: 110%. |
| 7 pts | 💨 **Momentum** — Moving is the wind-up. Every step you take before you strike adds to the blow; being hit spends it. | passive | 1. +1 damage a step, up to +2.<br>2. +1 a step, up to +3.<br>3. +1 a step, up to +5.<br>4. +2 a step, up to +7.<br>5. +2 a step, up to +10. |
| 15 pts · choose one | 🌀 **Untouchable** — After you slip a blow, your next step costs no time at all. | passive | 1. A dodge makes your next move free. |
| 15 pts · choose one | 🌪 **Whirlwind Step** — You go over them, not around them: strike a foe and land on its far side. | passive | 1. Walking into a foe strikes it and vaults you past it, if there is room. |

### 🪑 Improvised

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ↩ **Throw** — Grab a foe beside you and hurl it until it hits something. | active | 1. Throw; the foe takes weapon + DEX damage. 100-turn cooldown.<br>2. …80-turn cooldown.<br>3. …and whatever it hits takes the same.<br>4. …60-turn cooldown.<br>5. …and the damage dealt comes off the cooldown. |
| 3 pts | 📦 **Prop Master** — A crate is not in your way, it is in your hand: bump one and it flies at the nearest foe you can see. | passive | 1. Crates you smash fly for 1× your attack and stun.<br>2. 1.5× your attack.<br>3. 2× your attack.<br>4. 2.5× your attack.<br>5. 3.5× your attack. |
| 7 pts | ☝ **Pressure Point** — You know where the nerve is. Bare-handed blows can lock a foe up outright. | passive | 1. 8% to stun for 1 turn.<br>2. 12% to stun for 1 turn.<br>3. 16% to stun for 1 turn.<br>4. 20% to stun for 2 turns.<br>5. 28% to stun for 2 turns. |
| 15 pts · choose one | 🎬 **Stunt Double** — A thrown foe that hits another knocks them both senseless. | passive | 1. Throw collisions stun both for 2 turns. |
| 15 pts · choose one | 🧱 **Environmental Master** — The wall does the work: a foe thrown into a wall takes triple. | passive | 1. Throwing a foe into a wall deals 3× damage. |

### 🌿 Wild Heart of Auvris ✦ (Auvris)

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ◌ **Now You See Me** — Step out of sight; everything hunting you loses the trail. In tall grass, it lasts twice as long. | active | 1. Invisible for 5 turns. 5 MP, 100-turn cooldown.<br>2. 8 turns.<br>3. 10 turns, 90-turn cooldown.<br>4. 13 turns.<br>5. 16 turns, and coming back into view: +5 damage for 5 turns. |
| 3 pts | 🗡 **Sneak Attack** — Tap an adjacent foe that has not seen you. Damage past the kill buys back the dark. | active | 1. ×2 damage. 8 MP, 60-turn cooldown.<br>2. ×2.5.<br>3. ×3, and every 4 overkill is a turn unseen.<br>4. ×3.5, 45-turn cooldown.<br>5. ×4, and every 3 overkill is a turn unseen. |
| 7 pts | 🍃 **Wild Instinct** — Where you land, something grows: Dragon Kick and Throw may leave a random plant or cloud behind. | passive | 1. 25% chance.<br>2. 40% chance.<br>3. 55% chance.<br>4. 70% chance.<br>5. Every time. |
| 15 pts · choose one | 🌻 **Force of Nature** — Every plant you set off feeds you. | passive | 1. Plants you trigger heal you 5 + half your level. |
| 15 pts · choose one | 🐒 **Chaos Monkey** — Every eighth thing you do, Auvris does something too. | passive | 1. Every 8th action fires a random Wild effect on the nearest foe. |

## ✨ ToneTum

*Gnome wizard from the Eastern Highlands. Wide array of tools to solve any problem.*

### Core

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| start | ✦ **Magic Missile** — A bolt of force, always at hand — no aiming, it finds the nearest thing you can see. The volley widens as you grow: two bolts at level 3, three at 7, four at 12, each seeking the next-nearest visible foe. 5 MP. | active | 1. 5 MP · 1–4 damage +1 per character level, at the nearest foe in sight · 2 bolts at level 3, 3 at 7, 4 at 12 · 2–8 a bolt from level 18 · known from the start |
| start | 🧠 **Keen Intellect** — A deeper well, cut by the same mind that draws from it. Adds mana equal to a multiple of your INT modifier. | passive | 1. +MP equal to twice your INT modifier.<br>2. +MP equal to four times your INT modifier.<br>3. +MP equal to five times your INT modifier, and a robe of the third tier or better arrives at once. |
| start | 🌊 **Deep Well** — Mana returns to you faster. Each rank replaces the last, it does not stack on it. | passive | 1. +25% MP regeneration.<br>2. +50% MP regeneration.<br>3. +100% MP regeneration. |

### ◇ Abjuration

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ◇ **Ward** — A shell around you that eats damage before your armour or your HP sees it. Sized by RES. | active | 1. 15 MP · absorbs 10 + 3×RES mod · 40 turns · 120-turn cooldown.<br>2. Absorbs 14 + 4×RES mod.<br>3. Absorbs 18 + 5×RES mod, 110-turn cooldown.<br>4. Absorbs 22 + 6×RES mod for 50 turns.<br>5. Absorbs 28 + 7×RES mod for 60 turns, and what it eats is thrown back at whatever swung. |
| 3 pts | ✋ **Counterspell** — Unmake a spell before it lands: the nearest telegraphed attack you can see — a boss's wind-up, a beam, a necromancer's summoning — comes apart. With nothing to counter, it strips every hex from you instead. | active | 1. 10 MP · 140-turn cooldown.<br>2. 120-turn cooldown.<br>3. 100-turn cooldown.<br>4. 80-turn cooldown.<br>5. 60-turn cooldown, and the caster is stunned for 2 turns. |
| 7 pts | ⛨ **Sanctum** — Draw a circle: the 3×3 around you becomes ground no foe may enter. Anything already inside is thrown out. | active | 1. 4 turns · 15 MP · 160-turn cooldown.<br>2. 5 turns · 140-turn cooldown.<br>3. 6 turns · 120-turn cooldown.<br>4. 8 turns · 100-turn cooldown.<br>5. 10 turns · 80-turn cooldown. |
| 15 pts · choose one | 🕳 **Banishment** — Tap a foe: it is sent somewhere else for 10 turns and comes back where it left. A boss only slips out of the world for 2. | active | 1. 20 MP · 150-turn cooldown. |
| 15 pts · choose one | 💠 **Aegis Eternal** — Every kill closes your Ward again, whole. | passive | 1. A kill refreshes your Ward to full (Ward must be learned). |

### 🌀 Conjuration

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ➹ **Blink** — Step through the space between. Tap any tile you can see. | active | 1. 20 MP · 220-turn cooldown.<br>2. 18 MP · 190-turn cooldown.<br>3. 15 MP · 160-turn cooldown.<br>4. 12 MP · 130-turn cooldown.<br>5. 10 MP · 100-turn cooldown. |
| 3 pts | 🚪 **Portal** — Tap a tile you can see: a door opens under you and another there, linked. Whatever steps into one — you or a foe — steps out of the other. | active | 1. 15 turns · 15 MP · 130-turn cooldown.<br>2. 20 turns · 110-turn cooldown.<br>3. 25 turns · 90-turn cooldown.<br>4. 30 turns · 75-turn cooldown.<br>5. 40 turns · 60-turn cooldown. |
| 7 pts | 👥 **Mirror Image** — Cast copies of yourself. Monsters would rather hit them than you. | active | 1. 30 MP · one still image beside you · 220-turn cooldown.<br>2. 200-turn cooldown.<br>3. Two images.<br>4. Two images, and they wander. 180-turn cooldown.<br>5. Two wandering images, and you go unseen for 2 turns. 160-turn cooldown. |
| 15 pts · choose one | ⭕ **Crimson Bands** — Tap a foe: conjured bands of crimson light bind it where it stands. | active | 1. Bind for 3 turns. 10 MP · 40-turn cooldown. |
| 15 pts · choose one | 👤 **Legion** — Mirror Image makes three of you, and each one bursts when it is struck. | passive | 1. Mirror Image: 3 images; a struck image explodes for 4 + 2×INT mod on everything beside it. |

### ⏳ Eye of Ourn ✦ (Ourn)

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ⏳ **Slow Time** — Tap anywhere you can see: time thickens there, and everything caught in it moves and swings at half speed. | active | 1. 12 MP · radius 2 · 8 turns · 60-turn cooldown.<br>2. Radius 2 · 11 turns.<br>3. Radius 2 · 14 turns, and 4 + INT mod damage.<br>4. Radius 3 · 16 turns, and 6 + INT mod damage.<br>5. Radius 3 · 20 turns, and 9 + INT mod damage. |
| 3 pts | 🔮 **Foresight** — You saw it coming. The first blows aimed at you on each floor simply miss. | passive | 1. The first blow each floor misses.<br>2. The first 2 blows each floor miss.<br>3. The first 3.<br>4. The first 4.<br>5. The first 5. |
| 7 pts | ⏪ **Rewind** — Wind yourself back: you stand where you stood 5 turns ago, with the health you had then — if it was more. | active | 1. 10 MP · 160-turn cooldown.<br>2. 10 MP · 135-turn cooldown.<br>3. 10 MP · 110-turn cooldown.<br>4. 10 MP · 90-turn cooldown.<br>5. 70-turn cooldown, and your mana winds back too. |
| 15 pts · choose one | ♾ **Time Loop** — Once per run, the blow that would kill you never happened: you are wound back 10 turns instead. | passive | 1. Once per run, death rewinds you 10 turns. |
| 15 pts · choose one | ⏸ **Stop Time** — Ourn holds the world still: you act for 3 turns while nothing else moves. | active | 1. 3 free turns. 25 MP · 300-turn cooldown. |

## ♪ Sera

*Elvish bard from Duskhaven. Creates power from song.*

### Core

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| start | ♪ **Sharp Note** — Hers from the first step. Strike a note onto a tile you can see, at least two paces off. It hangs there and plucks at the nearest thing it can see, once a turn, until it runs out or something smashes it — and a note is only as sturdy as your LUCK. How many you can hold on the board, and how many uses you can bank, both grow with INT + LCK + your level. | active | 1. 8 MP · 2 + ½DEX mod damage a turn · range 3 · 8 turns · one use back every 45 turns · known from the start<br>2. 3 + ½DEX mod · range 4 · 10 turns · one back every 40<br>3. 5 + ½DEX mod · range 4 · 12 turns · one back every 34 |
| start | 🎶 **Cadence** — The music pays for itself — but only while it is playing. Every turn a note of yours rings, some mana comes back. | passive | 1. +1 MP a turn while any note is ringing.<br>2. +2 MP a turn.<br>3. +4 MP a turn. |
| start | 🏹 **Grace Note** — A bow is an instrument too. Nothing while you are holding anything else. | passive | 1. +1 min / +2 max damage with a bow.<br>2. +3 / +6, and +1 to hit.<br>3. +5 / +10, and +3 to hit. |

### 🎼 Composition

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ⑂ **Counterpoint** — More than one line at a time: each new note-slot comes a step early, and every note is tougher while it is out. The board never goes past five. | passive | 1. A slot early.<br>2. A slot early, and +1 note hit point.<br>3. A slot early, and +2 hit points.<br>4. Two slots early, and +3 hit points.<br>5. Two slots early, and +5 hit points. |
| 3 pts | 〰 **Carrying Tone** — Your notes reach further across the room, and hold the air longer. | passive | 1. +1 note range.<br>2. +1 range, and notes last 1 turn longer.<br>3. +1 range, 2 turns longer.<br>4. +2 range, 3 turns longer.<br>5. +2 range, 5 turns longer. |
| 7 pts | ↔ **Modulate** — Tap a tile: the note nearest it lifts and sets down there, still ringing, as old as it was. The artillery moves with the fight. | active | 1. 4 MP · 35-turn cooldown.<br>2. 4 MP · 28-turn cooldown.<br>3. 4 MP · 20-turn cooldown.<br>4. 4 MP · 14-turn cooldown.<br>5. 8-turn cooldown, and it costs no time. |
| 15 pts · choose one | 🎻 **Symphony** — Three notes at once, thrown out in a shape rather than a stack. Raises the board cap while they last. | active | 1. 30 MP · 3 notes, 12 turns each · 170-turn cooldown. |
| 15 pts · choose one | ⟋ **Chord** — Two notes are not two turrets, they are a line. Anything standing between a pair of your notes is cut by it every turn. | passive | 1. Pairs of notes cut anything between them for half a note's damage. |

### ♭ Movements

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ✹ **Shatter** — A note held until the glass goes. Direct damage at whatever you tap — for when the board is empty and something is already on top of her. | active | 1. 9 MP · burns for 2× INT modifier a turn, cooling by 1 · 18-turn cooldown.<br>2. +1 burn damage a turn.<br>3. +2 a turn, 16-turn cooldown.<br>4. +3 a turn, 2 turns longer.<br>5. +5 a turn, 4 turns longer, 13-turn cooldown. |
| 3 pts | ♮ **Dissonance** — A note that does not sing. It deals nothing and drags on everything in range instead — half walking speed, half swinging speed. | active | 1. 10 MP · range 3 · chills for 5 turns · lasts 8 turns · 40-turn cooldown.<br>2. Chills for 7, lasts 10.<br>3. Range 4, chills for 10, lasts 12.<br>4. Range 4, chills for 13, lasts 13.<br>5. Range 5, chills for 17, lasts 15, 30-turn cooldown. |
| 3 pts | 💤 **Lullaby** — A note that sends things under. Anything weak enough in range drops where it stands — and it keeps working while you are somewhere else entirely. | active | 1. 12 MP · sleeps anything at or below INT ÷ 2 HP · range 3 · 8 turns · 60-turn cooldown.<br>2. At or below ¾ INT HP.<br>3. At or below INT HP, range 4, 10 turns.<br>4. 12 turns, 50-turn cooldown.<br>5. At or below 1.25× INT HP, 14 turns, 40-turn cooldown. |
| 7 pts | 📈 **Crescendo** — A note grows into itself. The longer one has been ringing, the harder it hits — so placing early is the right play. | passive | 1. +1 damage per 3 turns a note has lived, up to +1.<br>2. Up to +2.<br>3. Up to +3.<br>4. Up to +4.<br>5. Up to +6. |
| 15 pts · choose one | ↻ **Encore** — Take it from the top. Every note still on the board goes back to full life and a full run. | active | 1. 14 MP · notes reset to 14 turns · 90-turn cooldown. |
| 15 pts · choose one | 💥 **Final Movement** — End it. Every note on the board breaks at once for three times what it was worth, in a circle around where it stood — and the board is empty afterwards. | active | 1. 20 MP · ×3 a note's damage, radius 3 · 160-turn cooldown. |

### 💀 Requiem of Maelon ✦ (Maelon)

| Opens at | Node | Kind | Ranks |
|---|---|---|---|
| 0 pts | ⚰ **Dirge** — A slow note for the dead. It does not strike — it poisons the nearest thing it can see, a little more each turn. | active | 1. 10 MP · 2 poison a turn · range 3 · 8 turns · 40-turn cooldown.<br>2. 3 poison a turn.<br>3. 3 poison · range 4 · 10 turns.<br>4. 4 poison · 11 turns.<br>5. 6 poison · 13 turns · 30-turn cooldown. |
| 3 pts | 🕯 **Last Rites** — A foe that dies within reach of one of your notes is sung out: you are healed, and that note starts its run again. | passive | 1. Heal 2, and the nearest note in range resets.<br>2. Heal 4.<br>3. Heal 6.<br>4. Heal 8.<br>5. Heal 12. |
| 7 pts | 🎵 **Ballad** — Stand inside your own music. Within two tiles of one of your notes, you are harder to hit and you hit harder. | passive | 1. +1 AC and +1 damage near a note.<br>2. +2 and +2.<br>3. +3 and +3.<br>4. +4 and +4.<br>5. +5 and +5. |
| 15 pts · choose one | 💀 **Danse Macabre** — What your notes kill keeps singing: a foe killed by a note rises as a short-lived note where it fell. | passive | 1. A note's kill leaves a 6-turn Sharp Note in its place (it may go past the board cap). |
| 15 pts · choose one | ⚱ **Wake** — Maelon listens for your music. While a note is ringing, your Death's Door boon answers at 30% health instead of 20%. | passive | 1. Death's Door triggers below 30% HP while a note rings. |

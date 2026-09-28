# Boons — the canon

Generated from `data.js` (the `boons` table is the source of truth; this file mirrors it for reading).

## How boons work

- An offer (run start, each boss, the altar) shows **three boons from three different gods**.
- Take a god's boon and that god is **sworn**: every later offer includes one of a sworn god's boons.
- **Bind always lasts at least 2 turns** (bosses included; Iron Law II holds a boss for 3).
- **Slot boons** — Attack, Magic, Move, Struck, Death's Door (below 20% HP, once a floor). One per slot; a new one replaces the old.
- **Passives** are offered once you hold one of that god's boons; a **capstone** once you hold three.
- Every boon has up to three levels; an offer can be an upgrade (II, III) of one you hold.
- The altar shows three boons of the one god you paid.

## Kethara — control & order

Keyword: **Bound — stunned or paralysed**.

| Slot | Boon | I | II | III |
|---|---|---|---|---|
| Attack | ⚖ **Judgement** (`k_judgement`) | Your weapon deals +40% to a Bound foe, and each hit holds it Bound a turn longer. | +55% to a Bound foe; each hit extends its Bound by a turn. | +70% to a Bound foe; each hit extends its Bound by a turn. |
| Magic | 📜 **Edict** (`k_edict`) | Casting a skill Binds every foe beside you for 2 turns. | Casting a skill Binds every foe beside you for 2 turns, and the nearest foe within 3 as well. | Casting a skill Binds every foe beside you for 3 turns, and the nearest foe within 3 as well. |
| Move | ✥ **Procession** (`k_procession`) | Every 4th step leaves a Sigil (up to 3). The next foe to step on one is Bound for 2 turns. | Every 3rd step leaves a Sigil (up to 3); Bound for 2 turns. | Every 3rd step leaves a Sigil (up to 4); Bound for 3 turns. |
| Struck | ✋ **Rebuke** (`k_rebuke`) | A foe that hits you is Bound for 2 turns (once per foe every 5 turns). | A foe that hits you is Bound for 2 turns (once per foe every 3 turns). | A foe that hits you is Bound for 3 turns (once per foe every 3 turns). |
| Death's Door | ⛨ **Sanctuary** (`k_sanctuary`) | Once a floor, falling below 20% HP Binds every foe within 3 for 3 turns. +5 AC while below 20%. | …Binds every foe within 3 for 4 turns. +5 AC while below 20%. | …Binds every foe within 4 for 5 turns. +7 AC while below 20%. |
| Passive | ⛓ **Iron Law** (`k_ironlaw`) | Every Bind you cause lasts 1 turn longer. | Every Bind you cause lasts 1 turn longer, bosses included. | Every Bind you cause lasts 2 turns longer. |
| Passive | ⚜ **Chains of Office** (`k_chains`) | Bound foes take +15% damage from you. | Bound foes take +20% damage from you. | Bound foes take +25% damage from you. |
| Passive | 🪙 **Tithe** (`k_tithe`) | Killing a Bound foe restores 2 MP. | Killing a Bound foe restores 3 MP. | Killing a Bound foe restores 4 MP and 2 HP. |
| Passive | 🛡 **Discipline** (`k_discipline`) | +1 AC for each Kethara boon you hold. | +1 AC per Kethara boon, +1 more. | +2 AC for each Kethara boon you hold. |
| Capstone | ☀ **Absolute Order** (`k_absolute`) | A foe that starts its turn beside a Bound foe is Bound too (once every 10 turns per foe). Order spreads. |  |  |

## Auvris — chaos & nature

Keyword: **Wild — plants, gases, elements**.

| Slot | Boon | I | II | III |
|---|---|---|---|---|
| Attack | 🌿 **Thornlash** (`a_thornlash`) | 25% of your weapon hits sprout a random plant under the target, which goes off at once. | 35% of hits sprout a plant under the target. | 45% of hits sprout a plant under the target. |
| Magic | 🌪 **Wild Surge** (`a_surge`) | Casting a skill looses a random cloud — fire, frost, toxic or confusion — on the nearest foe. | …a bigger cloud. | …a bigger cloud, and on the two nearest foes. |
| Move | 🌱 **Overgrowth** (`a_overgrowth`) | Grass springs up in your footsteps; every 5th step grows tall grass, which hides you. | …every 4th step grows tall grass. | …every 3rd step grows tall grass. |
| Struck | 🌵 **Bramble Hide** (`a_bramble`) | A foe that hits you takes 2 + depth/4 thorn damage and 1 poison. | 3 + depth/4 thorn damage and 2 poison. | 4 + depth/4 thorn damage and 3 poison. |
| Death's Door | 🌻 **Last Bloom** (`a_lastbloom`) | Once a floor, falling below 20% HP grows a Sungrass under you — it heals you while you stand in it. | …and heals 10 at once. | …and heals 20 at once. |
| Passive | 🪴 **Green Thumb** (`a_greenthumb`) | Every plant you grow or sprout grows a twin beside it. | …a twin, and seeds drop twice as often. | …two twins. |
| Passive | 🌦 **Fey Weather** (`a_fey`) | Fire, frost and confusion gas no longer affect you, and clouds you loose are 50% larger. | …clouds you loose are 75% larger. | …clouds you loose are twice as large. |
| Passive | 🎲 **Chaos Theory** (`a_chaos`) | Each Wild effect has a 15% chance to happen twice. | 20% chance to happen twice. | 25% chance to happen twice. |
| Passive | 🧺 **Forager** (`a_forager`) | Trampled grass drops a seed 1 time in 8 (it was 1 in 25). | 1 time in 6. | 1 time in 5. |
| Capstone | ⛈ **Storm of Seasons** (`a_storm`) | Every 20 turns, a random storm of gas bursts on the nearest foe you can see. |  |  |

## Maelon — death & renewal

Keyword: **Rot — poison, and healing from death**.

| Slot | Boon | I | II | III |
|---|---|---|---|---|
| Attack | ☠ **Rotting Touch** (`m_rot`) | Your weapon hits add 2 poison. | Your weapon hits add 3 poison. | Your weapon hits add 4 poison. |
| Magic | 🌾 **Harvest** (`m_harvest`) | Casting a skill while a poisoned foe is in sight refunds half its MP. | …refunds 60% of its MP. | …refunds 75% of its MP. |
| Move | 🍂 **Grave Wind** (`m_gravewind`) | Each step heals 1 while a poisoned foe is within 3 tiles. | Each step heals 1 while a poisoned foe is within 4. | Each step heals 2 while a poisoned foe is within 4. |
| Struck | 🦠 **Contagion** (`m_contagion`) | A foe that hits you gets 3 poison. | A foe that hits you gets 4 poison. | A foe that hits you gets 5 poison. |
| Death's Door | 💀 **Second Breath** (`m_breath`) | Once a floor, below 20% HP, your next kill heals 30% of your max HP. | …heals 40%. | …heals 50%. |
| Passive | 🩸 **Fester** (`m_fester`) | Poison deals +1 a tick for each Maelon boon you hold. | …+1 per boon, +1 more. | +2 a tick for each Maelon boon you hold. |
| Passive | ⚰ **Plague Bearer** (`m_plague`) | A poisoned foe that dies passes its remaining poison to every foe beside it. | …and half again as much. | …and twice as much. |
| Passive | ✚ **Maelon's Grace** (`grace`) | Regain 2 + level/5 HP on every kill. | Regain 3 + level/5 HP on every kill. | Regain 4 + level/5 HP on every kill. |
| Passive | 🗡 **Merciful End** (`merciful`) | A hit kills outright any foe below your level% of its health. | …below 1.25× your level%. | …below 1.5× your level%. |
| Capstone | ⚱ **Death Refused** (`second_chance`) | The first killing blow each run heals you fully instead. |  |  |

## Ourn — time

Keyword: **Haste (you) and Chill (foes)**.

| Slot | Boon | I | II | III |
|---|---|---|---|---|
| Attack | ⏱ **Measured Strike** (`o_measured`) | Every 3rd hit in a row on the same foe is a critical. | …and +25% critical damage. | Every 2nd hit in a row on the same foe is a critical. |
| Magic | 🎼 **Rhythm of the Universe** (`rhythm`) | Each skill on cooldown makes all of them tick faster (1 + 1 per waiting skill a turn). | …+1 more a turn. | …+2 more a turn. |
| Move | 👣 **Stride of Hours** (`o_stride`) | Each step gives +2% haste, up to 20%. Being hit resets it. | +3% a step, up to 25%. | +4% a step, up to 30%. |
| Struck | ⌛ **Borrowed Time** (`o_borrowed`) | 25% of blows against you are split: half lands now, half 3 turns later. | 30% of blows are split. | 35% of blows are split. |
| Death's Door | ⏸ **Stopwatch** (`o_stopwatch`) | Once a floor, falling below 20% HP stops time for 3 turns. | …for 4 turns. | …for 5 turns. |
| Passive | ❄ **Entropy** (`o_entropy`) | Your weapon hits Chill the foe (half speed) for 1 turn. | …for 2 turns. | …for 2 turns, and a Chilled foe takes +10% from you. |
| Passive | ⚙ **Clockwork** (`o_clockwork`) | Your artifact charges 40% faster. | …60% faster. | …80% faster. |
| Passive | 👁 **Foresight** (`o_foresight`) | The first blow aimed at you on each floor always misses. | The first 2 blows each floor miss. | The first 3 blows each floor miss. |
| Passive | 💨 **Momentum** (`o_momentum`) | Each kill gives +30% haste for 3 turns. | +40% haste for 3 turns. | +50% haste for 4 turns. |
| Capstone | ♾ **Eternal Moment** (`o_eternal`) | While any haste is on you, every attack costs 20% less time. |  |  |

## The Label — cosmic horror

Keyword: **Madness — berserk and terrified foes**.

| Slot | Boon | I | II | III |
|---|---|---|---|---|
| Attack | 👄 **Unseen Mouths** (`l_mouths`) | 20% of your weapon hits drive the foe Mad: it attacks the nearest creature for 3 turns. | 25% of hits. | 30% of hits, for 4 turns. |
| Magic | 📖 **Whispering Page** (`l_page`) | A skill you lack the MP for may be paid in HP instead, at twice the cost. | …at 1.5× the cost. | …at the same cost. |
| Move | 🌀 **Wrong Geometry** (`l_geometry`) | Every 10th step, you slip 2 tiles further ahead — free. | Every 8th step. | Every 6th step. |
| Struck | 👁 **Gaze Back** (`l_gaze`) | A foe that hits you has a 30% chance to flee in terror for 3 turns. | 40% chance. | 50% chance, for 4 turns. |
| Death's Door | 🐙 **The Door Opens** (`l_door`) | Once a floor, falling below 20% HP tears open a door: a tentacle fights beside you for 10 turns. | …for 14 turns. | …for 18 turns. |
| Passive | 🌒 **Mad Ones** (`l_madones`) | Mad and terrified foes take +25% damage from you. | +35%. | +45%. |
| Passive | 🔮 **Eldritch Sight** (`l_sight`) | You sense monsters through walls within 3 tiles, and what you carry identifies twice as fast. | …within 4 tiles. | …within 5 tiles. |
| Passive | ✴ **Hungry Stars** (`l_hungry`) | Madness and terror you cause last 1 turn longer for each Label boon you hold. | …+1 more. | 2 turns longer per Label boon. |
| Passive | 🗝 **Price of Knowing** (`l_price`) | +3 to every stat now. On each new floor, -1 to a random stat. | +4 now, -1 a floor. | +5 now, -1 a floor. |
| Capstone | 👁‍🗨 **It Watches Back** (`l_watches`) | Every 25 turns, something from beyond strikes the nearest foe you can see for 20 + depth. |  |  |

## The Guild — gear

Keyword: **Tier — your equipment**.

| Slot | Boon | I | II | III |
|---|---|---|---|---|
| Attack | 🔪 **Honed Edge** (`g_honed`) | Your weapon deals +1 damage for each Guild boon you hold. | …+1 per boon, +1 more. | +2 for each Guild boon you hold. |
| Magic | ✨ **Enchanter's Focus** (`g_focus`) | For 3 turns after you cast a skill, your weapon's enchantments trigger 50% more often. | …75% more often. | …twice as often. |
| Move | 🎒 **Light Load** (`g_lightload`) | +15% walk haste while your pack holds 15 items or fewer. | +20%. | +25%. |
| Struck | 🔩 **Reinforced** (`g_reinforced`) | +2 armour block, and 10% of blows are reflected back at the attacker. | +3 block, 15% reflected. | +4 block, 20% reflected. |
| Death's Door | 🧪 **Emergency Kit** (`g_kit`) | Once a floor, falling below 20% HP, you drink a free Potion of Healing. | …and it heals half again as much. | …and it heals twice as much. |
| Passive | ⚒ **Artificer's Tools** (`artificer`) | The Guild presses 3–5 Scrolls of Upgrade into your hands at once. | 3–5 more. | 3–5 more. |
| Passive | 💍 **Ring Mastery** (`g_rings`) | Your rings count as one level higher. | …one level higher, +1 more. | …two levels higher. |
| Passive | 📦 **Salvager** (`g_salvager`) | Crates hold loot 60% of the time, and shop prices are 20% lower. | 70% of the time, 25% lower. | 80% of the time, 30% lower. |
| Passive | 💎 **Guild's Refinement** (`refinement`) | Doubles the maximum +X a dropped item can roll, and weights the roll toward the high end. | …and a little higher. | …and higher still. |
| Capstone | 🏅 **Masterwork** (`g_masterwork`) | At each boss kill, every item you wear gains one more enchantment. |  |  |

## Weapon enchantments — two per god

Weapons roll from these twelve (a gold weapon carries two different ones). In each god's pair, one puts the god's keyword on a foe and the other pays off on it, so a weapon can build toward the same god as your boons and your hero's god branch. Numbers are by the weapon's tier, 1 → 5. Mirrors `loot.enchants` in `data.js`.

| God | Enchant | Proc | Does | Tier 1 → 5 |
|---|---|---|---|---|
| Kethara | ⛓ **Binding** | 20% | A hit may Bind the foe — stunned — for 2 turns or more. Kethara's Iron Law lengthens it. | 2, 2, 3, 3, 4 |
| Kethara | ⚖ **Judging** | always | Every hit on a Bound foe lands harder, by a share of the weapon's power. | 20, 30, 40, 55, 75 |
| Auvris | 🌿 **Wild** | 30% | A hit may call something up out of the ground: a flare of fire, a gust of frost, a spit of poison, or a plant beside the foe. Auvris's Chaos can call it twice. | 0.5, 0.75, 1, 1.5, 2.5 |
| Auvris | ⛈ **Stormcalled** | 25% | A hit may throw lightning from the foe to others near it you can see — more of them on a better weapon. | 0.4, 0.6, 0.8, 1.1, 1.5 |
| Maelon | ☠ **Rotting** | 20% | Injects a dose equal to a tiered share of the weapon's power. Doses stack, and the poison ticks its total each turn, then fades by 1 — everything Maelon's Rot boons look for. | 0.2, 0.5, 0.8, 1, 1.5 |
| Maelon | 🩸 **Vampiric** | 25% | A hit may drink: you heal a share of the weapon's power. | 20, 30, 40, 50, 65 |
| Ourn | ❄ **Chilling** | 30% | A hit may Chill the foe — half speed, moving and swinging — for a few turns. | 3, 4, 5, 6, 8 |
| Ourn | ⏳ **Hastening** | 15% | A hit may quicken you: a burst of Haste that fades a point a turn. | 15, 20, 30, 40, 50 |
| The Label | 👁 **Maddening** | 12% | A hit may drive the foe berserk — it turns on whatever is nearest. Bosses are beyond it. | 2, 3, 3, 4, 5 |
| The Label | 🐙 **Dreadful** | 15% | A hit may show the foe something it cannot bear, and it flees. Terror is Madness, to the Label. Bosses are beyond it. | 2, 3, 4, 5, 6 |
| The Guild | ⚒ **Tempered** | always | Good steel, well kept: every hit deals flat extra damage. | 1, 2, 3, 5, 8 |
| The Guild | 🗡 **Keen** | while wielded | An edge you could shave with: more critical hits while you wield it. | 3, 5, 7, 10, 14 |

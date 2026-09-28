# Art Credits

> ## ⚠ NON-FREE PLACEHOLDER ART — REMOVE BEFORE ANY RELEASE
>
> The tiles below were cut from two tilesets the project owner supplied that are
> **not** CC0 or GPL-compatible. They are placeholders, used with the owner's
> say-so while nothing is being released, and **every one must be replaced (or
> deleted) before Cantori is published anywhere**:
>
> `bookshelf`, `pantry_shelf`, `cottage_floor`, `cottage_wall`, `cottage_bed`,
> `cottage_table`, `cottage_barrel`, `cottage_crates`, `cottage_sacks`,
> `cottage_hearth` — all in `assets/tiles/`, cut by `tools/cut_cottage_tiles.py`
> from the source sheets in `assets/source/nonfree/` (delete that folder too).
>
> The engine falls back to drawn shapes for all of them, so removing the files
> breaks nothing — it only brings back the old look.

The pixel-art sprites in `assets/tiles/` are from **Dungeon Crawl Stone Soup**
(https://github.com/crawl/crawl), whose tiles and artwork are released under the
**CC0 1.0 (public domain)** license
(https://creativecommons.org/publicdomain/zero/1.0/).

CC0 places no restrictions on use, but we credit the DCSS artists here with
thanks. Sprites used: player, rat, bat, adder (snake), wolf spider, goblin,
deep elf archer, dagger, short sword, mace, leather armour, chain mail, crystal
plate, potion, scroll, stone stairs, pebble floor, brick wall.

Sprite *filenames* track Cantori's own monster keys, which do not always match the
name DCSS gave the artwork — our Keener and Ember Fiend are drawn with DCSS tiles
originally published under other names, and our Goblin Archer wears DCSS's deep
elf archer, picked because the bow in its hands is the thing a player needs to
read at 32 pixels. Renaming a file changes nothing about the art's origin, and
the credit above covers it either way.

## Original tiles (also public domain)

Five of the crypt's monsters have no counterpart in the DCSS tileset, so their
sprites were drawn for Cantori rather than borrowed:

- Crypt monsters: `red_slime.png`, `black_slime.png`, `hollow_acolyte.png`,
  `brute.png`, `hollow_bard.png`
- Biome 4's boss: `djinn.png` — a whirling cone of fire with a man above it, in the
  silhouette of a classic RPG elemental; drawn for Cantori (by `PIL`, in the repo's history)
- Weapons: `Axe.png`, `big axe.png`, `spear.png`, `bow.png`, `Shitty_sword.png`
- Light armour: `grass_armor.png`, `cloth_armor.png`, `refined_robe.png`,
  `mages_robe.png`, `threads_of_fate.png`
- Medium armour: `padded_jerkin.png`, `studded_leather.png`, `scale_hauberk.png`,
  `elven_mail.png`, `windwoven_coat.png`
- Heavy armour: `rusted_mail.png`, `chainmail.png`, `banded_plate.png`,
  `knights_plate.png`, `adamant_bulwark.png`

The armour sets deliberately share one silhouette per subtype — a hooded robe for
light, a sleeveless jerkin for medium, a pauldroned breastplate for heavy — and
differ by palette and surface detail (quilting, studs, scales, mail, bands). A tier
should read as the same piece of kit made better, not as a different object.

They are original work and are released into the **public domain (CC0 1.0)**, on
the same terms as the DCSS art beside them, so nothing about the project's
licensing changes by mixing the two. They are composed from simple shapes at
32×32 and are deliberately plain: they exist so no data row renders as a bare
glyph, and any of them can be replaced with a better tile — DCSS or otherwise —
by dropping a new PNG over the same filename. Nothing in the code needs to know.

## Shattered Pixel Dungeon (GPLv3)

This repository ports game systems and may use art from **Shattered Pixel
Dungeon** (https://github.com/00-Evan/shattered-pixel-dungeon), released under
the **GNU GPL v3**, the licence this repository is distributed under. The SPD
commit we port from is pinned in `vendor/spd/README.md`. Credits, as SPD's own
About screen gives them — these must never be removed:

- **Shattered Pixel Dungeon** — developed by Evan Debenham (ShatteredPixel.com)
- **Pixel Dungeon** — developed by Watabou (watabou.itch.io), inspired by Brian
  Walker's Brogue
- Splash & dungeon art: Aleksandar Komitov
- Item pixel art: PumpkinVolt
- Additional pixel art: Alastair Braun
- Composer: Lumine Haaristo; Pixel Dungeon music: Cube Code
- Sound effects: Celesti, plus freesound.org samples under CC-BY and CC0 (listed
  in SPD's `AboutScene.java`) — the CC-BY ones need their own attribution here
  if any is ever copied in
- Pixel Dungeon GDX: Edu García; Shattered GDX help: Kevin MacMartin

Every SPD sprite added to `assets/tiles/` must be listed below with the SPD
asset file it was cut from.

### SPD sprites used

Cut by `tools/cut_spd_sprites.py` from SPD's sprite sheets at the pinned commit.
Each hero strip is the idle frame (column 0) of every armour-tier row, and nothing
else, stacked into a 12×105 strip. Each monster is its idle frame, doubled onto a
32×32 tile:

| File | SPD source | Class | Changes |
|---|---|---|---|
| `hero_warrior.png` | `core/src/main/assets/sprites/warrior.png` | Chadwick | none |
| `hero_monk.png` | `core/src/main/assets/sprites/rogue.png` | Brynn | skin recoloured blue |
| `hero_mage.png` | `core/src/main/assets/sprites/mage.png` | ToneTum | none |
| `hero_bard.png` | `core/src/main/assets/sprites/huntress.png` | Sera | none |

| `animated_statue.png` | `core/src/main/assets/sprites/statue.png` (idle frame, 2x) | Animated Statue | none |
| `rose_ghost.png` | `core/src/main/assets/sprites/ghost.png` (idle frame, 2x) | Dried Rose ghost | none |
| `skeleton.png`, `necromancer.png` | `core/src/main/assets/sprites/skeleton.png` (12×15), `necromancer.png` (16×16), idle frame, 2x | biome 3's Skeleton and Necromancer | none |
| `gnoll_scout.png`, `prison_guard.png`, `gnoll_brute.png`, `gnoll_shaman.png` | `core/src/main/assets/sprites/gnoll.png` (12×15), `guard.png` (12×16), `brute.png` (12×16), `shaman.png` (12×15), idle frame, 2x | biome 4's gnolls and guard | none |
| `town_*.png` (9) | `core/src/main/assets/environment/tiles_sewers.png` — SPD's first region — cells 0–3, 48, 56/57, 122/125, 2x | biome 4, the Town's climb | none |
| `prison_*.png` (9) | `core/src/main/assets/environment/tiles_prison.png`, cells 0–3 (floor, deco, grass, embers), 48 (flat wall), 56/57 (door), 122/125 (high grass), 2x | biome 3, the Prison | none |
| `bag_backpack.png`, `bag_seed.png`, `bag_scroll.png`, `bag_potion.png` | `core/src/main/assets/sprites/items.png`, the bag row (index 481–484), 2x | the bag tabs and bags | none |
| `trap_*.png` (9) | `core/src/main/assets/environment/terrain_features.png`, rows 0–5 (colour + 16 × shape, per SPD's Trap classes), 2x | the traps | none |
| `plant_*.png` (11) | `core/src/main/assets/environment/terrain_features.png`, row 7, 2x | the plants | none |
| `seed_*.png` (11) | `core/src/main/assets/sprites/items.png`, the seed row (index 384 on), 2x | the seeds | none |
| `forest_floor.png`, `forest_floor_deco.png`, `forest_lawn.png`, `forest_embers.png`, `forest_grass.png`, `forest_grass_alt.png` | `core/src/main/assets/environment/tiles_caves.png`, cells 0–3, 122 and 125, 2x | the forest's floor (SPD's caves) | none |
| `fx_steam.png` | `core/src/main/assets/effects/specks.png`, Speck's STEAM frame (index 13, 7×7), native size | every gas's puff, tinted per gas as SPD's Speck does | none |
| `art_*.png` (11) | `core/src/main/assets/sprites/items.png`, the artifact row (index 240 on), 2x | the eleven artifacts | none |

`hero_monk.png` is a modified version of SPD's art, released under GPLv3 like
the rest. The DCSS `player.png` stays as the fallback for any class without a
strip.

# Art Credits

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

_None yet._

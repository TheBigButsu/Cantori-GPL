#!/usr/bin/env python3
"""Cut the woodcutter's cottage tiles (and the shared bookshelf) out of the two
NON-FREE placeholder sheets in assets/source/nonfree/.

These sheets are NOT CC0 or GPL. Every tile this writes is a placeholder that
must be replaced before any release — see ART-CREDITS.md, "NON-FREE".

Crop boxes are in source-sheet pixels. textures_48.jpg is a 17x17 grid of 48px
texture cells; rpg_tileset.jpg is a downscaled RPG-Maker-style sheet whose tiles
are about 20px. Everything is resampled to the game's 32x32 tile size.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source", "nonfree")
OUT = os.path.join(ROOT, "assets", "tiles")
T = 32

TEX = lambda c, r: (c * 48, r * 48, c * 48 + 48, r * 48 + 48)
TILES = {
    # (sheet, box, keyBlack) — keyBlack turns the sheet's black background clear,
    # for furniture that sits on the plank floor rather than filling its tile.
    "cottage_floor":    ("textures_48.jpg", TEX(8, 6), False),   # light planks
    "cottage_wall":     ("textures_48.jpg", TEX(0, 6), False),   # log bark
    "bookshelf":        ("rpg_tileset.jpg", (338, 769, 358, 791), False),
    "pantry_shelf":     ("rpg_tileset.jpg", (318, 769, 338, 791), False),
    "cottage_crates":   ("rpg_tileset.jpg", (458, 715, 478, 735), False),
    "cottage_sacks":    ("rpg_tileset.jpg", (398, 735, 418, 755), True),
    "cottage_barrel":   ("rpg_tileset.jpg", (518, 754, 538, 776), True),
    "cottage_bed":      ("rpg_tileset.jpg", (318, 875, 338, 915), True),
    "cottage_table":    ("rpg_tileset.jpg", (358, 975, 378, 995), True),
    "cottage_hearth":   ("rpg_tileset.jpg", (227, 1034, 270, 1076), True),
}

def cut(sheet, box, key):
    im = Image.open(os.path.join(SRC, sheet)).convert("RGBA").crop(box)
    w, h = im.size
    s = T / max(w, h)                       # fit the long side, keep the aspect
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    out = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    out.paste(im, ((T - im.width) // 2, T - im.height))   # stand it on the floor
    if key:
        px = out.load()
        for y in range(T):
            for x in range(T):
                r, g, b, a = px[x, y]
                if max(r, g, b) < 34: px[x, y] = (0, 0, 0, 0)
    return out

if __name__ == "__main__":
    for name, (sheet, box, key) in TILES.items():
        cut(sheet, box, key).save(os.path.join(OUT, name + ".png"))
        print("wrote", name)

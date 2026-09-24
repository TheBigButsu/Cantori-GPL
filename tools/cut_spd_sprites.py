#!/usr/bin/env python3
"""Cut Cantori's SPD-derived sprites out of Shattered Pixel Dungeon's sheets.

    pip install pillow
    python3 tools/cut_spd_sprites.py

Writes assets/tiles/hero_<classkey>.png for each class below, and a 32x32
assets/tiles/<key>.png for each monster in MONSTERS. Pillow is a tool
dependency only; the game loads the finished PNGs and never runs this.

SPD's hero sheet (sprites/<hero>.png, 256x128) is a grid of 12x15 frames: each
ROW is one armour tier (HeroSprite.tiers()), each column an animation frame
(HeroSprite: idle is frame 0). We keep only column 0, the idle pose, for every
tier row, stacked into a 12 x (15 * TIERS) strip. game.js picks the row from the
equipped armour, so the hero changes clothes when you do, as in SPD.

Rows, as SPD uses them: 0 no armour, 1 cloth, 2 leather, 3 mail, 4 scale,
5 plate, 6 the hero's class armour. The sheet's eighth row is empty.
"""
import colorsys
import io
import os
import sys
import urllib.request

from PIL import Image

# Pinned in vendor/spd/README.md — move both together.
SPD_COMMIT = "2bb34a4e91d29c8785a9363cad6ddfe5122b1d4f"
SHEET_URL = ("https://raw.githubusercontent.com/00-Evan/shattered-pixel-dungeon/"
             + SPD_COMMIT + "/core/src/main/assets/sprites/{}.png")
FRAME_W, FRAME_H, TIERS = 12, 15, 7

# Cantori class key -> (SPD hero sheet, recolour the skin blue?)
HEROES = {
    "warrior": ("warrior", False),    # Chadwick
    "monk":    ("rogue", True),       # Brynn — blue-skinned
    "mage":    ("mage", False),       # ToneTum
    "bard":    ("huntress", False),   # Sera
}

# The six skin tones every SPD hero shares (face, hands, bare arms and legs) —
# found as the colours common to all four sheets' unarmoured frame, and checked
# by eye across all seven rogue rows to touch skin only, never cloth. Recolouring
# by palette rather than by region keeps every armour tier right without
# hand-masking seven frames — re-check the rows if the SPD pin ever moves.
SKIN = {
    (255, 218, 191), (255, 186, 143), (220, 180, 151),
    (190, 127, 89), (184, 151, 120), (133, 89, 56),
}


def to_blue(rgb):
    # Keep each tone's lightness so the face keeps its shading and outline, and
    # swing the hue to blue. The saturation lift stops the pale highlights from
    # washing out to grey.
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in rgb))
    r, g, b = colorsys.hls_to_rgb(0.58, l * 0.92, min(1.0, s * 0.9 + 0.15))
    return tuple(int(round(v * 255)) for v in (r, g, b))


def cut(sheet, blue):
    strip = Image.new("RGBA", (FRAME_W, FRAME_H * TIERS))
    for t in range(TIERS):
        strip.paste(sheet.crop((0, t * FRAME_H, FRAME_W, (t + 1) * FRAME_H)), (0, t * FRAME_H))
    if blue:
        px = strip.load()
        for y in range(strip.size[1]):
            for x in range(strip.size[0]):
                p = px[x, y]
                if p[3] and p[:3] in SKIN:
                    px[x, y] = to_blue(p[:3]) + (p[3],)
    return strip


# Cantori monster key -> (SPD sprite sheet, frame column). SPD mob frames are
# 12x15 in a single row; the idle frame is column 0. Written at 2x, bottom-centred
# on a transparent 32x32 tile — the size every other monster sprite is.
MONSTERS = {
    "animated_statue": ("statue", 0),   # SPD Statue (sprites/statue.png)
}


def cut_monster(sheet, col):
    frame = sheet.crop((col * FRAME_W, 0, (col + 1) * FRAME_W, FRAME_H)).resize((FRAME_W * 2, FRAME_H * 2), Image.NEAREST)
    tile = Image.new("RGBA", (32, 32))
    tile.paste(frame, ((32 - FRAME_W * 2) // 2, 32 - FRAME_H * 2), frame)
    return tile


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "tiles")
    for key, (hero, blue) in HEROES.items():
        with urllib.request.urlopen(SHEET_URL.format(hero)) as r:
            sheet = Image.open(io.BytesIO(r.read())).convert("RGBA")
        path = os.path.join(out_dir, "hero_" + key + ".png")
        cut(sheet, blue).save(path)
        print("wrote", os.path.relpath(path), "from", hero + ".png", "(blue skin)" if blue else "")
    for key, (sheet_name, col) in MONSTERS.items():
        with urllib.request.urlopen(SHEET_URL.format(sheet_name)) as r:
            sheet = Image.open(io.BytesIO(r.read())).convert("RGBA")
        path = os.path.join(out_dir, key + ".png")
        cut_monster(sheet, col).save(path)
        print("wrote", os.path.relpath(path), "from", sheet_name + ".png")
    return 0


if __name__ == "__main__":
    sys.exit(main())

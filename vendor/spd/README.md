# Shattered Pixel Dungeon — the version we port from

Ports in this repo are translated from one fixed SPD revision, so a port can always be traced back
to the exact Java it came from and re-checked against it:

- Repository: https://github.com/00-Evan/shattered-pixel-dungeon
- Tag: `v4.0.0`
- Commit: `2bb34a4e91d29c8785a9363cad6ddfe5122b1d4f`
- Licence: GPLv3 (the same `LICENSE` at this repo's root)

Browse a file at that revision with
`https://github.com/00-Evan/shattered-pixel-dungeon/blob/2bb34a4e91d29c8785a9363cad6ddfe5122b1d4f/<path>`.
Game logic lives under `core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/`
(`actors/blobs/`, `items/potions/`, `plants/`, `items/rings/`, `levels/rooms/special/`,
`actors/buffs/Hunger.java`), and art under `core/src/main/assets/`.

No SPD source is vendored here — it is Java and would never run in the page. This directory only
pins the revision. Move the pin deliberately, in its own commit, and re-check any port that depends
on a file that changed.

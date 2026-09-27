#!/usr/bin/env python3
"""Regenerate docs/SKILLS.md from the class skill trees in data.js.

data.js is the source of truth; this file mirrors it for reading. Run it after
editing any class's `branches` or `skillTree`.
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
DATA = json.loads(src[src.index("{"):src.rindex("}") + 1])
GATE = [0, 0, 3, 7, 15]   # mirrors BRANCH_GATE in game.js
GODS = {g: v.get("name", g) for g, v in DATA.get("gods", {}).items()}

def cell(t):
    return str(t).replace("|", "\\|").replace("\n", " ")

out = ["# Skill trees — the canon", "",
       "Generated from `data.js` by `tools/make_skills_doc.py` — the class `skillTree`s are the source of truth.", "",
       "## How the trees work", "",
       "- **Core** nodes are open from the start.",
       "- Each hero has **three branches**, of 5-rank nodes. A node opens by points spent *in its branch*: "
       "tier 2 at 3 points, tier 3 at 7, the capstone at 15.",
       "- The last node of each branch is a **pair of capstones — choose one**, for the rest of the run.",
       "- A run pays **37 points**: one Potion of Insight a floor (25) and 3 from each of the first four bosses (12). "
       "That is 16 by the Golem on floor 10 — exactly one branch and its capstone, going all-in — and a second capstone near the 32nd point. "
       "The third branch's capstone is out of reach: which two is the build.",
       "- One branch per hero (✦) belongs to that hero's god. It stands alone, and pairs with that god's boons.", ""]
for key, C in DATA["classes"].items():
    if not C.get("branches"):
        continue
    nodes = C["skillTree"]
    out += ["## %s %s" % (C.get("icon", ""), C["name"]), "", "*%s*" % C.get("blurb", ""), ""]
    groups = [("core", "Core", None)] + [(b["id"], b["name"], b) for b in C["branches"]]
    for bid, bname, b in groups:
        mine = sorted([n for n in nodes if n.get("branch") == bid], key=lambda n: (n.get("bt", 0), n.get("x", 0)))
        if not mine:
            continue
        head = "### " + ((b.get("icon", "") + " ") if b else "") + bname
        if b and b.get("god"):
            head += " ✦ (" + GODS.get(b["god"], b["god"]) + ")"
        out += [head, "", "| Opens at | Node | Kind | Ranks |", "|---|---|---|---|"]
        for n in mine:
            gate = "start" if bid == "core" else ("%d pts" % GATE[n.get("bt", 1)] if GATE[n.get("bt", 1)] else "0 pts")
            if n.get("cap"):
                gate += " · choose one"
            kind = "passive" if n["kind"] == "passive" else "active"
            ranks = "<br>".join("%s. %s" % (i + 1, cell(l)) for i, l in enumerate(n.get("levels", [])))
            out.append("| %s | %s **%s** — %s | %s | %s |" % (gate, n.get("icon", ""), n["name"], cell(n.get("desc", "")), kind, ranks))
        out.append("")
open(os.path.join(ROOT, "docs", "SKILLS.md"), "w", encoding="utf-8").write("\n".join(out))
print("wrote docs/SKILLS.md")

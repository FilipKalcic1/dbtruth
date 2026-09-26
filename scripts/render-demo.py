"""Renders docs/demo.gif: a terminal session, under 20 seconds, from real output.

Every line below is genuine. The query results come from the fixture in
docker-compose.yml (440 orders with an inner join, 500 with a left join, 60 in
'unknown'); the dbtruth lines are the terminal summary of a live run; the README
excerpt is the real context/README.md that run produced.

Run from the repository root:  python scripts/render-demo.py
Needs Pillow and a monospace TTF (Consolas on Windows, DejaVu Sans Mono elsewhere).
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 900, 520
PAD, LINE = 18, 23
FONT_SIZE = 16
TYPE_MS = 28          # per typed character
BG = (15, 17, 21)
COLORS = {
    "text": (220, 223, 228),
    "prompt": (110, 200, 120),
    "comment": (125, 130, 140),
    "dim": (150, 155, 165),
    "warn": (255, 160, 80),
    "head": (120, 190, 255),
}
FONT_CANDIDATES = [
    "C:/Windows/Fonts/consola.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
]


def load_font() -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, FONT_SIZE)
    raise SystemExit("no monospace TTF found; edit FONT_CANDIDATES")


FONT = load_font()


class Screen:
    """A scrollback of styled lines and the frames produced while it changes."""

    def __init__(self) -> None:
        self.lines: list[tuple[str, str]] = []
        self.frames: list[Image.Image] = []
        self.durations: list[int] = []

    def render(self, ms: int) -> None:
        img = Image.new("RGB", (WIDTH, HEIGHT), BG)
        draw = ImageDraw.Draw(img)
        visible = self.lines[-((HEIGHT - 2 * PAD) // LINE):]
        for i, (text, style) in enumerate(visible):
            y = PAD + i * LINE
            if style == "cmd":
                draw.text((PAD, y), "$ ", font=FONT, fill=COLORS["prompt"])
                draw.text((PAD + 2 * char_width(), y), text, font=FONT, fill=COLORS["text"])
            else:
                draw.text((PAD, y), text, font=FONT, fill=COLORS[style])
        self.frames.append(img)
        self.durations.append(ms)

    def type_command(self, command: str, pause_ms: int = 350) -> None:
        self.lines.append(("", "cmd"))
        for n in range(1, len(command) + 1):
            self.lines[-1] = (command[:n], "cmd")
            self.render(TYPE_MS)
        self.render(pause_ms)

    def output(self, lines: list[tuple[str, str]], pause_ms: int) -> None:
        self.lines.extend(lines)
        self.render(pause_ms)

    def blank(self) -> None:
        self.lines.append(("", "text"))

    def clear(self) -> None:
        self.lines = []


def char_width() -> int:
    return int(FONT.getlength("M"))


def wrap(text: str, width: int) -> list[str]:
    words, out, cur = text.split(" "), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            out.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        out.append(cur)
    return out


s = Screen()

# Scene 1: the agent's first attempt loses 60 orders and nobody notices.
s.type_command("cat report.sql")
s.output([
    ("-- agent's first attempt: orders per country", "comment"),
    ("SELECT c.country, count(*) AS orders", "text"),
    ("FROM orders o", "text"),
    ("JOIN customers c ON c.id = o.customer_id", "text"),
    ("GROUP BY 1", "text"),
    ("ORDER BY 1;", "text"),
], 900)
s.blank()
s.type_command("psql -f report.sql")
s.output([
    (" country | orders", "dim"),
    ("---------+--------", "dim"),
    (" AT      |    108", "text"),
    (" CZ      |    110", "text"),
    (" DE      |    110", "text"),
    (" SK      |    112", "text"),
    ("(4 rows)", "dim"),
    ("", "text"),
    ("-- 440 orders. 60 vanished in the join. Nobody noticed.", "warn"),
], 2000)

# Scene 2: run the tool. Lines are the real terminal output of a live run.
s.clear()
s.type_command("npx dbtruth")
disclosure = (
    "Sending to claude-sonnet-5 at effort low (by schema size, 1125 tokens): 11 relations "
    "(9 tables, 1 view, 1 materialized view, 1 partitioned), schema and per-column statistics, "
    "15 sample rows per table with high-cardinality columns hidden (--no-samples off, --reveal: none). "
    "Nothing else leaves this machine."
)
s.output([(line, "dim") for line in wrap(disclosure, 96)], 1000)
s.output([("contextualize: 11 tables described, 12 claims to test, 19.3s", "comment")], 800)
s.output([("verify: 12 measurements, 0.1s", "comment")], 500)
s.output([("write: 13 files, 15.2s", "comment")], 800)
s.output([
    ("dbtruth: fixture", "head"),
    ("relations: 9 tables, 1 view, 1 materialized view, 1 partitioned (fits in an agent's context)", "text"),
    ("relationships: 6 confirmed (3 on weak evidence), 1 broken, 0 rejected, 0 unverifiable, 0 empty", "text"),
    ("  orders.customer_id->customers.id  hit rate 88.0%", "warn"),
    ("suspicions: 4 confirmed, 0 rejected, 1 unverifiable, 0 empty", "text"),
    ("entities: 4, questions for a human: 5", "text"),
    ("files written: 14 under ./context/", "text"),
    ("database time: 0.1s, model time: 34.4s (contextualize 19.3s, write 15.2s)", "text"),
    ("tokens: 21502 in, 4006 out, 2 calls", "text"),
], 2400)

# Scene 3: what the agent reads next. The first six lines of that run's context/README.md, long ones wrapped.
s.clear()
s.type_command("head -6 context/README.md")
overview = (
    "This database (relations: 9 tables, 1 view, 1 materialized view, 1 partitioned) tracks "
    "customers, orders, order items, products, a fleet of vehicles, and an audit log. Per-table "
    "detail lives in context/tables/<table>.md."
)
broken = (
    "**orders.customer_id -> customers.id** (inferred: no declared foreign key found): 500 sampled "
    "rows, 0 nulls, 440 hits, 60 orphans (hit rate 0.88). All 60 orphans fall above the highest "
    "customers.id, suggesting customers that were never loaded or ids from another sequence. LEFT "
    "JOIN customers from orders, or filter/handle unmatched customer_id."
)
s.output([
    ("## Overview", "head"),
    *[(line, "text") for line in wrap(overview, 96)],
    ("", "text"),
    ("## Broken relationships", "head"),
    ("", "text"),
    *[(line, "warn") for line in wrap(broken, 96)],
], 3000)

# Scene 4: the agent's second attempt. Every order is counted.
s.clear()
s.type_command("cat report.sql")
s.output([
    ("-- second attempt, after reading context/README.md", "comment"),
    ("SELECT coalesce(c.country, 'unknown') AS country, count(*) AS orders", "text"),
    ("FROM orders o", "text"),
    ("LEFT JOIN customers c ON c.id = o.customer_id", "text"),
    ("GROUP BY 1", "text"),
    ("ORDER BY 1;", "text"),
], 900)
s.blank()
s.type_command("psql -f report.sql")
s.output([
    (" country | orders", "dim"),
    ("---------+--------", "dim"),
    (" AT      |    108", "text"),
    (" CZ      |    110", "text"),
    (" DE      |    110", "text"),
    (" SK      |    112", "text"),
    (" unknown |     60", "warn"),
    ("(5 rows)", "dim"),
    ("", "text"),
    ("-- 500 orders. The 60 are visible now.", "prompt"),
], 2600)

os.makedirs("docs", exist_ok=True)
frames = [f.quantize(colors=32, method=Image.Quantize.MEDIANCUT) for f in s.frames]
frames[0].save(
    "docs/demo.gif",
    save_all=True,
    append_images=frames[1:],
    duration=s.durations,
    loop=0,
    optimize=True,
)
total = sum(s.durations) / 1000
print(f"docs/demo.gif: {len(frames)} frames, {total:.1f} s, {os.path.getsize('docs/demo.gif') // 1024} KB")
if total >= 20:
    raise SystemExit("too long: the spec says under 20 seconds")

#!/usr/bin/env python3
"""Build index.html from src/: inlines src/players.js and src/game.js into src/template.html.
Run from the repo root:  python3 tools/build.py"""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
src = root / 'src'
t = (src / 'template.html').read_text(encoding='utf-8')
assert '/*__PLAYERS__*/' in t and '/*__GAME__*/' in t, 'template placeholders missing'
out = t.replace('/*__PLAYERS__*/', (src / 'players.js').read_text(encoding='utf-8')).replace('/*__GAME__*/', (src / 'game.js').read_text(encoding='utf-8'))
(root / 'index.html').write_text(out, encoding='utf-8')
print(f'Built index.html ({len(out) // 1024} KB)')

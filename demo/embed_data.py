#!/usr/bin/env python3
"""Embed a CSV file into demo/data.js as window.__CSV__.

Usage: python3 demo/embed_data.py <input.csv> [demo/data.js]

This lets the static demo render synchronously (no fetch), which makes it work
from file:// and produces reliable headless screenshots. The live app does not
use this; it fetches the sheet on every load.
"""
import json, sys

src = sys.argv[1] if len(sys.argv) > 1 else "demo/data.csv"
out = sys.argv[2] if len(sys.argv) > 2 else "demo/data.js"
with open(src, "r", encoding="utf-8") as f:
    text = f.read()
with open(out, "w", encoding="utf-8") as f:
    f.write("window.__CSV__ = " + json.dumps(text) + ";\n")
print(f"embedded {len(text)} chars from {src} -> {out}")

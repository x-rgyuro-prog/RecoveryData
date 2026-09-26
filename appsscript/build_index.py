#!/usr/bin/env python3
"""Generate the Apps Script companion files from the demo/ sources.

Index.html is a small, hand-written shell (no backticks) that loads the code and
styles at runtime. This script just copies the dashboard code/styles into the
Apps Script HTML files that Index.html requests via google.script.run:

  appsscript/AppJs.html   <- demo/app.js   (raw JS)
  appsscript/Styles.html  <- demo/styles.css (raw CSS)

Paste each of these into an Apps Script HTML file of the same name.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

for src, dest in [("demo/app.js", "AppJs.html"), ("demo/styles.css", "Styles.html")]:
    content = open(os.path.join(ROOT, src), encoding="utf-8").read()
    out = os.path.join(HERE, dest)
    with open(out, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"wrote {out} ({len(content)} bytes)  <- {src}")

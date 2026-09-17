#!/usr/bin/env python3
"""Bundle the demo into a single self-contained HTML file.

Inlines styles.css, data.js, and app.js into one .html so it can be opened by
double-clicking (file://) with no server, no build, and no network.

Usage: python3 demo/build_standalone.py [demo/data.js] [out.html]
"""
import os, sys, re

HERE = os.path.dirname(os.path.abspath(__file__))
data_js = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "data.js")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "standalone.html")


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


html = read(os.path.join(HERE, "index.html"))
css = read(os.path.join(HERE, "styles.css"))
data = read(data_js)
app = read(os.path.join(HERE, "app.js"))

html = re.sub(r'<link rel="stylesheet" href="\./styles\.css[^"]*" />', lambda _: f"<style>\n{css}\n</style>", html)
html = re.sub(r'<script src="\./data\.js[^"]*"></script>', lambda _: f"<script>\n{data}\n</script>", html)
html = re.sub(r'<script src="\./app\.js[^"]*"></script>', lambda _: f"<script>\n{app}\n</script>", html)

with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print(f"wrote {out} ({os.path.getsize(out)} bytes)")

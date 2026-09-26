#!/usr/bin/env python3
"""Generate the Apps Script companion files (base64-encoded) from demo/ sources.

app.js / styles.css are base64-encoded into AppJs.html / Styles.html. Base64 is
pure ASCII with no <, >, backticks, or non-ASCII, so Apps Script's
getContent() never sees "malformed HTML", and the payload never passes through
document.write. Index.html decodes them at runtime and injects via textContent.
"""
import base64, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

for src, dest in [("demo/app.js", "AppJs.html"), ("demo/styles.css", "Styles.html")]:
    raw = open(os.path.join(ROOT, src), "rb").read()
    b64 = base64.b64encode(raw).decode("ascii")
    out = os.path.join(HERE, dest)
    with open(out, "w", encoding="utf-8") as f:
        f.write(b64)
    print(f"wrote {out} ({len(b64)} base64 chars)  <- {src}")

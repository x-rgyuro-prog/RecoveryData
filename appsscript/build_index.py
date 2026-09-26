#!/usr/bin/env python3
"""Assemble a single self-contained Apps Script Index.html.

Inlines demo/styles.css and demo/app.js into one HTML file, adds the
Fleet Response DOM shell and the google.script.run bridge that feeds the
live sheet into the dashboard's boot(). Output: appsscript/Index.html
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
css = open(os.path.join(ROOT, "demo", "styles.css"), encoding="utf-8").read()
app = open(os.path.join(ROOT, "demo", "app.js"), encoding="utf-8").read()

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fleet Response Dashboard</title>
  <style>
__CSS__
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">FR</div>
        <div>
          <div class="brand-name">Fleet Response</div>
          <div class="brand-sub">Recovery operations analytics</div>
        </div>
      </div>
      <nav id="nav"></nav>
      <div class="sidebar-footer">
        <span class="badge-live"><span class="dot"></span> Live Google Sheet</span>
        <div style="margin-top: 10px">Data is read live from the sheet each time this opens.</div>
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1 class="page-title">Fleet Response Dashboard</h1>
          <div class="page-subtitle" id="subtitle">Fetching live data from Google Sheets\u2026</div>
        </div>
        <div class="header-controls">
          <div class="controls" id="rangeControls"></div>
          <div id="geoControls"></div>
          <div id="fileControls"></div>
        </div>
      </div>
      <div id="content"></div>
    </main>
  </div>
  <input type="file" id="fileInput" accept=".csv,text/csv" style="display: none" />

  <!-- Fleet Response dashboard (self-contained, no external libraries) -->
  <script>
__APP__
  </script>

  <!-- Bridge: pull the live sheet via Apps Script and render it with boot() -->
  <script>
    function __cell(c) {
      if (c == null) return "";
      if (Object.prototype.toString.call(c) === "[object Date]")
        return (c.getMonth() + 1) + "/" + c.getDate() + "/" + c.getFullYear();
      return String(c);
    }
    function __toCSV(rows) {
      return rows.map(function (r) {
        return r.map(function (c) {
          var s = __cell(c);
          return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(",");
      }).join("\\n");
    }
    function __bootError(msg) {
      var s = document.getElementById("subtitle");
      if (s) { s.textContent = "Error: " + msg; s.style.color = "#ff6b8b"; }
    }
    window.addEventListener("load", function () {
      if (!(window.google && google.script && google.script.run)) return; // not in Apps Script (e.g. preview)
      google.script.run
        .withSuccessHandler(function (values) {
          if (values && values.error) { __bootError(values.error); return; }
          if (!values || values.length < 2) { __bootError("Sheet is empty or missing headers."); return; }
          boot(__toCSV(values));
        })
        .withFailureHandler(function (err) { __bootError(err && err.message ? err.message : err); })
        .getDashboardData();
    });
  </script>
</body>
</html>
"""

out = TEMPLATE.replace("__CSS__", css).replace("__APP__", app)
dest = os.path.join(HERE, "Index.html")
with open(dest, "w", encoding="utf-8") as f:
    f.write(out)
print(f"wrote {dest} ({len(out)} bytes)")

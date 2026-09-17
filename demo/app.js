"use strict";
/* ============================================================
   Fleet Response — operations analytics (interactive)
   Tailored to the FR Historical Data (Responses) dataset.
   Charts support view toggles (bar/pie/line) and grouping
   toggles (hour↔part-of-day, day↔weekday/weekend, month↔week,
   median↔mean), combinable per the user's request.
   ============================================================ */

/* ---------------- palette + format ---------------- */
const COLORS = ["#4f8cff","#22d3a6","#f6b73c","#ff6b8b","#a78bfa","#38bdf8","#fb923c","#4ade80","#e879f9","#facc15","#2dd4bf","#f472b6"];
const color = (i) => COLORS[i % COLORS.length];
const nf = new Intl.NumberFormat("en-US");
const fmtNum = (n) => nf.format(n);
const fmtPct = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
const fmtMin = (n) => `${(Math.round(n * 10) / 10).toFixed(1)} min`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- CSV parser ---------------- */
function parseCSV(text) {
  const rows = []; let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1).map((r) => { const o = {}; headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim())); return o; })
    .filter((o) => Object.values(o).some((v) => v !== ""));
  return { headers: headers.filter(Boolean), rows: data };
}

/* ---------------- column map ---------------- */
const H = {
  date: "Date Created", vh6: "VH6 # (eg. vh6b_000 or vh6d_000)", status: "Status", type: "Dispatch Type",
  l0: "True or False Positive (L0s ONLY)", reason: "Reason for Event", milestone: "ZR# (Milestone)",
  assignee: "Assignee", action: "Was the vehicle Towed, Rovebotted, Inspected, Tailed or RTB/Auto",
  location: "Location", supervisor: "Supervisor", ridersIn: "Riders in The VH6", day: "Day", hour: "24hr",
  mCreatedAccept: "created_to_accepted_min", mAcceptArrive: "accepted_to_arrived_min",
  mDispatchArrive: "dispatch_to_arrived_on_scene_mins", mOnScene: "on_scene_work_mins",
  mReturn: "return_to_base_mins", mTurnaround: "turnaround_time_mins", deadhead: "deadhead_percentage",
};

/* ---------------- value helpers ---------------- */
const EMPTY = new Set(["", "n/a", "na", "null", "tbd", "none"]);
function clean(v) { const s = (v ?? "").trim(); return EMPTY.has(s.toLowerCase()) ? "" : s; }
function toNum(v) { const s = (v ?? "").replace(/[$,%\s]/g, ""); if (s === "" || EMPTY.has(s.toLowerCase())) return null; const n = Number(s); return Number.isFinite(n) ? n : null; }
function parseDate(s) {
  s = (s ?? "").trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let [, mm, dd, yy] = m; let y = Number(yy); if (yy.length === 2) y += y < 70 ? 2000 : 1900; if (+mm <= 12) { const d = new Date(y, mm - 1, dd); if (!isNaN(d)) return d; } }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s); if (!isNaN(d)) return d; }
  return null;
}
function col(k) { return STATE.records.map((r) => r[k]); }
function cleaned(k) { return col(k).map(clean).filter((v) => v !== ""); }
function counts(k, limit) {
  const m = new Map();
  cleaned(k).forEach((v) => m.set(v, (m.get(v) || 0) + 1));
  let items = [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  return limit ? items.slice(0, limit) : items;
}
function topPlusOther(k, n) {
  const all = counts(k);
  if (all.length <= n) return all;
  const top = all.slice(0, n), other = all.slice(n).reduce((a, b) => a + b.count, 0);
  return [...top, { label: "Other", count: other }];
}
function nums(k) { return col(k).map(toNum).filter((n) => n !== null); }
function posNums(k) { return nums(k).filter((n) => n > 0); }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function percentile(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
function pctTrue(k) { const v = cleaned(k).map((x) => x.toUpperCase()); const t = v.filter((x) => x === "TRUE").length, f = v.filter((x) => x === "FALSE").length; return t + f ? (t / (t + f)) * 100 : 0; }

function aggByCategory(catKey, numKey, limit, agg) {
  const groups = new Map();
  STATE.records.forEach((r) => { const c = clean(r[catKey]); const n = toNum(r[numKey]); if (!c || n === null || n <= 0) return; const g = groups.get(c) || []; g.push(n); groups.set(c, g); });
  return [...groups.entries()].map(([label, arr]) => ({ label, val: agg(arr), count: arr.length }))
    .filter((x) => x.count >= 5).sort((a, b) => b.val - a.val).slice(0, limit);
}
function fmtPeriod(p) { const [y, mo] = p.split("-"); return mo && !p.includes("W") ? new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : p; }
function series(dateKey, mode, valueFn) {
  const m = new Map();
  STATE.records.forEach((r) => {
    const d = parseDate(r[dateKey]); if (!d) return;
    let key, label;
    if (mode === "week") { const w = isoWeek(d); key = `${w.year}-W${String(w.week).padStart(2, "0")}`; label = `W${String(w.week).padStart(2, "0")}`; }
    else { key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; label = fmtPeriod(key); }
    const g = m.get(key) || { rows: [], label }; g.rows.push(r); m.set(key, g);
  });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, g]) => ({ period, label: g.label, count: g.rows.length, val: valueFn ? valueFn(g.rows) : g.rows.length }));
}
function isoWeek(d) { const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - dn + 3); const ft = new Date(Date.UTC(date.getUTCFullYear(), 0, 4)); const week = 1 + Math.round(((date - ft) / 86400000 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7); return { year: date.getUTCFullYear(), week }; }

const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function dayOfWeek() { const m = new Map(); cleaned(H.day).forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return DOW.filter((d) => m.has(d)).map((d) => ({ label: d.slice(0, 3), count: m.get(d) })); }
function weekdayWeekend() { let wd = 0, we = 0; cleaned(H.day).forEach((d) => { if (d === "Saturday" || d === "Sunday") we++; else wd++; }); return [{ label: "Weekday", count: wd }, { label: "Weekend", count: we }]; }
function hourOfDay() { const m = new Map(); cleaned(H.hour).forEach((v) => { const n = Number(v); if (Number.isFinite(n)) { const k = String(n).padStart(2, "0"); m.set(k, (m.get(k) || 0) + 1); } }); return [...m.keys()].sort().map((k) => ({ label: k, count: m.get(k) })); }
function partOfDay() {
  const b = { Overnight: 0, Morning: 0, Afternoon: 0, Evening: 0 };
  cleaned(H.hour).forEach((v) => { const n = Number(v); if (!Number.isFinite(n)) return; if (n <= 5) b.Overnight++; else if (n <= 11) b.Morning++; else if (n <= 17) b.Afternoon++; else b.Evening++; });
  return Object.entries(b).map(([label, count]) => ({ label, count }));
}
/* completion vs cancellation share per category (inspired by ZR ComplCancel% tabs) */
function completionByCategory(catKey, limit) {
  const groups = new Map();
  STATE.records.forEach((r) => { const c = clean(r[catKey]); if (!c) return; const st = clean(r[H.status]).toLowerCase(); const g = groups.get(c) || { total: 0, completed: 0 }; g.total++; if (/complete/.test(st)) g.completed++; groups.set(c, g); });
  return [...groups.entries()].map(([label, g]) => ({ label, count: g.total, completed: g.completed, pct: g.total ? (g.completed / g.total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count).slice(0, limit);
}

/* ---------------- creative-chart data ---------------- */
const DOW_IDX = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
function dayHourAgg(metric) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ c: 0, vals: [] })));
  STATE.records.forEach((r) => {
    const di = DOW_IDX[clean(r[H.day])], h = Number(clean(r[H.hour]));
    if (di === undefined || !Number.isFinite(h) || h < 0 || h > 23) return;
    const cell = grid[di][h]; cell.c++;
    if (metric === "turnaround") { const t = toNum(r[H.mTurnaround]); if (t && t > 0) cell.vals.push(t); }
  });
  return grid.map((row) => row.map((cell) => (metric === "turnaround" ? (cell.vals.length ? median(cell.vals) : 0) : cell.c)));
}
function lerp(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function heatColor(t) {
  const stops = [[16, 24, 40], [79, 140, 255], [34, 211, 166], [246, 183, 60]];
  if (t <= 0) return `rgb(${stops[0].join(",")})`;
  const seg = 1 / (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t / seg));
  return `rgb(${lerp(stops[i], stops[i + 1], (t - i * seg) / seg).join(",")})`;
}

/* ---------------- SVG primitives ---------------- */
function svg(inner, w, h, fixedW) { return `<svg viewBox="0 0 ${w} ${h}" width="${fixedW ? w : "100%"}" height="${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; }
function lineChart(points, key, colr, fmt) {
  const W = 560, Ht = 280, pad = { l: 48, r: 16, t: 16, b: 34 };
  if (!points.length) return `<div class="empty-hint">No dated records.</div>`;
  const max = Math.max(...points.map((p) => p[key]), 1), iw = W - pad.l - pad.r, ih = Ht - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const area = `${pad.l},${pad.t + ih} ${line} ${x(points.length - 1)},${pad.t + ih}`;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/><text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmt ? fmt(max - (max / 4) * t) : fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const step = Math.ceil(points.length / 8);
  const labels = points.map((p, i) => (i % step === 0 ? `<text x="${x(i)}" y="${Ht - 10}" fill="#9aa7c2" font-size="11" text-anchor="middle">${esc(p.label ?? fmtPeriod(p.period))}</text>` : "")).join("");
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[key])}" r="3" fill="${colr}"/>`).join("");
  return svg(`${g}<polygon points="${area}" fill="${colr}" opacity="0.12"/><polyline points="${line}" fill="none" stroke="${colr}" stroke-width="2.5"/>${dots}${labels}`, W, Ht);
}
function barV(bins, colr, rotate) {
  const dense = bins.length > 26; // too many bars for a label under each one
  const showRotated = rotate && !dense;
  const W = 560, Ht = 260, pad = { l: 40, r: 12, t: 14, b: showRotated ? 52 : 34 };
  const max = Math.max(...bins.map((b) => b.count), 1), iw = W - pad.l - pad.r, ih = Ht - pad.t - pad.b, bw = iw / bins.length;
  const gap = Math.min(6, bw * 0.3), barW = Math.max(bw - gap, 1), radius = barW > 4 ? 4 : 1;
  const step = dense ? Math.ceil(bins.length / 12) : 1;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/><text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const bars = bins.map((b, i) => {
    const h = (b.count / max) * ih, bx = pad.l + i * bw + (bw - barW) / 2, by = pad.t + ih - h, cx = bx + barW / 2;
    let lbl = "";
    if (i % step === 0) lbl = showRotated
      ? `<text x="${cx.toFixed(1)}" y="${Ht - 36}" fill="#9aa7c2" font-size="9" text-anchor="end" transform="rotate(-35 ${cx.toFixed(1)} ${Ht - 36})">${esc(b.label)}</text>`
      : `<text x="${cx.toFixed(1)}" y="${Ht - 16}" fill="#9aa7c2" font-size="10" text-anchor="middle">${esc(b.label)}</text>`;
    return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="${radius}" fill="${bins.length <= 8 ? color(i) : colr}"/>${lbl}`;
  }).join("");
  return svg(`${g}${bars}`, W, Ht);
}
function barH(items, fmtRight) {
  if (!items.length) return `<div class="empty-hint">No data.</div>`;
  const rowH = 26, pad = { l: 160, r: 62, t: 8, b: 8 }, W = 560, Ht = pad.t + pad.b + items.length * rowH;
  const max = Math.max(...items.map((i) => i.val ?? i.count), 1), iw = W - pad.l - pad.r;
  const bars = items.map((it, i) => {
    const v = it.val ?? it.count, y = pad.t + i * rowH, w = Math.max((v / max) * iw, 1);
    const right = fmtRight ? fmtRight(it) : fmtNum(v);
    return `<text x="${pad.l - 8}" y="${y + rowH / 2 + 4}" fill="#c8d2e6" font-size="11" text-anchor="end">${esc(it.label.length > 26 ? it.label.slice(0, 25) + "…" : it.label)}</text>` +
      `<rect x="${pad.l}" y="${y + 4}" width="${w}" height="${rowH - 10}" rx="4" fill="${color(i)}"/>` +
      `<text x="${pad.l + w + 6}" y="${y + rowH / 2 + 4}" fill="#9aa7c2" font-size="11">${esc(right)}</text>`;
  }).join("");
  return svg(bars, W, Ht);
}
function annularSector(cx, cy, r, ir, a0, a1, fill) {
  const sweep = a1 - a0;
  if (sweep > Math.PI * 1.9999) { const mid = a0 + sweep / 2; return annularSector(cx, cy, r, ir, a0, mid, fill) + annularSector(cx, cy, r, ir, mid, a1, fill); }
  const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0), x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
  const xi1 = cx + ir * Math.cos(a1), yi1 = cy + ir * Math.sin(a1), xi2 = cx + ir * Math.cos(a0), yi2 = cy + ir * Math.sin(a0);
  const large = sweep > Math.PI ? 1 : 0;
  return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${ir} ${ir} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${fill}"/>`;
}
function pie(items, centerLabel, isDonut) {
  const W = 360, Ht = 300, cx = 150, cy = 150, r = 108, ir = isDonut ? 64 : 0;
  const total = items.reduce((a, b) => a + b.count, 0) || 1;
  let ang = -Math.PI / 2, paths = "";
  items.forEach((it, i) => { if (it.count <= 0) return; const a2 = ang + (it.count / total) * Math.PI * 2; paths += annularSector(cx, cy, r, ir, ang, a2, color(i)); ang = a2; });
  const center = isDonut ? `<text x="${cx}" y="${cy - 2}" fill="#e7ecf5" font-size="22" font-weight="800" text-anchor="middle">${fmtNum(total)}</text><text x="${cx}" y="${cy + 18}" fill="#9aa7c2" font-size="11" text-anchor="middle">${esc(centerLabel || "total")}</text>` : "";
  const legend = items.map((it, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${color(i)}"></span>${esc(it.label)} (${fmtNum(it.count)}, ${fmtPct((it.count / total) * 100)})</div>`).join("");
  return `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">${svg(paths + center, W, Ht, true)}<div class="legend" style="flex-direction:column;max-height:280px;overflow:auto">${legend}</div></div>`;
}
function stackedCompletion(items) {
  if (!items.length) return `<div class="empty-hint">No data.</div>`;
  const rowH = 30, pad = { l: 120, r: 70, t: 8, b: 8 }, W = 560, Ht = pad.t + pad.b + items.length * rowH, iw = W - pad.l - pad.r;
  const rows = items.map((it, i) => {
    const y = pad.t + i * rowH, cw = (it.pct / 100) * iw;
    return `<text x="${pad.l - 8}" y="${y + rowH / 2 + 4}" fill="#c8d2e6" font-size="11" text-anchor="end">${esc(it.label)}</text>` +
      `<rect x="${pad.l}" y="${y + 5}" width="${iw}" height="${rowH - 12}" rx="4" fill="#ff6b8b" opacity="0.55"/>` +
      `<rect x="${pad.l}" y="${y + 5}" width="${Math.max(cw, 1)}" height="${rowH - 12}" rx="4" fill="#22d3a6"/>` +
      `<text x="${pad.l + iw + 6}" y="${y + rowH / 2 + 4}" fill="#9aa7c2" font-size="11">${fmtPct(it.pct)}</text>`;
  }).join("");
  const legend = `<div class="legend"><div class="legend-item"><span class="legend-swatch" style="background:#22d3a6"></span>Completed</div><div class="legend-item"><span class="legend-swatch" style="background:#ff6b8b;opacity:.55"></span>Cancelled</div></div>`;
  return svg(rows, W, Ht) + legend;
}
function stagesBar(stages, label) {
  const valid = stages.filter((s) => s.val > 0), total = valid.reduce((a, s) => a + s.val, 0);
  if (!total) return `<div class="empty-hint">No timing data.</div>`;
  const W = 560, barH = 54, y = 30, pad = 4, iw = W - pad * 2;
  let x = pad, segs = "";
  valid.forEach((s, i) => { const w = (s.val / total) * iw; segs += `<rect x="${x}" y="${y}" width="${Math.max(w - 1, 1)}" height="${barH}" rx="3" fill="${color(i)}"/>` + (w > 46 ? `<text x="${x + w / 2}" y="${y + barH / 2 + 4}" fill="#0b1020" font-size="12" font-weight="700" text-anchor="middle">${s.val.toFixed(1)}</text>` : ""); x += w; });
  const legend = valid.map((s, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${color(i)}"></span>${esc(s.label)}: <b style="color:#e7ecf5;margin-left:4px">${fmtMin(s.val)}</b></div>`).join("");
  return `${svg(`<text x="${pad}" y="18" fill="#9aa7c2" font-size="12">${esc(label || "Median")} end-to-end turnaround: <tspan fill="#e7ecf5" font-weight="700">${total.toFixed(1)} min</tspan></text>${segs}`, W, y + barH + 10, false)}<div class="legend">${legend}</div>`;
}
function histogramSvg(values, capPct, colr) {
  const cap = percentile(values, capPct) || 1, capped = values.filter((n) => n <= cap), bc = 12, w = cap / bc;
  const bins = Array.from({ length: bc }, (_, i) => ({ from: i * w, to: (i + 1) * w, count: 0, label: `${Math.round(i * w)}` }));
  capped.forEach((n) => { let idx = Math.floor(n / w); if (idx >= bc) idx = bc - 1; if (idx < 0) idx = 0; bins[idx].count++; });
  return { cap, svg: barV(bins, colr) };
}

function heatmap(metric) {
  const grid = dayHourAgg(metric), days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], max = Math.max(1, ...grid.flat());
  const W = 560, padL = 42, padT = 24, right = 12, cw = (W - padL - right) / 24, ch = 28, Ht = padT + 7 * ch + 34;
  let cells = "", labels = "";
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) { const v = grid[d][h], x = padL + h * cw, y = padT + d * ch; cells += `<rect x="${x.toFixed(1)}" y="${y}" width="${(cw - 1.5).toFixed(1)}" height="${ch - 2}" rx="2" fill="${v > 0 ? heatColor(v / max) : "#0e1428"}"/>`; }
  days.forEach((d, i) => (labels += `<text x="${padL - 6}" y="${padT + i * ch + ch / 2 + 3}" fill="#9aa7c2" font-size="10" text-anchor="end">${d}</text>`));
  for (let h = 0; h < 24; h += 3) labels += `<text x="${(padL + h * cw + cw / 2).toFixed(1)}" y="${padT - 8}" fill="#9aa7c2" font-size="9" text-anchor="middle">${String(h).padStart(2, "0")}</text>`;
  const ly = padT + 7 * ch + 16; let leg = "";
  for (let i = 0; i < 40; i++) leg += `<rect x="${padL + i * 4}" y="${ly}" width="4" height="8" fill="${heatColor(i / 39)}"/>`;
  leg += `<text x="${padL - 6}" y="${ly + 8}" fill="#9aa7c2" font-size="9" text-anchor="end">low</text><text x="${padL + 40 * 4 + 6}" y="${ly + 8}" fill="#9aa7c2" font-size="9">high (${metric === "turnaround" ? Math.round(max) + "m" : fmtNum(max)})</text>`;
  return svg(cells + labels + leg, W, Ht);
}
function scatterChart(yKey, yLabel) {
  const xKey = H.mDispatchArrive;
  const pts = STATE.records.map((r) => ({ x: toNum(r[xKey]), y: toNum(r[yKey]) })).filter((p) => p.x != null && p.y != null && p.x > 0 && p.y > 0);
  if (pts.length < 3) return `<div class="empty-hint">Not enough timed dispatches in this range.</div>`;
  const xMax = percentile(pts.map((p) => p.x), 97) || 1, yMax = percentile(pts.map((p) => p.y), 97) || 1;
  const W = 560, Ht = 300, pad = { l: 48, r: 14, t: 14, b: 42 }, iw = W - pad.l - pad.r, ih = Ht - pad.t - pad.b;
  const X = (v) => pad.l + (Math.min(v, xMax) / xMax) * iw, Y = (v) => pad.t + ih - (Math.min(v, yMax) / yMax) * ih;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/><text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="10" text-anchor="end">${Math.round(yMax - (yMax / 4) * t)}</text>`; }
  for (let t = 0; t <= 4; t++) { const gx = pad.l + (iw / 4) * t; g += `<text x="${gx}" y="${Ht - 24}" fill="#9aa7c2" font-size="10" text-anchor="middle">${Math.round((xMax / 4) * t)}</text>`; }
  const dots = pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.5" fill="${color(0)}" opacity="0.32"/>`).join("");
  const ax = `<text x="${pad.l + iw / 2}" y="${Ht - 6}" fill="#9aa7c2" font-size="11" text-anchor="middle">Response time — dispatch → on scene (min)</text><text x="14" y="${pad.t + ih / 2}" fill="#9aa7c2" font-size="11" text-anchor="middle" transform="rotate(-90 14 ${pad.t + ih / 2})">${esc(yLabel)} (min)</text>`;
  return svg(g + dots + ax, W, Ht);
}

/* categorical dispatcher used by many widgets */
function catChart(items, view, centerLabel) {
  if (view === "pie") return pie(items, centerLabel, false);
  if (view === "donut") return pie(items, centerLabel, true);
  if (view === "column") return barV(items, color(0), items.length > 8);
  return barH(items);
}

/* ---------------- widget framework ---------------- */
const WIDGETS = {
  volume: {
    title: "Dispatch Volume Over Time",
    defaults: { view: "line", group: "month" },
    controls: [{ group: "view", opts: [["line", "Line"], ["column", "Bar"]] }, { group: "group", opts: [["month", "Monthly"], ["week", "Weekly"]] }],
    sub: (s) => (s.group === "week" ? "Weekly" : "Monthly") + " fleet-response events",
    render(s) { const pts = series(H.date, s.group); return s.view === "column" ? barV(pts.map((p) => ({ label: p.label, count: p.count })), color(0), pts.length > 14) : lineChart(pts, "count", color(0)); },
  },
  dtype: {
    title: "By Dispatch Type", defaults: { view: "bar" },
    controls: [{ group: "view", opts: [["bar", "Bar"], ["pie", "Pie"]] }],
    sub: () => "What triggered the response",
    render(s) { return catChart(counts(H.type, 10), s.view, "dispatches"); },
  },
  status: {
    title: "Status", defaults: { view: "donut" },
    controls: [{ group: "view", opts: [["donut", "Donut"], ["pie", "Pie"], ["bar", "Bar"]] }],
    sub: () => "Completed vs cancelled",
    render(s) { return catChart(counts(H.status), s.view, "dispatches"); },
  },
  hour: {
    title: "Dispatches by Time of Day", defaults: { view: "column", group: "hour" },
    controls: [{ group: "view", opts: [["column", "Bar"], ["pie", "Pie"]] }, { group: "group", opts: [["hour", "By hour"], ["part", "Part of day"]] }],
    sub: (s) => (s.group === "part" ? "Overnight / Morning / Afternoon / Evening" : "24-hour demand curve"),
    render(s) { const items = s.group === "part" ? partOfDay() : hourOfDay(); return s.view === "pie" ? pie(items, "dispatches", true) : barV(items, color(4), s.group === "hour"); },
  },
  dow: {
    title: "Dispatches by Day", defaults: { view: "column", group: "day" },
    controls: [{ group: "view", opts: [["column", "Bar"], ["pie", "Pie"]] }, { group: "group", opts: [["day", "By day"], ["we", "Weekday/Weekend"]] }],
    sub: (s) => (s.group === "we" ? "Weekday vs weekend" : "When demand peaks"),
    render(s) { const items = s.group === "we" ? weekdayWeekend() : dayOfWeek(); return s.view === "pie" ? pie(items, "dispatches", true) : barV(items, color(0)); },
  },
  location: {
    title: "Dispatches by Location", defaults: { view: "bar" },
    controls: [{ group: "view", opts: [["bar", "Bar"], ["pie", "Pie"]] }],
    sub: () => "Where events happen",
    render(s) { return catChart(counts(H.location, 8), s.view, "dispatches"); },
  },
  milestone: {
    title: "By Autonomy Milestone", defaults: { view: "bar" },
    controls: [{ group: "view", opts: [["bar", "Bar"], ["pie", "Pie"]] }],
    sub: () => "ZR milestone at time of event",
    render(s) { return catChart(counts(H.milestone, 8), s.view, "dispatches"); },
  },
  reason: {
    title: "Reason for Event", defaults: { view: "bar", group: "all" },
    controls: [{ group: "view", opts: [["bar", "Bar"], ["pie", "Pie"]] }, { group: "group", opts: [["all", "All"], ["top", "Top 6 + Other"]] }],
    sub: () => "Why the VH6 needed response",
    render(s) { const items = s.group === "top" ? topPlusOther(H.reason, 6) : counts(H.reason, 14); return catChart(items, s.view, "events"); },
  },
  l0: {
    title: "L0 Alert Accuracy", defaults: { view: "donut" },
    controls: [{ group: "view", opts: [["donut", "Donut"], ["pie", "Pie"], ["bar", "Bar"]] }],
    sub: () => "True vs false positive L0s",
    render(s) { return catChart(counts(H.l0).filter((x) => /positive/i.test(x.label)), s.view, "L0 alerts"); },
  },
  resolution: {
    title: "Resolution / Action Taken", defaults: { view: "bar" },
    controls: [{ group: "view", opts: [["bar", "Bar"], ["pie", "Pie"]] }],
    sub: () => "How the event was cleared",
    render(s) { return catChart(counts(H.action, 12), s.view, "dispatches"); },
  },
  crew: {
    title: "Dispatches by Crew", defaults: { view: "bar" },
    controls: [{ group: "view", opts: [["bar", "Bar"], ["pie", "Pie"]] }],
    sub: () => "Handled per FR crew ID",
    render(s) { return catChart(counts(H.assignee, 12), s.view, "dispatches"); },
  },
  supervisor: {
    title: "Dispatches by Supervisor", defaults: { view: "bar" },
    controls: [{ group: "view", opts: [["bar", "Bar"], ["pie", "Pie"]] }],
    sub: () => "Total dispatches per supervising lead",
    render(s) { return catChart(counts(H.supervisor, 14), s.view, "dispatches"); },
  },
  heat: {
    title: "Dispatch Heatmap — Day × Hour", defaults: { metric: "count" },
    controls: [{ group: "metric", opts: [["count", "Volume"], ["turnaround", "Median turnaround"]] }],
    sub: (s) => (s.metric === "turnaround" ? "Median turnaround (min) by day & hour" : "Dispatch volume by day & hour"),
    render(s) { return heatmap(s.metric); },
  },
  scatter: {
    title: "Response vs Work Time", defaults: { y: "onscene" },
    controls: [{ group: "y", opts: [["onscene", "On-scene"], ["turnaround", "Turnaround"]] }],
    sub: (s) => `Each dot = one dispatch; response vs ${s.y === "turnaround" ? "total turnaround" : "on-scene work"}`,
    render(s) { return s.y === "turnaround" ? scatterChart(H.mTurnaround, "Turnaround") : scatterChart(H.mOnScene, "On-scene work"); },
  },
  completion: {
    title: "Completion Rate by Group", defaults: { group: "milestone" },
    controls: [{ group: "group", opts: [["milestone", "By milestone"], ["location", "By location"], ["type", "By type"]] }],
    sub: () => "Green = completed, red = cancelled (inspired by your ComplCancel% tabs)",
    render(s) { const key = s.group === "location" ? H.location : s.group === "type" ? H.type : H.milestone; return stackedCompletion(completionByCategory(key, 10)); },
  },
  lifecycle: {
    title: "Response Lifecycle", defaults: { metric: "median" },
    controls: [{ group: "metric", opts: [["median", "Median"], ["mean", "Mean"]] }],
    sub: (s) => `${s.metric === "mean" ? "Mean" : "Median"} minutes per stage (timed dispatches)`,
    render(s) { const agg = s.metric === "mean" ? mean : median; const stages = [
        { label: "Created → Accepted", val: agg(posNums(H.mCreatedAccept)) }, { label: "Accepted → On Scene", val: agg(posNums(H.mAcceptArrive)) },
        { label: "On-Scene Work", val: agg(posNums(H.mOnScene)) }, { label: "Return to Base", val: agg(posNums(H.mReturn)) }]; return stagesBar(stages, s.metric === "mean" ? "Mean" : "Median"); },
  },
  turnTrend: {
    title: "Turnaround Trend", defaults: { metric: "median", group: "month" },
    controls: [{ group: "metric", opts: [["median", "Median"], ["mean", "Mean"]] }, { group: "group", opts: [["month", "Monthly"], ["week", "Weekly"]] }],
    sub: (s) => `${s.metric === "mean" ? "Mean" : "Median"} turnaround (min), ${s.group === "week" ? "weekly" : "monthly"}`,
    render(s) { const agg = s.metric === "mean" ? mean : median; const pts = series(H.date, s.group, (rs) => { const v = rs.map((r) => toNum(r[H.mTurnaround])).filter((n) => n && n > 0); return v.length ? agg(v) : 0; }); return lineChart(pts, "val", color(1), (v) => `${Math.round(v)}m`); },
  },
  turnLoc: {
    title: "Turnaround by Location", defaults: { metric: "median" },
    controls: [{ group: "metric", opts: [["median", "Median"], ["mean", "Mean"]] }],
    sub: (s) => `${s.metric === "mean" ? "Mean" : "Median"} turnaround, slowest first`,
    render(s) { const agg = s.metric === "mean" ? mean : median; return barH(aggByCategory(H.location, H.mTurnaround, 8, agg), (it) => `${it.val.toFixed(0)}m · n=${it.count}`); },
  },
  turnType: {
    title: "Turnaround by Dispatch Type", defaults: { metric: "median" },
    controls: [{ group: "metric", opts: [["median", "Median"], ["mean", "Mean"]] }],
    sub: (s) => `${s.metric === "mean" ? "Mean" : "Median"} turnaround, slowest first`,
    render(s) { const agg = s.metric === "mean" ? mean : median; return barH(aggByCategory(H.type, H.mTurnaround, 10, agg), (it) => `${it.val.toFixed(0)}m · n=${it.count}`); },
  },
};

function widgetCard(id, cls) {
  const w = WIDGETS[id];
  const st = STATE.widgets[id] || (STATE.widgets[id] = { ...w.defaults });
  const controls = w.controls.map((cg) => `<div class="btn-group" data-widget="${id}" data-group="${cg.group}">${cg.opts.map(([opt, label]) => `<button class="toggle ${st[cg.group] === opt ? "active" : ""}" data-opt="${opt}">${esc(label)}</button>`).join("")}</div>`).join("");
  const sub = typeof w.sub === "function" ? w.sub(st) : w.sub;
  return `<div class="card ${cls || ""}"><div class="card-head"><div><h3 class="card-title">${esc(w.title)}</h3>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}</div><div class="controls">${controls}</div></div><div class="widget-body" data-widget-body="${id}">${w.render(st)}</div></div>`;
}
function onToggle(e) {
  const btn = e.target.closest(".toggle"); if (!btn) return;
  const grp = btn.closest(".btn-group"); if (!grp) return;
  const id = grp.dataset.widget, group = grp.dataset.group, opt = btn.dataset.opt;
  const w = WIDGETS[id]; if (!w) return;
  STATE.widgets[id][group] = opt;
  grp.querySelectorAll(".toggle").forEach((b) => b.classList.toggle("active", b === btn));
  const card = grp.closest(".card");
  const body = card.querySelector(`[data-widget-body="${id}"]`);
  if (body) body.innerHTML = w.render(STATE.widgets[id]);
  if (typeof w.sub === "function") { const subEl = card.querySelector(".card-sub"); if (subEl) subEl.textContent = w.sub(STATE.widgets[id]); }
}

/* ---------------- KPIs + static cards ---------------- */
function kpi(label, value, hint, i) { return `<div class="card kpi"><div class="kpi-accent" style="background:${color(i)}"></div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>${hint ? `<div class="kpi-hint">${esc(hint)}</div>` : ""}</div>`; }
function buildKpis() {
  const total = STATE.records.length;
  const completed = (counts(H.status).find((s) => /complete/i.test(s.label)) || { count: 0 }).count;
  const l0 = cleaned(H.l0), fp = l0.filter((v) => /false positive/i.test(v)).length, tp = l0.filter((v) => /true positive/i.test(v)).length;
  const turn = posNums(H.mTurnaround), deadhead = nums(H.deadhead).filter((n) => n >= 0);
  const cards = [
    ["Total Dispatches", fmtNum(total), "Fleet-response events"],
    ["Completion Rate", fmtPct((completed / total) * 100), `${fmtNum(completed)} completed · ${fmtNum(total - completed)} cancelled`],
    ["Median Turnaround", fmtMin(median(turn)), `${turn.length} timed events`],
    ["Median Response", fmtMin(median(posNums(H.mDispatchArrive))), "Dispatch → on scene"],
    ["Median On-Scene", fmtMin(median(posNums(H.mOnScene))), "Time working the scene"],
    ["L0 False-Positive Rate", fmtPct(tp + fp ? (fp / (tp + fp)) * 100 : 0), `${fmtNum(fp)} FP of ${fmtNum(tp + fp)} L0s`],
    ["Riders Onboard", fmtPct(pctTrue(H.ridersIn)), "Dispatches with riders in the VH6"],
    ["Avg Deadhead", fmtPct(mean(deadhead) * 100), "Non-productive travel share"],
  ];
  return `<div class="grid kpi-grid">${cards.map((c, i) => kpi(c[0], c[1], c[2], i)).join("")}</div>`;
}
function staticCard(title, sub, body, cls) { return `<div class="card ${cls || ""}"><h3 class="card-title">${esc(title)}</h3>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}${body}</div>`; }

/* ---------------- pages ---------------- */
function page(ids, extras) { return `<div class="grid chart-grid">${ids.map((id) => (typeof id === "string" ? widgetCard(id, WIDGETS[id].wide ? "span-2" : "") : id)).join("")}${extras || ""}</div>`; }
function renderOverview() { return buildKpis() + `<div class="grid chart-grid" style="margin-top:16px">${widgetCard("volume", "span-2")}${widgetCard("dtype")}${widgetCard("status")}${widgetCard("completion", "span-2")}</div>`; }
function renderPerformance() {
  const hist = histogramSvg(posNums(H.mTurnaround), 95, color(2));
  return `<div class="grid chart-grid">${widgetCard("lifecycle", "span-2")}${widgetCard("turnTrend")}${staticCard("Turnaround Distribution", `Minutes, capped at 95th pct (${Math.round(hist.cap)} min)`, hist.svg)}${widgetCard("scatter")}${widgetCard("turnLoc")}${widgetCard("turnType")}</div>`;
}
function renderPatterns() { return `<div class="grid chart-grid">${widgetCard("heat", "span-2")}${widgetCard("hour")}${widgetCard("dow")}${widgetCard("location")}${widgetCard("milestone")}</div>`; }
function renderEvents() { return `<div class="grid chart-grid">${widgetCard("reason", "span-2")}${widgetCard("l0")}${widgetCard("resolution")}${widgetCard("crew")}${widgetCard("supervisor")}</div>`; }

const EXPLORER_COLS = [H.date, H.vh6, H.status, H.type, H.reason, H.location, H.assignee, H.action, H.mDispatchArrive, H.mTurnaround, H.ridersIn];
const EXPLORER_LABELS = { [H.vh6]: "VH6", [H.action]: "Resolution", [H.mDispatchArrive]: "Response (min)", [H.mTurnaround]: "Turnaround (min)", [H.ridersIn]: "Riders" };
function renderExplorer() {
  const rows = STATE.records.slice(0, 150);
  const th = EXPLORER_COLS.map((h) => `<th>${esc(EXPLORER_LABELS[h] || h)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${EXPLORER_COLS.map((h) => `<td>${esc(r[h] ?? "")}</td>`).join("")}</tr>`).join("");
  return staticCard("Dispatch Explorer", `Showing ${rows.length} of ${fmtNum(STATE.records.length)} dispatches · key fields (${STATE.headers.length} total columns)`, `<div class="table-wrap"><table class="data"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
}
function inferType(name, values) {
  if (!values.length) return "text";
  const up = values.map((v) => v.toUpperCase());
  if (up.every((v) => v === "TRUE" || v === "FALSE")) return "boolean";
  if (values.filter((v) => parseDate(v)).length >= values.length * 0.7) return "date";
  if (values.filter((v) => toNum(v) !== null).length >= values.length * 0.8) return "number";
  return new Set(values).size <= Math.max(2, Math.min(30, values.length * 0.5)) ? "category" : "text";
}
function renderQuality() {
  const rowsH = STATE.headers.map((h) => {
    const all = col(h).map((v) => (v ?? "").trim()), filled = all.filter((v) => v !== ""), real = filled.filter((v) => !EMPTY.has(v.toLowerCase()));
    const type = inferType(h, real.slice(0, 400)), comp = all.length ? Math.round((filled.length / all.length) * 100) : 0;
    const c = comp > 80 ? "#22d3a6" : comp > 50 ? "#f6b73c" : "#ff6b8b";
    let summary = "";
    if (type === "number") { const ns = real.map(toNum).filter((n) => n !== null); if (ns.length) summary = `min ${fmtNum(Math.round(Math.min(...ns)))} · avg ${fmtNum(Math.round(mean(ns)))} · max ${fmtNum(Math.round(Math.max(...ns)))}`; }
    else { const m = new Map(); real.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); summary = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => `${v.length > 22 ? v.slice(0, 21) + "…" : v} (${n})`).join(", "); }
    return `<tr><td style="font-weight:600">${esc(h.length > 40 ? h.slice(0, 39) + "…" : h)}</td><td><span class="pill">${type}</span></td><td><span class="bar-track"><span class="bar-fill" style="width:${comp}%;background:${c}"></span></span> <span class="muted" style="font-size:12px">${comp}%</span></td><td>${fmtNum(new Set(real).size)}</td><td class="muted" style="white-space:normal;max-width:340px">${esc(summary)}</td></tr>`;
  }).join("");
  return staticCard("Detected Schema & Data Quality", `${STATE.headers.length} columns · ${fmtNum(STATE.records.length)} dispatches`, `<div class="table-wrap"><table class="data"><thead><tr><th>Column</th><th>Type</th><th>Complete</th><th>Distinct</th><th>Top values / summary</th></tr></thead><tbody>${rowsH}</tbody></table></div>`);
}

/* ---------------- shell ---------------- */
const PAGES = [
  { id: "overview", label: "Overview", icon: "◎", fn: renderOverview },
  { id: "performance", label: "Response Performance", icon: "⏱", fn: renderPerformance },
  { id: "patterns", label: "Demand Patterns", icon: "📊", fn: renderPatterns },
  { id: "events", label: "Event Analysis", icon: "🧭", fn: renderEvents },
  { id: "explorer", label: "Dispatch Explorer", icon: "🔎", fn: renderExplorer },
  { id: "quality", label: "Data Quality", icon: "✓", fn: renderQuality },
];
let STATE = { headers: [], allRecords: [], records: [], page: "overview", widgets: {}, range: "all", maxDate: null };

const RANGES = [["all", "All time"], ["12m", "Last 12 months"], ["30d", "Last 30 days"], ["custom", "Custom"]];
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function applyRange() {
  if (STATE.range === "custom") {
    const from = STATE.customFrom ? new Date(STATE.customFrom + "T00:00:00") : null;
    const to = STATE.customTo ? new Date(STATE.customTo + "T23:59:59") : null;
    STATE.records = STATE.allRecords.filter((r) => { const d = parseDate(r[H.date]); if (!d) return false; if (from && d < from) return false; if (to && d > to) return false; return true; });
    return;
  }
  if (STATE.range === "all" || !STATE.maxDate) { STATE.records = STATE.allRecords; return; }
  const days = STATE.range === "30d" ? 30 : 365;
  const cutoff = STATE.maxDate.getTime() - days * 86400000;
  STATE.records = STATE.allRecords.filter((r) => { const d = parseDate(r[H.date]); return d && d.getTime() >= cutoff; });
}
function renderRange() {
  const el = document.getElementById("rangeControls");
  if (!el) return;
  const btns = `<div class="btn-group">${RANGES.map(([id, l]) => `<button class="toggle ${STATE.range === id ? "active" : ""}" data-range="${id}">${l}</button>`).join("")}</div>`;
  const inputs = STATE.range === "custom"
    ? `<input type="date" class="date-input" id="rangeFrom" value="${STATE.customFrom || ""}" min="${STATE.customMin || ""}" max="${STATE.customMax || ""}"><span class="muted" style="align-self:center;font-size:12px">to</span><input type="date" class="date-input" id="rangeTo" value="${STATE.customTo || ""}" min="${STATE.customMin || ""}" max="${STATE.customMax || ""}">`
    : "";
  el.innerHTML = btns + inputs;
}
function onRangeInput(e) {
  if (e.target.id !== "rangeFrom" && e.target.id !== "rangeTo") return;
  const from = document.getElementById("rangeFrom"), to = document.getElementById("rangeTo");
  if (from) STATE.customFrom = from.value;
  if (to) STATE.customTo = to.value;
  applyRange(); updateSubtitle(); renderContent();
}
function updateSubtitle() {
  const label = STATE.range === "all" ? "all time" : STATE.range === "12m" ? "last 12 months" : STATE.range === "30d" ? "last 30 days" : `${STATE.customFrom || "…"} → ${STATE.customTo || "…"}`;
  const extra = STATE.range === "all" ? "" : ` of ${fmtNum(STATE.allRecords.length)}`;
  document.getElementById("subtitle").textContent = `${fmtNum(STATE.records.length)}${extra} dispatches · ${label} · autonomous fleet-response operations`;
}
function onRange(e) {
  const b = e.target.closest("[data-range]"); if (!b) return;
  STATE.range = b.dataset.range;
  applyRange(); renderRange(); updateSubtitle(); renderContent();
}

function renderNav() {
  document.getElementById("nav").innerHTML = PAGES.map((p) => `<div class="nav-link ${p.id === STATE.page ? "active" : ""}" data-page="${p.id}"><span class="nav-icon">${p.icon}</span>${p.label}</div>`).join("");
  document.querySelectorAll(".nav-link").forEach((el) => el.addEventListener("click", () => { STATE.page = el.dataset.page; renderNav(); renderContent(); }));
}
function renderContent() { document.getElementById("content").innerHTML = (PAGES.find((p) => p.id === STATE.page) || PAGES[0]).fn(); }

function boot(text) {
  const { headers, rows } = parseCSV(text);
  STATE.headers = headers; STATE.allRecords = rows;
  let mx = null, mn = null; rows.forEach((r) => { const d = parseDate(r[H.date]); if (d) { if (!mx || d > mx) mx = d; if (!mn || d < mn) mn = d; } });
  STATE.maxDate = mx; STATE.minDate = mn;
  STATE.customMin = mn ? toISO(mn) : ""; STATE.customMax = mx ? toISO(mx) : "";
  STATE.customFrom = STATE.customMin; STATE.customTo = STATE.customMax;
  const params = new URLSearchParams(location.search);
  const req = params.get("page"); if (req && PAGES.some((p) => p.id === req)) STATE.page = req;
  const rng = params.get("range"); if (rng && RANGES.some((r) => r[0] === rng)) STATE.range = rng;
  if (params.get("from")) STATE.customFrom = params.get("from");
  if (params.get("to")) STATE.customTo = params.get("to");
  applyRange();
  document.addEventListener("click", onToggle);
  document.addEventListener("click", onRange);
  document.addEventListener("change", onRangeInput);
  renderRange(); updateSubtitle(); renderNav(); renderContent();
  window.__READY__ = true;
}
async function init() {
  if (typeof window.__CSV__ === "string") { boot(window.__CSV__); return; }
  try { const res = await fetch("./data.csv", { cache: "no-store" }); if (!res.ok) throw new Error(`data.csv HTTP ${res.status}`); boot(await res.text()); }
  catch (e) { document.getElementById("content").innerHTML = `<div class="card"><h3 class="card-title" style="color:#ff6b8b">Could not load data</h3><div class="muted">${esc(e.message)}</div></div>`; window.__READY__ = true; }
}
init();

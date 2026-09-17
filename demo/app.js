"use strict";
/* ============================================================
   Fleet Response — operations analytics
   Tailored to the FR Historical Data (Responses) dataset.
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
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
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

/* ---------------- column map (trimmed header names) ---------------- */
const H = {
  date: "Date Created",
  vh6: "VH6 # (eg. vh6b_000 or vh6d_000)",
  status: "Status",
  type: "Dispatch Type",
  l0: "True or False Positive (L0s ONLY)",
  reason: "Reason for Event",
  milestone: "ZR# (Milestone)",
  assignee: "Assignee",
  action: "Was the vehicle Towed, Rovebotted, Inspected, Tailed or RTB/Auto",
  location: "Location",
  supervisor: "Supervisor",
  ridersIn: "Riders in The VH6",
  ridersRec: "Riders Recovered",
  botDmg: "Was the bot damaged?",
  training: "Training Dispatch",
  day: "Day", hour: "24hr", week: "Week of the Year",
  mCreatedAccept: "created_to_accepted_min",
  mAcceptArrive: "accepted_to_arrived_min",
  mDispatchArrive: "dispatch_to_arrived_on_scene_mins",
  mOnScene: "on_scene_work_mins",
  mReturn: "return_to_base_mins",
  mTurnaround: "turnaround_time_mins",
  deadhead: "deadhead_percentage",
};

/* ---------------- value helpers ---------------- */
const EMPTY = new Set(["", "n/a", "na", "null", "tbd", "none"]);
function clean(v) { const s = (v ?? "").trim(); return EMPTY.has(s.toLowerCase()) ? "" : s; }
function toNum(v) { const s = (v ?? "").replace(/[$,%\s]/g, ""); if (s === "" || EMPTY.has(s.toLowerCase())) return null; const n = Number(s); return Number.isFinite(n) ? n : null; }

const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
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
function nums(k) { return col(k).map(toNum).filter((n) => n !== null); }
function posNums(k) { return nums(k).filter((n) => n > 0); }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function percentile(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }

function avgByCategory(catKey, numKey, limit = 10, agg = median) {
  const groups = new Map();
  STATE.records.forEach((r) => { const c = clean(r[catKey]); const n = toNum(r[numKey]); if (!c || n === null || n <= 0) return; const g = groups.get(c) || []; g.push(n); groups.set(c, g); });
  return [...groups.entries()].map(([label, arr]) => ({ label, val: agg(arr), count: arr.length }))
    .filter((x) => x.count >= 5).sort((a, b) => b.val - a.val).slice(0, limit);
}
function monthly(dateKey, valueFn) {
  const m = new Map();
  STATE.records.forEach((r) => { const d = parseDate(r[dateKey]); if (!d) return; const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; const g = m.get(k) || []; g.push(r); m.set(k, g); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, rs]) => ({ period, count: rs.length, val: valueFn ? valueFn(rs) : rs.length }));
}
const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function dayOfWeek() {
  const m = new Map(); cleaned(H.day).forEach((v) => m.set(v, (m.get(v) || 0) + 1));
  return DOW.filter((d) => m.has(d)).map((d) => ({ label: d.slice(0, 3), count: m.get(d) }));
}
function hourOfDay() {
  const m = new Map();
  cleaned(H.hour).forEach((v) => { const n = Number(v); if (Number.isFinite(n)) { const k = String(n).padStart(2, "0"); m.set(k, (m.get(k) || 0) + 1); } });
  return [...m.keys()].sort().map((k) => ({ label: k, count: m.get(k) }));
}
function pctTrue(k) {
  const v = cleaned(k).map((x) => x.toUpperCase());
  const t = v.filter((x) => x === "TRUE").length, f = v.filter((x) => x === "FALSE").length;
  return t + f ? (t / (t + f)) * 100 : 0;
}

/* ---------------- SVG charts ---------------- */
const fmtPeriod = (p) => { const [y, mo] = p.split("-"); return mo ? new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : p; };
function svg(inner, w, h, fixedW) { return `<svg viewBox="0 0 ${w} ${h}" width="${fixedW ? w : "100%"}" height="${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; }

function lineChart(points, key, colr, fmt) {
  const W = 560, Ht = 280, pad = { l: 48, r: 16, t: 16, b: 34 };
  if (!points.length) return `<div class="empty-hint">No dated records.</div>`;
  const max = Math.max(...points.map((p) => p[key]), 1);
  const iw = W - pad.l - pad.r, ih = Ht - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const area = `${pad.l},${pad.t + ih} ${line} ${x(points.length - 1)},${pad.t + ih}`;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/><text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmt ? fmt(max - (max / 4) * t) : fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const step = Math.ceil(points.length / 8);
  const labels = points.map((p, i) => (i % step === 0 ? `<text x="${x(i)}" y="${Ht - 10}" fill="#9aa7c2" font-size="11" text-anchor="middle">${fmtPeriod(p.period)}</text>` : "")).join("");
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[key])}" r="3" fill="${colr}"/>`).join("");
  return svg(`${g}<polygon points="${area}" fill="${colr}" opacity="0.12"/><polyline points="${line}" fill="none" stroke="${colr}" stroke-width="2.5"/>${dots}${labels}`, W, Ht);
}
function barV(bins, colr, rotate) {
  const W = 560, Ht = 260, pad = { l: 40, r: 12, t: 14, b: rotate ? 52 : 34 };
  const max = Math.max(...bins.map((b) => b.count), 1);
  const iw = W - pad.l - pad.r, ih = Ht - pad.t - pad.b, bw = iw / bins.length;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/><text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const bars = bins.map((b, i) => {
    const h = (b.count / max) * ih, bx = pad.l + i * bw + 3, by = pad.t + ih - h, cx = bx + (bw - 6) / 2;
    const lbl = rotate ? `<text x="${cx}" y="${Ht - 36}" fill="#9aa7c2" font-size="9" text-anchor="end" transform="rotate(-35 ${cx} ${Ht - 36})">${esc(b.label)}</text>` : `<text x="${cx}" y="${Ht - 16}" fill="#9aa7c2" font-size="10" text-anchor="middle">${esc(b.label)}</text>`;
    return `<rect x="${bx}" y="${by}" width="${bw - 6}" height="${h}" rx="4" fill="${colr}"/>${lbl}`;
  }).join("");
  return svg(`${g}${bars}`, W, Ht);
}
function barH(items, fmtRight) {
  if (!items.length) return `<div class="empty-hint">No data.</div>`;
  const rowH = 26, pad = { l: 160, r: 60, t: 8, b: 8 }, W = 560, Ht = pad.t + pad.b + items.length * rowH;
  const max = Math.max(...items.map((i) => i.val ?? i.count), 1), iw = W - pad.l - pad.r;
  const bars = items.map((it, i) => {
    const v = it.val ?? it.count, y = pad.t + i * rowH, w = Math.max((v / max) * iw, 1), c = color(i);
    const right = fmtRight ? fmtRight(it) : fmtNum(v);
    return `<text x="${pad.l - 8}" y="${y + rowH / 2 + 4}" fill="#c8d2e6" font-size="11" text-anchor="end">${esc(it.label.length > 26 ? it.label.slice(0, 25) + "…" : it.label)}</text>` +
      `<rect x="${pad.l}" y="${y + 4}" width="${w}" height="${rowH - 10}" rx="4" fill="${c}"/>` +
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
function donut(items, centerLabel) {
  const W = 360, Ht = 280, cx = 150, cy = 140, r = 100, ir = 62;
  const total = items.reduce((a, b) => a + b.count, 0) || 1;
  let ang = -Math.PI / 2, paths = "";
  items.forEach((it, i) => { if (it.count <= 0) return; const a2 = ang + (it.count / total) * Math.PI * 2; paths += annularSector(cx, cy, r, ir, ang, a2, color(i)); ang = a2; });
  const legend = items.map((it, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${color(i)}"></span>${esc(it.label)} (${fmtNum(it.count)})</div>`).join("");
  return `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">${svg(paths + `<text x="${cx}" y="${cy - 2}" fill="#e7ecf5" font-size="22" font-weight="800" text-anchor="middle">${fmtNum(total)}</text><text x="${cx}" y="${cy + 18}" fill="#9aa7c2" font-size="11" text-anchor="middle">${esc(centerLabel || "total")}</text>`, W, Ht, true)}<div class="legend" style="flex-direction:column">${legend}</div></div>`;
}
function stagesBar(stages) {
  const valid = stages.filter((s) => s.val > 0);
  const total = valid.reduce((a, s) => a + s.val, 0);
  if (!total) return `<div class="empty-hint">No timing data.</div>`;
  const W = 560, barH = 54, y = 30, pad = 4, iw = W - pad * 2;
  let x = pad, segs = "";
  valid.forEach((s, i) => { const w = (s.val / total) * iw; segs += `<rect x="${x}" y="${y}" width="${Math.max(w - 1, 1)}" height="${barH}" rx="3" fill="${color(i)}"/>` + (w > 46 ? `<text x="${x + w / 2}" y="${y + barH / 2 + 4}" fill="#0b1020" font-size="12" font-weight="700" text-anchor="middle">${s.val.toFixed(1)}</text>` : ""); x += w; });
  const legend = valid.map((s, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${color(i)}"></span>${esc(s.label)}: <b style="color:#e7ecf5;margin-left:4px">${fmtMin(s.val)}</b></div>`).join("");
  return `${svg(`<text x="${pad}" y="18" fill="#9aa7c2" font-size="12">Median end-to-end turnaround: <tspan fill="#e7ecf5" font-weight="700">${total.toFixed(1)} min</tspan></text>${segs}`, W, y + barH + 10, false)}<div class="legend">${legend}</div>`;
}
function histogram(values, capPct, colr) {
  const cap = percentile(values, capPct) || 1;
  const capped = values.filter((n) => n <= cap), bc = 12, w = cap / bc;
  const bins = Array.from({ length: bc }, (_, i) => ({ from: i * w, to: (i + 1) * w, count: 0, label: `${Math.round(i * w)}` }));
  capped.forEach((n) => { let idx = Math.floor(n / w); if (idx >= bc) idx = bc - 1; if (idx < 0) idx = 0; bins[idx].count++; });
  return { bins, cap, svg: barV(bins, colr) };
}

/* ---------------- KPIs ---------------- */
function kpi(label, value, hint, i) {
  return `<div class="card kpi"><div class="kpi-accent" style="background:${color(i)}"></div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>${hint ? `<div class="kpi-hint">${esc(hint)}</div>` : ""}</div>`;
}
function buildKpis() {
  const total = STATE.records.length;
  const completed = (counts(H.status).find((s) => /complete/i.test(s.label)) || { count: 0 }).count;
  const l0 = cleaned(H.l0);
  const fp = l0.filter((v) => /false positive/i.test(v)).length, tp = l0.filter((v) => /true positive/i.test(v)).length;
  const turn = posNums(H.mTurnaround);
  const ridersPct = pctTrue(H.ridersIn);
  const deadhead = nums(H.deadhead).filter((n) => n >= 0);
  const cards = [
    ["Total Dispatches", fmtNum(total), "Fleet-response events"],
    ["Completion Rate", fmtPct((completed / total) * 100), `${fmtNum(completed)} completed · ${fmtNum(total - completed)} cancelled`],
    ["Median Turnaround", fmtMin(median(turn)), `${turn.length} timed events`],
    ["Median Response", fmtMin(median(posNums(H.mDispatchArrive))), "Dispatch → on scene"],
    ["Median On-Scene", fmtMin(median(posNums(H.mOnScene))), "Time working the scene"],
    ["L0 False-Positive Rate", fmtPct(tp + fp ? (fp / (tp + fp)) * 100 : 0), `${fmtNum(fp)} FP of ${fmtNum(tp + fp)} L0s`],
    ["Riders Onboard", fmtPct(ridersPct), "Dispatches with riders in the VH6"],
    ["Avg Deadhead", fmtPct(mean(deadhead) * 100), "Non-productive travel share"],
  ];
  return `<div class="grid kpi-grid">${cards.map((c, i) => kpi(c[0], c[1], c[2], i)).join("")}</div>`;
}
function card(title, sub, body, cls) { return `<div class="card ${cls || ""}"><h3 class="card-title">${esc(title)}</h3>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}${body}</div>`; }

/* ---------------- pages ---------------- */
function renderOverview() {
  let c = "";
  c += card("Dispatch Volume Over Time", "Monthly fleet-response events", lineChart(monthly(H.date), "count", color(0)), "span-2");
  c += card("By Dispatch Type", "What triggered the response", barH(counts(H.type, 10)));
  c += card("Status", "Completed vs cancelled", donut(counts(H.status), "dispatches"));
  return buildKpis() + `<div class="grid chart-grid" style="margin-top:16px">${c}</div>`;
}
function renderPerformance() {
  const stages = [
    { label: "Created → Accepted", val: median(posNums(H.mCreatedAccept)) },
    { label: "Accepted → On Scene", val: median(posNums(H.mAcceptArrive)) },
    { label: "On-Scene Work", val: median(posNums(H.mOnScene)) },
    { label: "Return to Base", val: median(posNums(H.mReturn)) },
  ];
  const hist = histogram(posNums(H.mTurnaround), 95, color(2));
  const trend = monthly(H.date, (rs) => { const v = rs.map((r) => toNum(r[H.mTurnaround])).filter((n) => n && n > 0); return v.length ? median(v) : 0; });
  let c = "";
  c += card("Response Lifecycle", "Median minutes per stage (timed dispatches)", stagesBar(stages), "span-2");
  c += card("Median Turnaround Trend", "Monthly median turnaround (min)", lineChart(trend, "val", color(1), (v) => `${Math.round(v)}m`));
  c += card("Turnaround Distribution", `Minutes, capped at 95th pct (${Math.round(hist.cap)} min)`, hist.svg);
  c += card("Median Turnaround by Location", "Slowest markets first", barH(avgByCategory(H.location, H.mTurnaround, 8), (it) => `${it.val.toFixed(0)}m · n=${it.count}`));
  c += card("Median Turnaround by Dispatch Type", "Slowest types first", barH(avgByCategory(H.type, H.mTurnaround, 10), (it) => `${it.val.toFixed(0)}m · n=${it.count}`));
  return `<div class="grid chart-grid">${c}</div>`;
}
function renderPatterns() {
  let c = "";
  c += card("Dispatches by Day of Week", "When demand peaks", barV(dayOfWeek(), color(0)));
  c += card("Dispatches by Hour of Day", "24-hour demand curve", barV(hourOfDay(), color(4), true));
  c += card("Dispatches by Location", "Where events happen", barH(counts(H.location, 8)));
  c += card("Dispatches by Autonomy Milestone", "ZR milestone at time of event", barH(counts(H.milestone, 8)));
  return `<div class="grid chart-grid">${c}</div>`;
}
function renderEvents() {
  const l0 = counts(H.l0).filter((x) => /positive/i.test(x.label));
  let c = "";
  c += card("Reason for Event", "Why the VH6 needed response", barH(counts(H.reason, 14)), "span-2");
  c += card("L0 Alert Accuracy", "True vs false positive L0s", donut(l0, "L0 alerts"));
  c += card("Resolution / Action Taken", "How the event was cleared", barH(counts(H.action, 12)));
  c += card("Dispatches by Crew", "Handled per FR crew ID", barH(counts(H.assignee, 12)));
  return `<div class="grid chart-grid">${c}</div>`;
}
const EXPLORER_COLS = [H.date, H.vh6, H.status, H.type, H.reason, H.location, H.assignee, H.action, H.mDispatchArrive, H.mTurnaround, H.ridersIn];
const EXPLORER_LABELS = { [H.vh6]: "VH6", [H.action]: "Resolution", [H.mDispatchArrive]: "Response (min)", [H.mTurnaround]: "Turnaround (min)", [H.ridersIn]: "Riders" };
function renderExplorer() {
  const rows = STATE.records.slice(0, 150);
  const th = EXPLORER_COLS.map((h) => `<th>${esc(EXPLORER_LABELS[h] || h)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${EXPLORER_COLS.map((h) => `<td>${esc(r[h] ?? "")}</td>`).join("")}</tr>`).join("");
  return card("Dispatch Explorer", `Showing ${rows.length} of ${fmtNum(STATE.records.length)} dispatches · key fields (${STATE.headers.length} total columns)`, `<div class="table-wrap"><table class="data"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
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
    const all = col(h).map((v) => (v ?? "").trim()), filled = all.filter((v) => v !== "");
    const real = filled.filter((v) => !EMPTY.has(v.toLowerCase()));
    const type = inferType(h, real.slice(0, 400));
    const comp = all.length ? Math.round((filled.length / all.length) * 100) : 0;
    const c = comp > 80 ? "#22d3a6" : comp > 50 ? "#f6b73c" : "#ff6b8b";
    let summary = "";
    if (type === "number") { const ns = real.map(toNum).filter((n) => n !== null); if (ns.length) summary = `min ${fmtNum(Math.round(Math.min(...ns)))} · avg ${fmtNum(Math.round(mean(ns)))} · max ${fmtNum(Math.round(Math.max(...ns)))}`; }
    else { const m = new Map(); real.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); summary = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => `${v.length > 22 ? v.slice(0, 21) + "…" : v} (${n})`).join(", "); }
    return `<tr><td style="font-weight:600">${esc(h.length > 40 ? h.slice(0, 39) + "…" : h)}</td><td><span class="pill">${type}</span></td><td><span class="bar-track"><span class="bar-fill" style="width:${comp}%;background:${c}"></span></span> <span class="muted" style="font-size:12px">${comp}%</span></td><td>${fmtNum(new Set(real).size)}</td><td class="muted" style="white-space:normal;max-width:340px">${esc(summary)}</td></tr>`;
  }).join("");
  return card("Detected Schema & Data Quality", `${STATE.headers.length} columns · ${fmtNum(STATE.records.length)} dispatches`, `<div class="table-wrap"><table class="data"><thead><tr><th>Column</th><th>Type</th><th>Complete</th><th>Distinct</th><th>Top values / summary</th></tr></thead><tbody>${rowsH}</tbody></table></div>`);
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
let STATE = { headers: [], records: [], page: "overview" };

function renderNav() {
  document.getElementById("nav").innerHTML = PAGES.map((p) => `<div class="nav-link ${p.id === STATE.page ? "active" : ""}" data-page="${p.id}"><span class="nav-icon">${p.icon}</span>${p.label}</div>`).join("");
  document.querySelectorAll(".nav-link").forEach((el) => el.addEventListener("click", () => { STATE.page = el.dataset.page; renderNav(); renderContent(); }));
}
function renderContent() { document.getElementById("content").innerHTML = (PAGES.find((p) => p.id === STATE.page) || PAGES[0]).fn(); }

function boot(text) {
  const { headers, rows } = parseCSV(text);
  STATE.headers = headers; STATE.records = rows;
  const req = new URLSearchParams(location.search).get("page");
  if (req && PAGES.some((p) => p.id === req)) STATE.page = req;
  document.getElementById("subtitle").textContent = `${fmtNum(rows.length)} dispatches · ${headers.length} fields · autonomous fleet-response operations`;
  renderNav(); renderContent();
  window.__READY__ = true;
}
async function init() {
  if (typeof window.__CSV__ === "string") { boot(window.__CSV__); return; }
  try {
    const res = await fetch("./data.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(`data.csv HTTP ${res.status}`);
    boot(await res.text());
  } catch (e) {
    document.getElementById("content").innerHTML = `<div class="card"><h3 class="card-title" style="color:#ff6b8b">Could not load data</h3><div class="muted">${esc(e.message)}</div></div>`;
    window.__READY__ = true;
  }
}
init();

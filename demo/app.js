"use strict";
/* ============================================================
   Fleet Response — bespoke recovery-operations dashboard
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
  shuttle: "Did we use a 3rd Party Rider Shuttle?",
  botDmg: "Was the bot damaged?",
  training: "Training Dispatch",
  flatbed: "Was an Internal or External Flatbed Used?",
  month: "Month", hour: "24hr", day: "Day",
  mCreatedAccept: "created_to_accepted_min",
  mAcceptArrive: "accepted_to_arrived_min",
  mDispatchArrive: "dispatch_to_arrived_on_scene_mins",
  mOnScene: "on_scene_work_mins",
  mClear: "dispatch_to_clear_scene_mins",
  mReturn: "return_to_base_mins",
  mTurnaround: "turnaround_time_mins",
};

/* ---------------- value helpers ---------------- */
const EMPTY = new Set(["", "n/a", "na", "null", "tbd", "-", "none"]);
function clean(v) { const s = (v ?? "").trim(); return EMPTY.has(s.toLowerCase()) ? "" : s; }
function toNum(v) { const s = (v ?? "").replace(/[$,%\s]/g, ""); if (s === "" || EMPTY.has(s.toLowerCase())) return null; const n = Number(s); return Number.isFinite(n) ? n : null; }
function toBool(v) { const s = (v ?? "").trim().toUpperCase(); if (s === "TRUE") return true; if (s === "FALSE") return false; return null; }

const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function parseDate(s) {
  s = (s ?? "").trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let [, mm, dd, yy] = m; let y = Number(yy); if (yy.length === 2) y += y < 70 ? 2000 : 1900; if (+mm <= 12) { const d = new Date(y, mm - 1, dd); if (!isNaN(d)) return d; } }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s); if (!isNaN(d)) return d; }
  return null;
}

/* aggregate helpers over STATE.records */
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

function rate(k, isTrue) {
  const vals = cleaned(k).map((v) => v.toUpperCase());
  const t = vals.filter((v) => v === "TRUE").length;
  const f = vals.filter((v) => v === "FALSE").length;
  return t + f ? (isTrue ? t : f) / (t + f) * 100 : 0;
}
function avgByCategory(catKey, numKey, limit = 10) {
  const groups = new Map();
  STATE.records.forEach((r) => {
    const c = clean(r[catKey]); const n = toNum(r[numKey]);
    if (!c || n === null || n <= 0) return;
    const g = groups.get(c) || []; g.push(n); groups.set(c, g);
  });
  return [...groups.entries()]
    .map(([label, arr]) => ({ label, val: mean(arr), count: arr.length }))
    .filter((x) => x.count >= 3)
    .sort((a, b) => b.val - a.val).slice(0, limit);
}
function monthly(dateKey) {
  const m = new Map();
  STATE.records.forEach((r) => { const d = parseDate(r[dateKey]); if (!d) return; const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, count]) => ({ period, count }));
}

/* ---------------- SVG charts ---------------- */
const fmtPeriod = (p) => { const [y, mo] = p.split("-"); return mo ? new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : p; };
function svg(inner, w, h, fixedW) { return `<svg viewBox="0 0 ${w} ${h}" width="${fixedW ? w : "100%"}" height="${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; }

function areaChart(points, col) {
  const W = 560, H = 280, pad = { l: 44, r: 16, t: 16, b: 34 };
  if (!points.length) return `<div class="empty-hint">No dated records.</div>`;
  const max = Math.max(...points.map((p) => p.count), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = points.map((p, i) => `${x(i)},${y(p.count)}`).join(" ");
  const area = `${pad.l},${pad.t + ih} ${line} ${x(points.length - 1)},${pad.t + ih}`;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/><text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const step = Math.ceil(points.length / 8);
  const labels = points.map((p, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 10}" fill="#9aa7c2" font-size="11" text-anchor="middle">${fmtPeriod(p.period)}</text>` : "")).join("");
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.count)}" r="3" fill="${col}"/>`).join("");
  return svg(`${g}<polygon points="${area}" fill="${col}" opacity="0.14"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2.5"/>${dots}${labels}`, W, H);
}
function barV(bins, col) {
  const W = 560, H = 260, pad = { l: 40, r: 12, t: 14, b: 58 };
  const max = Math.max(...bins.map((b) => b.count), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, bw = iw / bins.length;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/><text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const bars = bins.map((b, i) => { const h = (b.count / max) * ih, bx = pad.l + i * bw + 3, by = pad.t + ih - h; return `<rect x="${bx}" y="${by}" width="${bw - 6}" height="${h}" rx="4" fill="${col}"/><text x="${bx + (bw - 6) / 2}" y="${H - 40}" fill="#9aa7c2" font-size="9" text-anchor="end" transform="rotate(-35 ${bx + (bw - 6) / 2} ${H - 40})">${esc(b.label)}</text>`; }).join("");
  return svg(`${g}${bars}`, W, H);
}
function barH(items, fmtRight) {
  if (!items.length) return `<div class="empty-hint">No data.</div>`;
  const rowH = 26, pad = { l: 150, r: 56, t: 8, b: 8 }, W = 560, H = pad.t + pad.b + items.length * rowH;
  const max = Math.max(...items.map((i) => i.val ?? i.count), 1), iw = W - pad.l - pad.r;
  const bars = items.map((it, i) => {
    const v = it.val ?? it.count, y = pad.t + i * rowH, w = Math.max((v / max) * iw, 1), c = color(i);
    const right = fmtRight ? fmtRight(it) : fmtNum(v);
    return `<text x="${pad.l - 8}" y="${y + rowH / 2 + 4}" fill="#c8d2e6" font-size="11" text-anchor="end">${esc(it.label.length > 24 ? it.label.slice(0, 23) + "…" : it.label)}</text>` +
      `<rect x="${pad.l}" y="${y + 4}" width="${w}" height="${rowH - 10}" rx="4" fill="${c}"/>` +
      `<text x="${pad.l + w + 6}" y="${y + rowH / 2 + 4}" fill="#9aa7c2" font-size="11">${esc(right)}</text>`;
  }).join("");
  return svg(bars, W, H);
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
  const W = 360, H = 280, cx = 150, cy = 140, r = 100, ir = 62;
  const total = items.reduce((a, b) => a + b.count, 0) || 1;
  let ang = -Math.PI / 2, paths = "";
  items.forEach((it, i) => { if (it.count <= 0) return; const a2 = ang + (it.count / total) * Math.PI * 2; paths += annularSector(cx, cy, r, ir, ang, a2, color(i)); ang = a2; });
  const legend = items.map((it, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${color(i)}"></span>${esc(it.label)} (${fmtNum(it.count)})</div>`).join("");
  return `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">${svg(paths + `<text x="${cx}" y="${cy - 2}" fill="#e7ecf5" font-size="22" font-weight="800" text-anchor="middle">${fmtNum(total)}</text><text x="${cx}" y="${cy + 18}" fill="#9aa7c2" font-size="11" text-anchor="middle">${esc(centerLabel || "total")}</text>`, W, H, true)}<div class="legend" style="flex-direction:column">${legend}</div></div>`;
}
function stagesBar(stages) {
  const valid = stages.filter((s) => s.val > 0);
  const total = valid.reduce((a, s) => a + s.val, 0);
  if (!total) return `<div class="empty-hint">No timing data.</div>`;
  const W = 560, barH = 54, y = 30, pad = 4, iw = W - pad * 2;
  let x = pad, segs = "";
  valid.forEach((s, i) => { const w = (s.val / total) * iw; segs += `<rect x="${x}" y="${y}" width="${Math.max(w - 1, 1)}" height="${barH}" rx="3" fill="${color(i)}"/>` + (w > 46 ? `<text x="${x + w / 2}" y="${y + barH / 2 + 4}" fill="#0b1020" font-size="12" font-weight="700" text-anchor="middle">${s.val.toFixed(1)}</text>` : ""); x += w; });
  const legend = valid.map((s, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${color(i)}"></span>${esc(s.label)}: <b style="color:#e7ecf5;margin-left:4px">${fmtMin(s.val)}</b></div>`).join("");
  return `${svg(`<text x="${pad}" y="18" fill="#9aa7c2" font-size="12">Average end-to-end turnaround: <tspan fill="#e7ecf5" font-weight="700">${total.toFixed(1)} min</tspan></text>${segs}`, W, y + barH + 10, false)}<div class="legend">${legend}</div>`;
}

/* ---------------- KPI + pages ---------------- */
function kpi(label, value, hint, i) {
  return `<div class="card kpi"><div class="kpi-accent" style="background:${color(i)}"></div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>${hint ? `<div class="kpi-hint">${esc(hint)}</div>` : ""}</div>`;
}
function card(title, sub, body, cls) { return `<div class="card ${cls || ""}"><h3 class="card-title">${esc(title)}</h3>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}${body}</div>`; }

function buildKpis() {
  const total = STATE.records.length;
  const statusC = counts(H.status);
  const completed = (statusC.find((s) => /complete/i.test(s.label)) || { count: 0 }).count;
  const l0 = cleaned(H.l0);
  const fp = l0.filter((v) => /false positive/i.test(v)).length;
  const tp = l0.filter((v) => /true positive/i.test(v)).length;
  const actionC = counts(H.action);
  const towed = (actionC.find((a) => /tow/i.test(a.label)) || { count: 0 }).count;
  const ridersOnboard = cleaned(H.ridersIn).filter((v) => v.toUpperCase() === "TRUE").length;
  const turn = posNums(H.mTurnaround);
  const cards = [
    ["Total Dispatches", fmtNum(total), "Recovery/response events"],
    ["Completion Rate", fmtPct((completed / total) * 100), `${fmtNum(completed)} completed of ${fmtNum(total)}`],
    ["Avg Turnaround", fmtMin(mean(turn)), `median ${median(turn).toFixed(1)} min`],
    ["Avg Response Time", fmtMin(mean(posNums(H.mDispatchArrive))), "Dispatch → on scene"],
    ["Avg On-Scene", fmtMin(mean(posNums(H.mOnScene))), "Time working the scene"],
    ["L0 False-Positive Rate", fmtPct(tp + fp ? (fp / (tp + fp)) * 100 : 0), `${fmtNum(fp)} FP of ${fmtNum(tp + fp)} L0s`],
    ["Bot Damage Rate", fmtPct(rate(H.botDmg, true)), "Dispatches with bot damage"],
    ["Vehicles Towed", fmtNum(towed), fmtPct((towed / total) * 100) + " of dispatches"],
    ["Riders Onboard", fmtNum(ridersOnboard), "Dispatches with riders in VH6"],
    ["Unique VH6 Units", fmtNum(new Set(cleaned(H.vh6)).size), "Distinct vehicles serviced"],
  ];
  return `<div class="grid kpi-grid">${cards.map((c, i) => kpi(c[0], c[1], c[2], i)).join("")}</div>`;
}

function renderOverview() {
  let charts = "";
  charts += card("Dispatches Over Time", "Monthly volume by Date Created", areaChart(monthly(H.date), color(0)));
  charts += card("By Dispatch Type", "All dispatch categories", barH(counts(H.type, 12)));
  charts += card("Status", "Completed vs cancelled", donut(counts(H.status), "dispatches"));
  charts += card("By Location", "Where recoveries happen", barH(counts(H.location, 8)));
  return buildKpis() + `<div class="grid chart-grid" style="margin-top:16px">${charts}</div>`;
}
function renderResponse() {
  const stages = [
    { label: "Created → Accepted", val: mean(posNums(H.mCreatedAccept)) },
    { label: "Accepted → On Scene", val: mean(posNums(H.mAcceptArrive)) },
    { label: "On-Scene Work", val: mean(posNums(H.mOnScene)) },
    { label: "Return to Base", val: mean(posNums(H.mReturn)) },
  ];
  const turn = posNums(H.mTurnaround);
  const cap = percentile(turn, 95) || 1;
  const capped = turn.filter((n) => n <= cap);
  const bc = 12, min = 0, max = cap, w = (max - min) / bc;
  const bins = Array.from({ length: bc }, (_, i) => ({ from: i * w, to: (i + 1) * w, count: 0, label: `${Math.round(i * w)}–${Math.round((i + 1) * w)}` }));
  capped.forEach((n) => { let idx = Math.floor(n / w); if (idx >= bc) idx = bc - 1; if (idx < 0) idx = 0; bins[idx].count++; });
  let out = "";
  out += card("Recovery Lifecycle", "Average minutes per stage (completed dispatches with valid timestamps)", stagesBar(stages), "span-2");
  out += card("Turnaround Distribution", `Minutes, capped at 95th pct (${Math.round(cap)} min)`, barV(bins, color(2)));
  out += card("Avg Turnaround by Location", "Slowest locations first", barH(avgByCategory(H.location, H.mTurnaround, 8), (it) => `${it.val.toFixed(0)}m · n=${it.count}`));
  out += card("Avg Turnaround by Dispatch Type", "Slowest types first", barH(avgByCategory(H.type, H.mTurnaround, 10), (it) => `${it.val.toFixed(0)}m · n=${it.count}`));
  out += card("Avg Response by Dispatch Type", "Dispatch → on scene", barH(avgByCategory(H.type, H.mDispatchArrive, 10), (it) => `${it.val.toFixed(0)}m · n=${it.count}`));
  return `<div class="grid chart-grid">${out}</div>`;
}
function renderDispatch() {
  const l0 = counts(H.l0).filter((x) => /positive/i.test(x.label));
  let out = "";
  out += card("Reason for Event", "Why the VH6 needed response", barH(counts(H.reason, 14)));
  out += card("Recovery Action Taken", "How each event was resolved", barH(counts(H.action, 12)));
  out += card("ZR Milestone", "Autonomy milestone at time of event", donut(counts(H.milestone), "dispatches"));
  out += card("L0 True vs False Positive", "L0 alert accuracy", donut(l0, "L0 alerts"));
  out += card("By Assignee (FR Crew)", "Dispatches handled per crew ID", barH(counts(H.assignee, 12)));
  out += card("By Supervisor", "Dispatches by supervising lead", barH(counts(H.supervisor, 12)));
  return `<div class="grid chart-grid">${out}</div>`;
}
function renderFleet() {
  const ridersRec = counts(H.ridersRec).filter((x) => !/^false$/i.test(x.label));
  let out = "";
  out += card("Top VH6 Units by Dispatches", "Most-serviced vehicles", barH(counts(H.vh6, 12)));
  out += card("Bot Damage", "Was the bot damaged?", donut(counts(H.botDmg).filter((x) => /true|false/i.test(x.label)), "dispatches"));
  out += card("Rider Recovery Outcomes", "How riders were handled (excl. none)", ridersRec.length ? barH(ridersRec) : `<div class="empty-hint">No rider recoveries.</div>`);
  out += card("Flatbed Usage", "Internal vs external tow assets", donut(counts(H.flatbed), "tows"));
  out += card("3rd-Party Rider Shuttle", "Shuttle used?", donut(counts(H.shuttle).filter((x) => /true|false/i.test(x.label)), "dispatches"));
  out += card("Training Dispatches", "Training vs live", donut(counts(H.training).filter((x) => /true|false/i.test(x.label)), "dispatches"));
  return `<div class="grid chart-grid">${out}</div>`;
}
const EXPLORER_COLS = [H.date, H.vh6, H.status, H.type, H.reason, H.location, H.assignee, H.action, H.mTurnaround, H.botDmg, H.ridersIn];
const EXPLORER_LABELS = { [H.vh6]: "VH6", [H.action]: "Action", [H.mTurnaround]: "Turnaround (min)", [H.botDmg]: "Bot Damaged", [H.ridersIn]: "Riders" };
function renderExplorer() {
  const rows = STATE.records.slice(0, 150);
  const th = EXPLORER_COLS.map((h) => `<th>${esc(EXPLORER_LABELS[h] || h)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${EXPLORER_COLS.map((h) => `<td>${esc(r[h] ?? "")}</td>`).join("")}</tr>`).join("");
  return card("Dispatch Explorer", `Showing ${rows.length} of ${fmtNum(STATE.records.length)} dispatches · key fields (full dataset has ${STATE.headers.length} columns)`, `<div class="table-wrap"><table class="data"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
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
    const all = col(h).map((v) => (v ?? "").trim());
    const filled = all.filter((v) => v !== "");
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
  { id: "response", label: "Response Times", icon: "⏱", fn: renderResponse },
  { id: "dispatch", label: "Dispatch Analysis", icon: "🧭", fn: renderDispatch },
  { id: "fleet", label: "Fleet & Safety", icon: "🛡", fn: renderFleet },
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
  document.getElementById("subtitle").textContent = `${fmtNum(rows.length)} dispatches · ${headers.length} fields · Fleet Response recovery operations`;
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

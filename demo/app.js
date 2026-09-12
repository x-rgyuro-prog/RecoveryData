"use strict";

/* ---------------- palette + format ---------------- */
const COLORS = ["#4f8cff","#22d3a6","#f6b73c","#ff6b8b","#a78bfa","#38bdf8","#fb923c","#4ade80","#e879f9","#facc15","#2dd4bf","#f472b6"];
const color = (i) => COLORS[i % COLORS.length];
const nf = new Intl.NumberFormat("en-US");
const cf = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cf2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtNum = (n) => nf.format(n);
const fmtCur = (n, p) => (p ? cf2 : cf).format(n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- CSV parser ---------------- */
function parseCSV(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1)
    .map((r) => { const o = {}; headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim())); return o; })
    .filter((o) => Object.values(o).some((v) => v !== ""));
  return { headers: headers.filter(Boolean), rows: data };
}

/* ---------------- value parsing ---------------- */
function parseNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  let cleaned = s.replace(/[$,%\s]/g, "");
  if (/^\(.*\)$/.test(cleaned)) cleaned = "-" + cleaned.slice(1, -1);
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function parseDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return null;
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, mm, dd, yy] = m; let y = Number(yy);
    if (yy.length === 2) y += y < 70 ? 2000 : 1900;
    if (Number(mm) <= 12) { const d = new Date(y, mm - 1, dd); if (!isNaN(d)) return d; }
  }
  const named = s.match(/([a-zA-Z]{3,})/);
  if (named && MONTHS[named[1].slice(0, 3).toLowerCase()] !== undefined) {
    const d = new Date(s); if (!isNaN(d)) return d;
  }
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) { const d = new Date(s); if (!isNaN(d)) return d; }
  return null;
}

/* ---------------- type inference ---------------- */
const TRUE_SET = new Set(["true","yes","y","1","recovered","closed","complete","completed"]);
const FALSE_SET = new Set(["false","no","n","0","open","pending","incomplete"]);
function inferType(name, values) {
  if (!values.length) return "text";
  const lower = values.map((v) => v.toLowerCase());
  if (lower.every((v) => TRUE_SET.has(v) || FALSE_SET.has(v)) && new Set(lower).size <= 3) return "boolean";
  const dm = values.filter((v) => parseDate(v)).length;
  if (dm >= values.length * 0.7) return "date";
  const num = values.filter((v) => parseNumber(v) !== null).length;
  if (num >= values.length * 0.8) {
    if (values.filter((v) => v.includes("%")).length > values.length * 0.5 || /%|percent|rate/i.test(name)) return "percent";
    if (values.filter((v) => /\$/.test(v)).length > values.length * 0.4 || /(amount|fee|cost|price|revenue|balance|payout|charge|\$)/i.test(name)) return "currency";
    return "number";
  }
  const distinct = new Set(values).size;
  if (distinct <= Math.max(2, Math.min(40, values.length * 0.5))) return "category";
  return "text";
}
function summarize(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { min: s[0], max: s[s.length - 1], mean: sum / nums.length, median, sum };
}
function topValues(values, limit = 12) {
  const m = new Map();
  values.forEach((v) => m.set(v, (m.get(v) || 0) + 1));
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
function profileField(name, rows) {
  const all = rows.map((r) => (r[name] ?? "").trim());
  const filled = all.filter((v) => v !== "");
  const type = inferType(name, filled);
  const p = { name, type, filled: filled.length, missing: all.length - filled.length, distinct: new Set(filled).size };
  if (["number","currency","percent"].includes(type)) p.numeric = summarize(filled.map(parseNumber).filter((n) => n !== null));
  else if (type === "date") {
    const ds = filled.map(parseDate).filter(Boolean).map((d) => d.getTime());
    if (ds.length) p.dateRange = { min: new Date(Math.min(...ds)), max: new Date(Math.max(...ds)) };
  } else p.topValues = topValues(filled);
  return p;
}

/* ---------------- roles + insights ---------------- */
function pick(fields, type, patterns) {
  const cands = fields.filter((f) => f.type === type);
  for (const re of patterns) { const hit = cands.find((f) => re.test(f.name)); if (hit) return hit.name; }
  return undefined;
}
function detectRoles(fields) {
  const dateFields = fields.filter((f) => f.type === "date").map((f) => f.name);
  const numericFields = fields.filter((f) => ["number","currency","percent"].includes(f.type)).map((f) => f.name);
  const categoryFields = fields.filter((f) => (f.type === "category" || f.type === "boolean") && f.distinct > 1).map((f) => f.name);
  const feeFields = fields.filter((f) => f.type === "currency" || /(amount|fee|cost|price|revenue|balance|payout|charge|bill)/i.test(f.name)).map((f) => f.name);
  const primaryDate = pick(fields, "date", [/recover|repo|complete|close|resolv/i, /pick.?up|surrender/i, /assign|open|receiv|order/i, /date/i]) || dateFields[0];
  return {
    primaryDate, dateFields, numericFields, categoryFields, feeFields,
    statusField: pick(fields, "category", [/status|outcome|result|disposition|stage/i]) || pick(fields, "boolean", [/recover|status|closed|complete/i]),
    locationField: pick(fields, "category", [/state|region|city|location|zip|county|market|branch|lot|yard/i]),
    agentField: pick(fields, "category", [/agent|driver|recoverer|rep|assignee|team|vendor|contractor|spotter/i]),
    makeField: pick(fields, "category", [/make|manufacturer|brand/i]),
    modelField: pick(fields, "category", [/model/i]),
    daysField: pick(fields, "number", [/days|duration|age|time.?to|turnaround|dtr/i]),
  };
}
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function timeSeries(rows, field, feeField) {
  const b = new Map();
  rows.forEach((r) => {
    const d = parseDate(r[field]); if (!d) return;
    const k = monthKey(d); const e = b.get(k) || { count: 0, value: 0 };
    e.count++; if (feeField) e.value += parseNumber(r[feeField]) || 0; b.set(k, e);
  });
  return { field, points: [...b.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, e]) => ({ period, count: e.count, value: Math.round(e.value * 100) / 100 })) };
}
function breakdown(rows, field, role, feeField, limit = 12) {
  const m = new Map();
  rows.forEach((r) => {
    const v = (r[field] ?? "").trim(); if (!v) return;
    const e = m.get(v) || { count: 0, value: 0 }; e.count++; if (feeField) e.value += parseNumber(r[feeField]) || 0; m.set(v, e);
  });
  return { field, role, items: [...m.entries()].map(([label, e]) => ({ label, count: e.count, value: Math.round(e.value * 100) / 100 })).sort((a, b) => b.count - a.count).slice(0, limit) };
}
function histogram(rows, fp) {
  if (!fp.numeric) return null;
  const nums = rows.map((r) => parseNumber(r[fp.name])).filter((n) => n !== null);
  if (nums.length < 4 || fp.numeric.min === fp.numeric.max) return null;
  const { min, max } = fp.numeric;
  const bc = Math.min(10, Math.max(4, Math.round(Math.sqrt(nums.length))));
  const w = (max - min) / bc;
  const bins = Array.from({ length: bc }, (_, i) => ({ from: min + i * w, to: min + (i + 1) * w, count: 0 }));
  nums.forEach((n) => { let idx = Math.floor((n - min) / w); if (idx >= bc) idx = bc - 1; if (idx < 0) idx = 0; bins[idx].count++; });
  const f = (v) => (Number.isInteger(v) ? v : v.toFixed(1));
  bins.forEach((b) => (b.label = `${f(b.from)}–${f(b.to)}`));
  return { field: fp.name, bins, stats: fp.numeric };
}
function aging(rows, roles) {
  if (!roles.primaryDate) return null;
  const now = Date.now(); const buckets = { "0–7 days": 0, "8–30 days": 0, "31–90 days": 0, "90+ days": 0 };
  let counted = 0;
  rows.forEach((r) => {
    const d = parseDate(r[roles.primaryDate]); if (!d) return; counted++;
    const days = (now - d.getTime()) / 86400000;
    if (days <= 7) buckets["0–7 days"]++; else if (days <= 30) buckets["8–30 days"]++; else if (days <= 90) buckets["31–90 days"]++; else buckets["90+ days"]++;
  });
  return counted ? { field: roles.primaryDate, buckets: Object.entries(buckets).map(([label, count]) => ({ label, count })) } : null;
}
const RECOVERED = /recover|closed|complete|repo|success|found|picked/i;
function buildInsights(headers, rows) {
  const fields = headers.map((h) => profileField(h, rows));
  const roles = detectRoles(fields);
  const fee = roles.feeFields[0];
  const kpis = [{ label: "Total Records", value: fmtNum(rows.length) }];
  if (roles.primaryDate) {
    const ds = rows.map((r) => parseDate(r[roles.primaryDate])).filter(Boolean).map((d) => d.getTime());
    if (ds.length) {
      kpis.push({ label: "Date Range", value: `${new Date(Math.min(...ds)).toLocaleDateString()} – ${new Date(Math.max(...ds)).toLocaleDateString()}`, hint: `From "${roles.primaryDate}"` });
      const cutoff = Date.now() - 30 * 86400000;
      kpis.push({ label: "Last 30 Days", value: fmtNum(ds.filter((t) => t >= cutoff).length), hint: "New records" });
    }
  }
  if (roles.statusField) {
    const vals = rows.map((r) => (r[roles.statusField] ?? "").trim()).filter(Boolean);
    if (vals.length) kpis.push({ label: "Recovery Rate", value: `${Math.round((vals.filter((v) => RECOVERED.test(v)).length / vals.length) * 1000) / 10}%`, hint: `"${roles.statusField}" recovered/closed` });
  }
  if (roles.daysField) {
    const nums = rows.map((r) => parseNumber(r[roles.daysField])).filter((n) => n !== null);
    if (nums.length) kpis.push({ label: "Avg Days to Recover", value: `${Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10} days`, hint: `From "${roles.daysField}"` });
  }
  if (fee) {
    const nums = rows.map((r) => parseNumber(r[fee])).filter((n) => n !== null);
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      kpis.push({ label: `Total ${fee}`, value: fmtCur(sum) });
      kpis.push({ label: `Avg ${fee}`, value: fmtCur(sum / nums.length, true) });
    }
  }
  [["Distinct Makes", roles.makeField], ["Distinct Locations", roles.locationField], ["Active Agents", roles.agentField]].forEach(([label, f]) => {
    if (f) kpis.push({ label, value: fmtNum(new Set(rows.map((r) => (r[f] ?? "").trim()).filter(Boolean)).size) });
  });

  const series = [];
  if (roles.primaryDate) series.push(timeSeries(rows, roles.primaryDate, fee));
  roles.dateFields.forEach((d) => { if (d !== roles.primaryDate) series.push(timeSeries(rows, d)); });

  const bfields = new Map();
  [["Status", roles.statusField], ["Make", roles.makeField], ["Model", roles.modelField], ["Location", roles.locationField], ["Agent", roles.agentField]].forEach(([role, f]) => { if (f) bfields.set(f, role); });
  roles.categoryFields.forEach((c) => { if (!bfields.has(c)) bfields.set(c, "Category"); });
  const breakdowns = [...bfields.entries()].slice(0, 10).map(([f, role]) => breakdown(rows, f, role, fee));

  const histograms = roles.numericFields.map((n) => histogram(rows, fields.find((f) => f.name === n))).filter(Boolean);

  return { fields, roles, kpis, series, breakdowns, histograms, aging: aging(rows, roles), rowCount: rows.length };
}

/* ---------------- SVG charts ---------------- */
const fmtPeriod = (p) => { const [y, m] = p.split("-"); return m ? new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : p; };
function svgWrap(inner, w, h) { return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; }
function axis(x0, y0, x1, y1) { return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#26314f" stroke-width="1"/>`; }

function areaChart(points, key, col) {
  const W = 560, H = 280, pad = { l: 44, r: 16, t: 16, b: 34 };
  if (!points.length) return "";
  const max = Math.max(...points.map((p) => p[key]), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const area = `${pad.l},${pad.t + ih} ${line} ${x(points.length - 1)},${pad.t + ih}`;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/>`; g += `<text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const step = Math.ceil(points.length / 8);
  const labels = points.map((p, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 10}" fill="#9aa7c2" font-size="11" text-anchor="middle">${fmtPeriod(p.period)}</text>` : "")).join("");
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[key])}" r="3" fill="${col}"/>`).join("");
  return svgWrap(`${g}<polygon points="${area}" fill="${col}" opacity="0.14"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2.5"/>${dots}${labels}`, W, H);
}
function barV(bins, col) {
  const W = 560, H = 260, pad = { l: 40, r: 12, t: 14, b: 62 };
  const max = Math.max(...bins.map((b) => b.count), 1);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / bins.length;
  let g = "";
  for (let t = 0; t <= 4; t++) { const gy = pad.t + (ih / 4) * t; g += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#26314f" stroke-dasharray="3 3"/>`; g += `<text x="${pad.l - 8}" y="${gy + 4}" fill="#9aa7c2" font-size="11" text-anchor="end">${fmtNum(Math.round(max - (max / 4) * t))}</text>`; }
  const bars = bins.map((b, i) => {
    const h = (b.count / max) * ih, bx = pad.l + i * bw + 3, by = pad.t + ih - h;
    return `<rect x="${bx}" y="${by}" width="${bw - 6}" height="${h}" rx="4" fill="${col}"/>` +
      `<text x="${bx + (bw - 6) / 2}" y="${H - 44}" fill="#9aa7c2" font-size="9" text-anchor="end" transform="rotate(-35 ${bx + (bw - 6) / 2} ${H - 44})">${esc(b.label)}</text>`;
  }).join("");
  return svgWrap(`${g}${bars}`, W, H);
}
function barH(items, col) {
  const rowH = 26, pad = { l: 130, r: 40, t: 8, b: 8 };
  const W = 560, H = pad.t + pad.b + items.length * rowH;
  const max = Math.max(...items.map((i) => i.count), 1);
  const iw = W - pad.l - pad.r;
  const bars = items.map((it, i) => {
    const y = pad.t + i * rowH, w = (it.count / max) * iw, c = color(i);
    return `<text x="${pad.l - 8}" y="${y + rowH / 2 + 4}" fill="#c8d2e6" font-size="11" text-anchor="end">${esc(it.label.length > 20 ? it.label.slice(0, 19) + "…" : it.label)}</text>` +
      `<rect x="${pad.l}" y="${y + 4}" width="${Math.max(w, 1)}" height="${rowH - 10}" rx="4" fill="${c}"/>` +
      `<text x="${pad.l + Math.max(w, 1) + 6}" y="${y + rowH / 2 + 4}" fill="#9aa7c2" font-size="11">${fmtNum(it.count)}</text>`;
  }).join("");
  return svgWrap(bars, W, H);
}
function annularSector(cx, cy, r, ir, a0, a1, fill) {
  // Split large sweeps so a full (or near-full) ring still renders, since a
  // single SVG arc cannot draw a complete 360° circle.
  const sweep = a1 - a0;
  if (sweep > Math.PI * 1.9999) {
    const mid = a0 + sweep / 2;
    return annularSector(cx, cy, r, ir, a0, mid, fill) + annularSector(cx, cy, r, ir, mid, a1, fill);
  }
  const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
  const xi1 = cx + ir * Math.cos(a1), yi1 = cy + ir * Math.sin(a1);
  const xi2 = cx + ir * Math.cos(a0), yi2 = cy + ir * Math.sin(a0);
  const large = sweep > Math.PI ? 1 : 0;
  return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${ir} ${ir} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${fill}"/>`;
}
function donut(items) {
  const W = 360, H = 280, cx = 150, cy = 140, r = 100, ir = 60;
  const total = items.reduce((a, b) => a + b.count, 0) || 1;
  let ang = -Math.PI / 2, paths = "";
  items.forEach((it, i) => {
    if (it.count <= 0) return;
    const a2 = ang + (it.count / total) * Math.PI * 2;
    paths += annularSector(cx, cy, r, ir, ang, a2, color(i));
    ang = a2;
  });
  const legend = items.map((it, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${color(i)}"></span>${esc(it.label)} (${fmtNum(it.count)})</div>`).join("");
  return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${svgWrap(paths + `<text x="${cx}" y="${cy + 5}" fill="#e7ecf5" font-size="20" font-weight="700" text-anchor="middle">${fmtNum(total)}</text>`, W, H).replace('width="100%"','width="360"')}<div class="legend" style="flex-direction:column">${legend}</div></div>`;
}

/* ---------------- rendering ---------------- */
const PAGES = [
  { id: "overview", label: "Overview", icon: "◎" },
  { id: "trends", label: "Trends", icon: "📈" },
  { id: "breakdowns", label: "Breakdowns", icon: "🧩" },
  { id: "explorer", label: "Data Explorer", icon: "🔎" },
  { id: "quality", label: "Data Quality", icon: "✓" },
];
let STATE = { insights: null, headers: [], rows: [], page: "overview" };

function card(title, sub, body) { return `<div class="card"><h3 class="card-title">${esc(title)}</h3>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}${body}</div>`; }

function renderOverview() {
  const I = STATE.insights;
  const kpis = `<div class="grid kpi-grid">${I.kpis.map((k, i) => `<div class="card kpi"><div class="kpi-accent" style="background:${color(i)}"></div><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div>${k.hint ? `<div class="kpi-hint">${esc(k.hint)}</div>` : ""}</div>`).join("")}</div>`;
  let charts = "";
  const s = I.series[0];
  if (s && s.points.length) charts += card("Recoveries Over Time", `Monthly volume by "${s.field}"`, areaChart(s.points, "count", color(0)));
  const b = I.breakdowns[0];
  if (b && b.items.length) charts += card(`By ${b.role}: ${b.field}`, `${b.items.length} shown`, barH(b.items, color(0)));
  if (I.aging && I.aging.buckets.some((x) => x.count > 0)) charts += card("Record Aging", `Age since "${I.aging.field}"`, donut(I.aging.buckets));
  return kpis + `<div class="grid chart-grid" style="margin-top:16px">${charts}</div>`;
}
function renderTrends() {
  const I = STATE.insights;
  const s = I.series.filter((x) => x.points.length);
  if (!s.length) return card("Trends", "", `<div class="muted">No date columns detected.</div>`);
  return `<div class="grid chart-grid">${s.map((x, i) => {
    const total = x.points.reduce((a, p) => a + p.count, 0);
    return card(`Trend — ${x.field}`, `${fmtNum(total)} records across ${x.points.length} months`, areaChart(x.points, "count", color(i)));
  }).join("")}</div>`;
}
function renderBreakdowns() {
  const I = STATE.insights;
  let out = "";
  if (I.breakdowns.length) out += `<div class="grid chart-grid">${I.breakdowns.map((b) => card(`${b.role}: ${b.field}`, `${b.items.length} shown`, b.items.length <= 6 ? donut(b.items) : barH(b.items, color(0)))).join("")}</div>`;
  if (I.histograms.length) out += `<div class="section-title">Numeric Distributions</div><div class="grid chart-grid">${I.histograms.map((h) => card(`Distribution: ${h.field}`, `min ${fmtNum(h.stats.min)} · median ${fmtNum(Math.round(h.stats.median))} · max ${fmtNum(h.stats.max)}`, barV(h.bins, color(4)))).join("")}</div>`;
  return out || card("Breakdowns", "", `<div class="muted">No categorical or numeric columns detected.</div>`);
}
function renderExplorer() {
  const { headers, rows } = STATE;
  const show = rows.slice(0, 100);
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const tr = show.map((r) => `<tr>${headers.map((h) => `<td>${esc(r[h] ?? "")}</td>`).join("")}</tr>`).join("");
  return card("Data Explorer", `Showing ${show.length} of ${fmtNum(rows.length)} rows (searchable & sortable in the full app)`, `<div class="table-wrap"><table class="data"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
}
function renderQuality() {
  const I = STATE.insights;
  const rowsH = I.fields.map((f) => {
    const total = f.filled + f.missing, comp = total ? Math.round((f.filled / total) * 100) : 0;
    const col = comp > 80 ? "#22d3a6" : comp > 50 ? "#f6b73c" : "#ff6b8b";
    let summary = "";
    if (f.numeric) summary = `min ${fmtNum(f.numeric.min)} · avg ${fmtNum(Math.round(f.numeric.mean * 10) / 10)} · max ${fmtNum(f.numeric.max)}`;
    else if (f.dateRange) summary = `${f.dateRange.min.toLocaleDateString()} → ${f.dateRange.max.toLocaleDateString()}`;
    else if (f.topValues) summary = f.topValues.slice(0, 3).map((t) => `${t.value} (${t.count})`).join(", ");
    return `<tr><td style="font-weight:600">${esc(f.name)}</td><td><span class="pill">${f.type}</span></td><td><span class="bar-track"><span class="bar-fill" style="width:${comp}%;background:${col}"></span></span> <span class="muted" style="font-size:12px">${comp}%</span></td><td>${fmtNum(f.filled)}</td><td>${fmtNum(f.missing)}</td><td>${fmtNum(f.distinct)}</td><td class="muted" style="white-space:normal;max-width:320px">${esc(summary)}</td></tr>`;
  }).join("");
  return card("Detected Schema & Data Quality", `${I.fields.length} columns · ${fmtNum(I.rowCount)} rows · types inferred automatically`, `<div class="table-wrap"><table class="data"><thead><tr><th>Column</th><th>Type</th><th>Complete</th><th>Filled</th><th>Missing</th><th>Distinct</th><th>Summary</th></tr></thead><tbody>${rowsH}</tbody></table></div>`);
}

function renderNav() {
  document.getElementById("nav").innerHTML = PAGES.map((p) => `<div class="nav-link ${p.id === STATE.page ? "active" : ""}" data-page="${p.id}"><span class="nav-icon">${p.icon}</span>${p.label}</div>`).join("");
  document.querySelectorAll(".nav-link").forEach((el) => el.addEventListener("click", () => { STATE.page = el.dataset.page; renderNav(); renderContent(); }));
}
function renderContent() {
  const map = { overview: renderOverview, trends: renderTrends, breakdowns: renderBreakdowns, explorer: renderExplorer, quality: renderQuality };
  document.getElementById("content").innerHTML = (map[STATE.page] || renderOverview)();
}

function boot(text) {
  const { headers, rows } = parseCSV(text);
  STATE.headers = headers; STATE.rows = rows;
  STATE.insights = buildInsights(headers, rows);
  const requested = new URLSearchParams(location.search).get("page");
  if (requested && PAGES.some((p) => p.id === requested)) STATE.page = requested;
  document.getElementById("subtitle").textContent = `${fmtNum(rows.length)} records · ${headers.length} columns · a friendlier, always-current view of your recovery operation.`;
  renderNav(); renderContent();
  window.__READY__ = true;
}

async function init() {
  // If data is inlined (window.__CSV__), render synchronously so headless
  // screenshots capture a fully-rendered page. Otherwise fetch data.csv.
  if (typeof window.__CSV__ === "string") { boot(window.__CSV__); return; }
  try {
    const res = await fetch("./data.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(`data.csv HTTP ${res.status}`);
    const text = await res.text();
    const { headers, rows } = parseCSV(text);
    STATE.headers = headers; STATE.rows = rows;
    STATE.insights = buildInsights(headers, rows);
    const requested = new URLSearchParams(location.search).get("page");
    if (requested && PAGES.some((p) => p.id === requested)) STATE.page = requested;
    document.getElementById("subtitle").textContent = `${fmtNum(rows.length)} records · ${headers.length} columns · a friendlier, always-current view of your recovery operation.`;
    renderNav(); renderContent();
    window.__READY__ = true;
  } catch (e) {
    document.getElementById("content").innerHTML = `<div class="card"><h3 class="card-title" style="color:#ff6b8b">Could not load data</h3><div class="muted">${esc(e.message)}</div></div>`;
    window.__READY__ = true;
  }
}
init();

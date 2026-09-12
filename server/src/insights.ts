import type { RawSheet, Row } from "./sheets.js";
import {
  buildProfile,
  parseDateValue,
  parseNumber,
  type DatasetProfile,
  type FieldProfile,
} from "./analyze.js";

export interface Kpi {
  key: string;
  label: string;
  value: number | string;
  format: "number" | "currency" | "percent" | "days" | "text";
  hint?: string;
}

export interface TimeSeriesPoint {
  period: string;
  count: number;
  [metric: string]: string | number;
}

export interface TimeSeries {
  field: string;
  granularity: "month";
  points: TimeSeriesPoint[];
}

export interface Breakdown {
  field: string;
  role: string;
  items: { label: string; count: number; value?: number }[];
}

export interface Histogram {
  field: string;
  bins: { label: string; count: number; from: number; to: number }[];
  stats: { min: number; max: number; mean: number; median: number };
}

export interface AgingBucket {
  label: string;
  count: number;
}

export interface Insights {
  rowCount: number;
  fetchedAt: string;
  roles: DetectedRoles;
  kpis: Kpi[];
  timeSeries: TimeSeries[];
  breakdowns: Breakdown[];
  histograms: Histogram[];
  aging?: { field: string; buckets: AgingBucket[] };
}

interface DetectedRoles {
  primaryDate?: string;
  dateFields: string[];
  statusField?: string;
  locationField?: string;
  agentField?: string;
  makeField?: string;
  modelField?: string;
  yearField?: string;
  feeFields: string[];
  daysField?: string;
  numericFields: string[];
  categoryFields: string[];
}

function pick(fields: FieldProfile[], type: FieldProfile["type"], patterns: RegExp[]): string | undefined {
  const candidates = fields.filter((f) => f.type === type);
  for (const re of patterns) {
    const hit = candidates.find((f) => re.test(f.name));
    if (hit) return hit.name;
  }
  return undefined;
}

function detectRoles(profile: DatasetProfile): DetectedRoles {
  const f = profile.fields;
  const dateFields = f.filter((x) => x.type === "date").map((x) => x.name);
  const numericFields = f
    .filter((x) => x.type === "number" || x.type === "currency" || x.type === "percent")
    .map((x) => x.name);
  const categoryFields = f
    .filter((x) => (x.type === "category" || x.type === "boolean") && x.distinct > 1)
    .map((x) => x.name);
  const feeFields = f
    .filter((x) => x.type === "currency" || /(amount|fee|cost|price|revenue|balance|payout|charge|bill)/i.test(x.name))
    .map((x) => x.name);

  const primaryDate =
    pick(f, "date", [/recover|repo|complete|close|resolv/i, /pick.?up|surrender/i, /assign|open|receiv|order/i, /date/i]) ??
    dateFields[0];

  return {
    primaryDate,
    dateFields,
    statusField: pick(f, "category", [/status|outcome|result|disposition|stage|state of/i]) ??
      pick(f, "boolean", [/recover|status|closed|complete/i]),
    locationField: pick(f, "category", [/state|region|city|location|zip|county|market|branch|lot|yard/i]),
    agentField: pick(f, "category", [/agent|driver|recoverer|rep|assignee|team|vendor|contractor|spotter/i]),
    makeField: pick(f, "category", [/make|manufacturer|brand/i]),
    modelField: pick(f, "category", [/model/i]),
    yearField:
      pick(f, "number", [/year|yr|model.?year/i]) ?? pick(f, "category", [/year|yr/i]),
    feeFields,
    daysField: pick(f, "number", [/days|duration|age|time.?to|turnaround|dtr/i]),
    numericFields,
    categoryFields,
  };
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildTimeSeries(rows: Row[], field: string, feeField?: string): TimeSeries {
  const buckets = new Map<string, { count: number; value: number }>();
  for (const row of rows) {
    const d = parseDateValue(row[field]);
    if (!d) continue;
    const key = monthKey(d);
    const b = buckets.get(key) ?? { count: 0, value: 0 };
    b.count += 1;
    if (feeField) b.value += parseNumber(row[feeField]) ?? 0;
    buckets.set(key, b);
  }
  const points: TimeSeriesPoint[] = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, b]) => {
      const point: TimeSeriesPoint = { period, count: b.count };
      if (feeField) point.value = Math.round(b.value * 100) / 100;
      return point;
    });
  return { field, granularity: "month", points };
}

function buildBreakdown(rows: Row[], field: string, role: string, feeField?: string, limit = 12): Breakdown {
  const map = new Map<string, { count: number; value: number }>();
  for (const row of rows) {
    const raw = (row[field] ?? "").trim();
    if (!raw) continue;
    const b = map.get(raw) ?? { count: 0, value: 0 };
    b.count += 1;
    if (feeField) b.value += parseNumber(row[feeField]) ?? 0;
    map.set(raw, b);
  }
  const items = [...map.entries()]
    .map(([label, b]) => ({ label, count: b.count, value: feeField ? Math.round(b.value * 100) / 100 : undefined }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  return { field, role, items };
}

function buildHistogram(rows: Row[], field: FieldProfile): Histogram | null {
  if (!field.numeric) return null;
  const nums = rows.map((r) => parseNumber(r[field.name])).filter((n): n is number => n !== null);
  if (nums.length < 4) return null;
  const { min, max } = field.numeric;
  if (min === max) return null;
  const binCount = Math.min(10, Math.max(4, Math.round(Math.sqrt(nums.length))));
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
    label: "",
  }));
  for (const n of nums) {
    let idx = Math.floor((n - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  for (const b of bins) b.label = `${fmt(b.from)}–${fmt(b.to)}`;
  return {
    field: field.name,
    bins,
    stats: { min: field.numeric.min, max: field.numeric.max, mean: field.numeric.mean, median: field.numeric.median },
  };
}

const RECOVERED_RE = /recover|closed|complete|repo|success|found|picked/i;

function buildAging(rows: Row[], roles: DetectedRoles): Insights["aging"] {
  const dateField = roles.primaryDate;
  if (!dateField) return undefined;
  const now = Date.now();
  const buckets: Record<string, number> = { "0–7 days": 0, "8–30 days": 0, "31–90 days": 0, "90+ days": 0 };
  let counted = 0;
  for (const row of rows) {
    const d = parseDateValue(row[dateField]);
    if (!d) continue;
    counted += 1;
    const days = (now - d.getTime()) / 86_400_000;
    if (days <= 7) buckets["0–7 days"] += 1;
    else if (days <= 30) buckets["8–30 days"] += 1;
    else if (days <= 90) buckets["31–90 days"] += 1;
    else buckets["90+ days"] += 1;
  }
  if (counted === 0) return undefined;
  return { field: dateField, buckets: Object.entries(buckets).map(([label, count]) => ({ label, count })) };
}

export function buildInsights(sheet: RawSheet): { profile: DatasetProfile; insights: Insights } {
  const profile = buildProfile(sheet);
  const roles = detectRoles(profile);
  const rows = sheet.rows;
  const primaryFee = roles.feeFields[0];

  const kpis: Kpi[] = [];
  kpis.push({ key: "total", label: "Total Records", value: rows.length, format: "number" });

  if (roles.primaryDate) {
    const dates = rows.map((r) => parseDateValue(r[roles.primaryDate!])).filter((d): d is Date => d !== null);
    if (dates.length) {
      const times = dates.map((d) => d.getTime());
      const min = new Date(Math.min(...times));
      const max = new Date(Math.max(...times));
      kpis.push({
        key: "date_span",
        label: "Date Range",
        value: `${min.toLocaleDateString()} – ${max.toLocaleDateString()}`,
        format: "text",
        hint: `Based on "${roles.primaryDate}"`,
      });
      const cutoff = Date.now() - 30 * 86_400_000;
      const last30 = times.filter((t) => t >= cutoff).length;
      kpis.push({ key: "last30", label: "Last 30 Days", value: last30, format: "number", hint: `New "${roles.primaryDate}" in last 30 days` });
    }
  }

  if (roles.statusField) {
    const values = rows.map((r) => (r[roles.statusField!] ?? "").trim()).filter(Boolean);
    const recovered = values.filter((v) => RECOVERED_RE.test(v)).length;
    if (values.length) {
      kpis.push({
        key: "recovery_rate",
        label: "Recovery Rate",
        value: Math.round((recovered / values.length) * 1000) / 10,
        format: "percent",
        hint: `Share of "${roles.statusField}" marked recovered/closed`,
      });
    }
  }

  if (roles.daysField) {
    const nums = rows.map((r) => parseNumber(r[roles.daysField!])).filter((n): n is number => n !== null);
    if (nums.length) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      kpis.push({ key: "avg_days", label: "Avg Days to Recover", value: Math.round(mean * 10) / 10, format: "days", hint: `From "${roles.daysField}"` });
    }
  }

  if (primaryFee) {
    const nums = rows.map((r) => parseNumber(r[primaryFee])).filter((n): n is number => n !== null);
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      kpis.push({ key: "total_fees", label: `Total ${primaryFee}`, value: Math.round(sum * 100) / 100, format: "currency" });
      kpis.push({ key: "avg_fees", label: `Avg ${primaryFee}`, value: Math.round((sum / nums.length) * 100) / 100, format: "currency" });
    }
  }

  for (const [label, field] of [
    ["Distinct Makes", roles.makeField],
    ["Distinct Locations", roles.locationField],
    ["Active Agents", roles.agentField],
  ] as const) {
    if (field) {
      const distinct = new Set(rows.map((r) => (r[field] ?? "").trim()).filter(Boolean)).size;
      kpis.push({ key: `distinct_${field}`, label, value: distinct, format: "number" });
    }
  }

  const timeSeries: TimeSeries[] = [];
  if (roles.primaryDate) timeSeries.push(buildTimeSeries(rows, roles.primaryDate, primaryFee));
  for (const df of roles.dateFields) {
    if (df !== roles.primaryDate) timeSeries.push(buildTimeSeries(rows, df));
  }

  const breakdownFields = new Map<string, string>();
  if (roles.statusField) breakdownFields.set(roles.statusField, "Status");
  if (roles.makeField) breakdownFields.set(roles.makeField, "Make");
  if (roles.modelField) breakdownFields.set(roles.modelField, "Model");
  if (roles.locationField) breakdownFields.set(roles.locationField, "Location");
  if (roles.agentField) breakdownFields.set(roles.agentField, "Agent");
  for (const c of roles.categoryFields) if (!breakdownFields.has(c)) breakdownFields.set(c, "Category");

  const breakdowns: Breakdown[] = [...breakdownFields.entries()]
    .slice(0, 10)
    .map(([field, role]) => buildBreakdown(rows, field, role, primaryFee));

  const histograms: Histogram[] = [];
  for (const nf of roles.numericFields) {
    const fp = profile.fields.find((x) => x.name === nf);
    if (fp) {
      const h = buildHistogram(rows, fp);
      if (h) histograms.push(h);
    }
  }

  const aging = buildAging(rows, roles);

  return {
    profile,
    insights: {
      rowCount: rows.length,
      fetchedAt: sheet.fetchedAt,
      roles,
      kpis,
      timeSeries,
      breakdowns,
      histograms,
      aging,
    },
  };
}

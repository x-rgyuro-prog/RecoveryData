import type { RawSheet, Row } from "./sheets.js";

export type FieldType = "number" | "currency" | "percent" | "date" | "boolean" | "category" | "text";

export interface FieldProfile {
  name: string;
  type: FieldType;
  filled: number;
  missing: number;
  distinct: number;
  numeric?: { min: number; max: number; mean: number; median: number; sum: number };
  dateRange?: { min: string; max: string };
  topValues?: { value: string; count: number }[];
}

export interface DatasetProfile {
  rowCount: number;
  fields: FieldProfile[];
}

const TRUE_SET = new Set(["true", "yes", "y", "1", "recovered", "closed", "complete", "completed"]);
const FALSE_SET = new Set(["false", "no", "n", "0", "open", "pending", "incomplete"]);

export function cleanNumberString(raw: string): string {
  return raw.replace(/[$,%\s,]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
}

export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const cleaned = cleanNumberString(s);
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseDateValue(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "" || /^\d+(\.\d+)?$/.test(s) === false && s.length < 6) return maybeNativeDate(s);
  // Pure numbers are ambiguous (could be counts); don't treat as dates.
  if (/^-?\d+(\.\d+)?$/.test(s)) return null;

  // M/D/YYYY, M-D-YYYY, M/D/YY
  const mdy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdy) {
    let [, mm, dd, yy] = mdy;
    let year = Number(yy);
    if (yy.length === 2) year += year < 70 ? 2000 : 1900;
    const d = new Date(year, Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime()) && Number(mm) <= 12) return d;
  }

  // 12 Jan 2024 / Jan 12, 2024
  const named = s.match(/([a-zA-Z]{3,})/);
  if (named && MONTHS[named[1].slice(0, 3).toLowerCase()] !== undefined) {
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return maybeNativeDate(s);
}

function maybeNativeDate(s: string): Date | null {
  // ISO-like only, to avoid over-eager matching.
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isPercentColumn(name: string, values: string[]): boolean {
  const pctValues = values.filter((v) => v.includes("%")).length;
  return pctValues > values.length * 0.5 || /%|percent|rate/i.test(name);
}

function isCurrencyColumn(name: string, values: string[]): boolean {
  const dollar = values.filter((v) => /\$/.test(v)).length;
  return dollar > values.length * 0.4 || /(amount|fee|cost|price|revenue|balance|payout|charge|\$)/i.test(name);
}

function inferType(name: string, values: string[]): FieldType {
  if (values.length === 0) return "text";
  const lower = values.map((v) => v.toLowerCase());

  const boolMatches = lower.filter((v) => TRUE_SET.has(v) || FALSE_SET.has(v)).length;
  if (boolMatches === values.length && new Set(lower).size <= 3) return "boolean";

  const dateMatches = values.filter((v) => parseDateValue(v) !== null).length;
  if (dateMatches >= values.length * 0.7) return "date";

  const numMatches = values.filter((v) => parseNumber(v) !== null).length;
  if (numMatches >= values.length * 0.8) {
    if (isPercentColumn(name, values)) return "percent";
    if (isCurrencyColumn(name, values)) return "currency";
    return "number";
  }

  const distinct = new Set(values).size;
  if (distinct <= Math.max(2, Math.min(40, values.length * 0.5))) return "category";
  return "text";
}

function summarizeNumbers(nums: number[]) {
  if (nums.length === 0) return undefined;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { min: sorted[0], max: sorted[sorted.length - 1], mean: sum / nums.length, median, sum };
}

function topValues(values: string[], limit = 12) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function profileField(name: string, rows: Row[]): FieldProfile {
  const all = rows.map((r) => (r[name] ?? "").trim());
  const filledValues = all.filter((v) => v !== "");
  const type = inferType(name, filledValues);
  const profile: FieldProfile = {
    name,
    type,
    filled: filledValues.length,
    missing: all.length - filledValues.length,
    distinct: new Set(filledValues).size,
  };

  if (type === "number" || type === "currency" || type === "percent") {
    const nums = filledValues.map(parseNumber).filter((n): n is number => n !== null);
    profile.numeric = summarizeNumbers(nums);
  } else if (type === "date") {
    const dates = filledValues.map(parseDateValue).filter((d): d is Date => d !== null);
    if (dates.length) {
      const times = dates.map((d) => d.getTime());
      profile.dateRange = {
        min: new Date(Math.min(...times)).toISOString(),
        max: new Date(Math.max(...times)).toISOString(),
      };
    }
  } else {
    profile.topValues = topValues(filledValues);
  }

  return profile;
}

export function buildProfile(sheet: RawSheet): DatasetProfile {
  return {
    rowCount: sheet.rows.length,
    fields: sheet.headers.map((h) => profileField(h, sheet.rows)),
  };
}

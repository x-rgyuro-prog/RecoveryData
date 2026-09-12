export type FieldType =
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "boolean"
  | "category"
  | "text";

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
  value?: number;
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

export interface Insights {
  rowCount: number;
  fetchedAt: string;
  roles: Record<string, unknown>;
  kpis: Kpi[];
  timeSeries: TimeSeries[];
  breakdowns: Breakdown[];
  histograms: Histogram[];
  aging?: { field: string; buckets: { label: string; count: number }[] };
}

export interface DataResponse {
  gid: string;
  fetchedAt: string;
  headers: string[];
  profile: DatasetProfile;
  insights: Insights;
  sourceUrl: string;
}

export interface RowsResponse {
  gid: string;
  fetchedAt: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface SheetTab {
  label: string;
  gid: string;
}

export interface AppConfig {
  tabs: SheetTab[];
  sheetUrl: string;
  liveEveryLoad: boolean;
}

export interface ApiError {
  error: string;
  hint?: string;
}

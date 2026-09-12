import type { AppConfig, DataResponse, RowsResponse } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    const err = new Error(body.error ?? `Request failed (${res.status})`) as Error & { hint?: string };
    err.hint = body.hint;
    throw err;
  }
  return body as T;
}

export function fetchConfig(): Promise<AppConfig> {
  return getJson<AppConfig>("/api/config");
}

export function fetchData(gid?: string): Promise<DataResponse> {
  const q = gid ? `?gid=${encodeURIComponent(gid)}` : "";
  return getJson<DataResponse>(`/api/data${q}`);
}

export function fetchRows(gid?: string): Promise<RowsResponse> {
  const q = gid ? `?gid=${encodeURIComponent(gid)}` : "";
  return getJson<RowsResponse>(`/api/rows${q}`);
}

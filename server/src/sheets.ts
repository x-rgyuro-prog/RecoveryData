import Papa from "papaparse";
import { config, csvExportUrl } from "./config.js";

export type Row = Record<string, string>;

export interface RawSheet {
  gid: string;
  headers: string[];
  rows: Row[];
  fetchedAt: string;
}

export class SheetAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "SheetAccessError";
  }
}

// Share a single in-flight request between concurrent callers so a burst of
// component loads does not trigger duplicate downloads. This never serves stale
// data: each fully-completed request still re-fetches the live sheet.
const inFlight = new Map<string, Promise<RawSheet>>();
const lastResult = new Map<string, { at: number; value: RawSheet }>();

async function download(gid: string): Promise<RawSheet> {
  const url = csvExportUrl(gid);
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "RecoveryData-Dashboard/1.0" },
    });
  } catch (err) {
    throw new SheetAccessError(
      `Could not reach Google Sheets: ${(err as Error).message}`,
      502,
      "The environment may not have outbound network access to docs.google.com.",
    );
  }

  const finalUrl = res.url || url;
  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    throw new SheetAccessError(
      `Google Sheets returned HTTP ${res.status} for gid ${gid}.`,
      res.status === 404 ? 404 : 502,
      res.status === 404
        ? "Check that SHEET_ID and the tab gid are correct."
        : "The sheet may be private. Set link sharing to 'Anyone with the link (Viewer)'.",
    );
  }

  // A private sheet redirects to an HTML sign-in page instead of CSV.
  if (contentType.includes("text/html") || finalUrl.includes("accounts.google.com")) {
    throw new SheetAccessError(
      "Google returned a sign-in page instead of CSV data.",
      403,
      "The sheet is not publicly readable. Set sharing to 'Anyone with the link (Viewer)' or publish it to the web.",
    );
  }

  const text = await res.text();
  const parsed = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = (parsed.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
  const rows = (parsed.data as Row[]).filter((row) =>
    Object.values(row).some((v) => v != null && String(v).trim() !== ""),
  );

  return { gid, headers, rows, fetchedAt: new Date().toISOString() };
}

export async function fetchRawSheet(gid: string): Promise<RawSheet> {
  const dedupeMs = Math.max(0, config.fetchDedupeSeconds) * 1000;
  if (dedupeMs > 0) {
    const cached = lastResult.get(gid);
    if (cached && Date.now() - cached.at < dedupeMs) return cached.value;
  }

  const existing = inFlight.get(gid);
  if (existing) return existing;

  const promise = download(gid)
    .then((value) => {
      lastResult.set(gid, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(gid);
    });

  inFlight.set(gid, promise);
  return promise;
}

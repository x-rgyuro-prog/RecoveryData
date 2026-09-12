import dotenv from "dotenv";

dotenv.config();

export interface SheetTab {
  label: string;
  gid: string;
}

function parseExtraSheets(raw: string | undefined): SheetTab[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.lastIndexOf(":");
      if (idx === -1) return { label: pair, gid: pair };
      return { label: pair.slice(0, idx).trim(), gid: pair.slice(idx + 1).trim() };
    });
}

export const config = {
  sheetId: process.env.SHEET_ID ?? "1B3FggMT8nM0XJoUP7DcM-ehpsGOc0_VSZtQrtxHQ78k",
  rawGid: process.env.RAW_GID ?? "498750883",
  extraSheets: parseExtraSheets(process.env.EXTRA_SHEETS),
  port: Number(process.env.PORT ?? 3001),
  fetchDedupeSeconds: Number(process.env.FETCH_DEDUPE_SECONDS ?? 0),
};

export function csvExportUrl(gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&gid=${gid}`;
}

export function tabs(): SheetTab[] {
  return [{ label: "Raw Data", gid: config.rawGid }, ...config.extraSheets];
}

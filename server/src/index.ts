import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import compression from "compression";
import cors from "cors";
import { config, tabs, csvExportUrl } from "./config.js";
import { fetchRawSheet, SheetAccessError } from "./sheets.js";
import { buildInsights } from "./insights.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(compression());
app.use(cors());

// The sheet must be re-read live on every open: never let a proxy/browser cache
// the API responses.
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

function resolveGid(query: unknown): string {
  const gid = typeof query === "string" && query.trim() ? query.trim() : config.rawGid;
  return gid;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/config", (_req, res) => {
  res.json({
    tabs: tabs(),
    sheetUrl: `https://docs.google.com/spreadsheets/d/${config.sheetId}`,
    liveEveryLoad: true,
  });
});

app.get("/api/data", async (req, res) => {
  const gid = resolveGid(req.query.gid);
  try {
    const sheet = await fetchRawSheet(gid);
    const { profile, insights } = buildInsights(sheet);
    res.json({
      gid,
      fetchedAt: sheet.fetchedAt,
      headers: sheet.headers,
      profile,
      insights,
      sourceUrl: csvExportUrl(gid),
    });
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/rows", async (req, res) => {
  const gid = resolveGid(req.query.gid);
  try {
    const sheet = await fetchRawSheet(gid);
    res.json({ gid, fetchedAt: sheet.fetchedAt, headers: sheet.headers, rows: sheet.rows });
  } catch (err) {
    handleError(res, err);
  }
});

function handleError(res: express.Response, err: unknown) {
  if (err instanceof SheetAccessError) {
    res.status(err.status).json({ error: err.message, hint: err.hint });
    return;
  }
  console.error("Unexpected error:", err);
  res.status(500).json({ error: (err as Error).message ?? "Unknown error" });
}

// Serve the built client in production.
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`RecoveryData API listening on http://localhost:${config.port}`);
  console.log(`Live source: ${csvExportUrl(config.rawGid)}`);
});

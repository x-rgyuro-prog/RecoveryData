# RecoveryData

A live analytics dashboard for vehicle-recovery data. It reads a Google Sheet
**fresh on every load** and presents the data in a friendly, multi-page UI with
KPIs, trends, breakdowns, a searchable data explorer, and data-quality profiling.

> **Core rule:** the app never stores a copy of the data. Every time the
> dashboard is opened (or refreshed), the server re-fetches the Google Sheet, so
> viewers always see up-to-date numbers without needing access to the sheet
> itself.

## Architecture

```
client/   React + Vite + Recharts dashboard (multi-page)
server/   Express API that fetches the sheet live, parses CSV, and computes metrics
```

- **`server`** exposes a small JSON API. On every request it downloads the sheet's
  CSV export (`https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>`),
  parses it, infers column types, and computes vehicle-recovery insights. Responses
  are sent with `Cache-Control: no-store` so nothing is cached.
- **`client`** calls the API on load and renders KPIs and charts. In development it
  runs on Vite (port `5173`) and proxies `/api` to the server (port `3001`). In
  production the server serves the built client.

The analytics layer is **schema-adaptive**: it detects likely columns (dates,
status, make/model, location, agent, fees, mileage, year, days-to-recover) by name
and type, then derives KPIs, monthly trends, categorical breakdowns, numeric
histograms, and record-aging buckets. Unrecognized columns still appear in the
Data Explorer and Data Quality views.

## Configuration

Copy `.env.example` to `.env` (optional — sensible defaults are baked in):

| Variable | Purpose |
| --- | --- |
| `SHEET_ID` | Spreadsheet ID from the sheet URL. |
| `RAW_GID` | `gid` of the tab holding the raw recovery data. |
| `EXTRA_SHEETS` | Optional `Label:gid` pairs for extra tabs. |
| `PORT` | Server port (default `3001`). |
| `FETCH_DEDUPE_SECONDS` | Tiny window to dedupe concurrent identical fetches (default `0` = always fresh). |

The Google Sheet must be readable without login — set sharing to
"Anyone with the link (Viewer)" or publish it to the web.

## Development

```bash
npm install        # installs both workspaces
npm run dev        # runs server (3001) + client (5173) together
```

Open http://localhost:5173.

## Build & run (production)

```bash
npm run build      # builds client and server
npm start          # serves API + built client on PORT (default 3001)
```

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Liveness check. |
| `GET /api/config` | Sheet tabs and source URL. |
| `GET /api/data?gid=` | Live fetch + full computed insights and column profile. |
| `GET /api/rows?gid=` | Live fetch of raw rows for the Data Explorer. |

## Upload app (`demo/`)

A dependency-free static web app (vanilla JS + hand-rolled SVG charts) tailored to
the Fleet Response dataset. It runs with **no npm, no backend, and no network** —
safe to host on the open internet.

**How it works:** the app boots to an upload screen and stays empty until a user
drops/chooses a **CSV**. The file is parsed **entirely in the browser** — it is
never uploaded to a server or stored anywhere, and nothing is remembered between
sessions (upload every time). This keeps operational data off the internet even
when the app itself is publicly hosted.

Run it locally:

```bash
python3 -m http.server 5173 --directory demo
# open http://localhost:5173  -> drop a CSV to view the dashboard
```

Single-file build (one self-contained HTML you can host or double-click):

```bash
python3 demo/build_standalone.py demo/data.js demo/standalone.html
```

Deploy: copy `demo/index.html`, `demo/app.js`, `demo/styles.css` to any static
host (S3/CloudFront, Netlify, Vercel, GitHub Pages, or an internal server), or
just serve the single `standalone.html`.

Dev helpers (optional): `?csv=<relative-path>` preloads a same-origin CSV for
demos; `demo/embed_data.py`/`demo/make_sample.py` create fixtures. Any real data
files (`demo/data.csv`, `demo/data.js`, `demo/standalone.html`) are git-ignored.

## Pages

- **Overview** — headline KPIs, recoveries-over-time, top breakdown, record aging.
- **Trends** — monthly time series for every detected date column (with value overlay).
- **Breakdowns** — categorical distributions and numeric histograms.
- **Data Explorer** — searchable, sortable, paginated raw table with CSV export.
- **Data Quality** — inferred schema, completeness, and per-column summaries.

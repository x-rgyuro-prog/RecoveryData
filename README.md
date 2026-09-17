# RecoveryData — Fleet Response Upload Dashboard

A dependency-free, **browser-only** analytics dashboard for autonomous
fleet-response operations. You open the app, drop in a **CSV**, and it renders
KPIs, trends, breakdowns, a Day×Hour heatmap, a scatter plot, and more — tailored
to the Fleet Response dataset.

> **Privacy by design:** the app has no backend. Your CSV is read and processed
> **entirely in your browser**; it is never uploaded to a server or stored
> anywhere, and nothing persists between sessions (you upload each time). This
> lets the app itself be hosted on the open internet while your data stays local.

## Run it

It's a static site — just serve the `demo/` folder:

```bash
python3 demo/serve.py 5173     # sends no-cache headers
# or: python3 -m http.server 5173 --directory demo
```

Open http://localhost:5173 and drop a CSV.

## Deploy it

Copy these three files to any static host (S3/CloudFront, Netlify, Vercel,
GitHub Pages, or an internal server):

```
demo/index.html
demo/app.js
demo/styles.css
```

Or ship the single self-contained file (styles + code inlined, no data):

```bash
python3 demo/build_standalone.py demo/data.js demo/standalone.html
# host or double-click demo/standalone.html
```

### GitHub Pages (one-time setup)

A workflow at `.github/workflows/deploy-pages.yml` publishes `demo/` automatically.

1. Merge this to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: “GitHub Actions.”**
3. The workflow runs on every push to `main` (or trigger it manually under the
   **Actions** tab). The live URL appears in the workflow run and on the Pages
   settings page — typically `https://<owner>.github.io/RecoveryData/`.

Note: Pages on a **private** repo requires a paid plan; a public repo works on
the free tier (only the empty app is published — never any data).

### Other hosts

- **Netlify / Vercel:** drag-and-drop the `demo/` folder (or the single
  `standalone.html`) into their deploy UI — no build step, no config.
- **Any static host / internal server / S3+CloudFront:** upload the three files.

Recommended host settings: serve over **HTTPS**, and (optional hardening) set a
Content-Security-Policy header such as:

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'
```

## Pages & features

- **Overview** — KPIs (total dispatches, completion rate, median turnaround/response/on-scene, L0 false-positive rate, riders onboard, avg deadhead), dispatch volume trend, dispatch type, status, and Completion Rate by Group.
- **Response Performance** — response lifecycle stages, turnaround trend, distribution, turnaround by location/type, and a response-vs-work-time scatter.
- **Demand Patterns** — Day×Hour heatmap, time-of-day, day, location, autonomy milestone.
- **Event Analysis** — reason for event, L0 alert accuracy, resolution, crew, supervisor.
- **Dispatch Explorer** and **Data Quality**.

**Global filters** (header): time range (All / last 12 months / last 30 days /
custom from–to) and a **location** dropdown — both apply to every KPI and chart.
**Per-chart toggles:** view (bar/pie/donut/line), grouping (hour↔part-of-day,
day↔weekday/weekend, monthly↔weekly, all↔top-N), and metric (median↔mean).

## Data handling notes

- On upload, the app keeps real dispatch rows, drops empty columns, and treats
  `N/A`/`null`/`TBD` as empty so metrics are accurate.
- Expected key columns include `Date Created`, `Status`, `Dispatch Type`,
  `Reason for Event`, `ZR# (Milestone)`, `Location`, `Supervisor`, `Assignee`,
  the `24hr`/`Day` fields, and the pre-computed `*_min` timing columns
  (`turnaround_time_mins`, `on_scene_work_mins`, etc.).

## Repo layout

```
demo/
  index.html        upload app shell
  app.js            parsing, analytics, charts, interactivity
  styles.css        theme
  serve.py          static server with no-cache headers
  build_standalone.py   bundle into one self-contained HTML
  embed_data.py / make_sample.py / cdp_shot.py   dev/preview helpers
```

Real data files (`demo/data.csv`, `demo/data.js`, `demo/standalone.html`) are
git-ignored so operational data never lands in the repo.

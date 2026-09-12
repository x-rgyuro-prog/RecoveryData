import { NavLink, Route, Routes } from "react-router-dom";
import { DataProvider, useData } from "./DataContext";
import { Spinner, ErrorState } from "./components/ui";
import { timeAgo } from "./format";
import Overview from "./pages/Overview";
import Trends from "./pages/Trends";
import Breakdowns from "./pages/Breakdowns";
import Explorer from "./pages/Explorer";
import DataQuality from "./pages/DataQuality";

const NAV = [
  { to: "/", label: "Overview", icon: "◎", end: true },
  { to: "/trends", label: "Trends", icon: "📈" },
  { to: "/breakdowns", label: "Breakdowns", icon: "🧩" },
  { to: "/explorer", label: "Data Explorer", icon: "🔎" },
  { to: "/quality", label: "Data Quality", icon: "✓" },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">RD</div>
        <div>
          <div className="brand-name">RecoveryData</div>
          <div className="brand-sub">Live fleet recovery analytics</div>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        Data is pulled live from Google Sheets on every load — no stored copies.
      </div>
    </aside>
  );
}

function TopBar() {
  const { config, data, loading, refresh, gid, setGid, lastLoadedAt } = useData();
  return (
    <div className="toolbar">
      {config && config.tabs.length > 1 && (
        <select
          className="input"
          value={gid ?? config.tabs[0].gid}
          onChange={(e) => setGid(e.target.value)}
        >
          {config.tabs.map((t) => (
            <option key={t.gid} value={t.gid}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      <span className="badge-live">
        <span className="dot" /> Live
      </span>
      {lastLoadedAt && !loading && (
        <span className="muted" style={{ fontSize: 12 }}>
          Updated {timeAgo(new Date(lastLoadedAt).toISOString())}
        </span>
      )}
      {data && (
        <a className="btn" href={config?.sheetUrl} target="_blank" rel="noreferrer">
          Source sheet ↗
        </a>
      )}
      <button className="btn btn-primary" onClick={refresh} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

function Shell() {
  const { loading, error, data } = useData();
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <div>
            <h1 className="page-title">Vehicle Recovery Dashboard</h1>
            <div className="page-subtitle">
              A friendlier, always-current view of your recovery operation.
            </div>
          </div>
          <TopBar />
        </div>

        {loading && !data && <Spinner />}
        {error && !loading && <ErrorState error={error} />}
        {data && (
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/breakdowns" element={<Breakdowns />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/quality" element={<DataQuality />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

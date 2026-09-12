import { useEffect, useMemo, useState } from "react";
import { fetchRows } from "../api";
import { useData } from "../DataContext";
import { Card, Spinner, ErrorState, EmptyHint } from "../components/ui";
import { formatNumber } from "../format";
import type { RowsResponse } from "../types";

const PAGE_SIZE = 50;

export default function Explorer() {
  const { gid } = useData();
  const [rows, setRows] = useState<RowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<(Error & { hint?: string }) | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchRows(gid)
      .then((r) => active && setRows(r))
      .catch((e) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [gid]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    let out = rows.rows;
    if (q) {
      out = out.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(q)));
    }
    if (sortKey) {
      out = [...out].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        const an = Number(av.replace(/[$,%\s]/g, ""));
        const bn = Number(bv.replace(/[$,%\s]/g, ""));
        if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") {
          return (an - bn) * sortDir;
        }
        return av.localeCompare(bv) * sortDir;
      });
    }
    return out;
  }, [rows, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
    setPage(0);
  }

  function downloadCsv() {
    if (!rows) return;
    const header = rows.headers.join(",");
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const body = filtered
      .map((r) => rows.headers.map((h) => escape(r[h] ?? "")).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovery-data-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner label="Loading rows live…" />;
  if (error) return <ErrorState error={error} />;
  if (!rows || rows.rows.length === 0)
    return (
      <Card title="Data Explorer">
        <EmptyHint>No rows returned from the sheet.</EmptyHint>
      </Card>
    );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row-between">
        <input
          className="input"
          style={{ minWidth: 260 }}
          placeholder="Search all columns…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <div className="toolbar">
          <span className="muted" style={{ fontSize: 13 }}>
            {formatNumber(filtered.length)} of {formatNumber(rows.rows.length)} rows
          </span>
          <button className="btn" onClick={downloadCsv}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {rows.headers.map((h) => (
                <th key={h} onClick={() => toggleSort(h)}>
                  {h} {sortKey === h ? (sortDir === 1 ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i}>
                {rows.headers.map((h) => (
                  <td key={h}>{row[h]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-between">
        <button className="btn" disabled={current === 0} onClick={() => setPage(current - 1)}>
          ← Prev
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          Page {current + 1} of {pageCount}
        </span>
        <button
          className="btn"
          disabled={current >= pageCount - 1}
          onClick={() => setPage(current + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

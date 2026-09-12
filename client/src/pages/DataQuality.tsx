import { useData } from "../DataContext";
import { Card } from "../components/ui";
import { formatNumber } from "../format";
import type { FieldProfile } from "../types";

function typeColor(t: FieldProfile["type"]): string {
  switch (t) {
    case "date":
      return "#4f8cff";
    case "number":
    case "currency":
    case "percent":
      return "#22d3a6";
    case "category":
      return "#f6b73c";
    case "boolean":
      return "#a78bfa";
    default:
      return "#6b789a";
  }
}

function completeness(f: FieldProfile): number {
  const total = f.filled + f.missing;
  return total === 0 ? 0 : Math.round((f.filled / total) * 100);
}

export default function DataQuality() {
  const { data } = useData();
  if (!data) return null;
  const { profile } = data;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Card
        title="Detected Schema & Data Quality"
        subtitle={`${profile.fields.length} columns · ${formatNumber(profile.rowCount)} rows · types inferred live`}
      >
        <div className="table-wrap" style={{ maxHeight: "70vh" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Complete</th>
                <th>Filled</th>
                <th>Missing</th>
                <th>Distinct</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {profile.fields.map((f) => (
                <tr key={f.name}>
                  <td style={{ fontWeight: 600 }}>{f.name}</td>
                  <td>
                    <span className="pill" style={{ color: typeColor(f.type), borderColor: typeColor(f.type) }}>
                      {f.type}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 70,
                          height: 7,
                          borderRadius: 4,
                          background: "#26314f",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${completeness(f)}%`,
                            height: "100%",
                            background: completeness(f) > 80 ? "#22d3a6" : completeness(f) > 50 ? "#f6b73c" : "#ff6b8b",
                          }}
                        />
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {completeness(f)}%
                      </span>
                    </div>
                  </td>
                  <td>{formatNumber(f.filled)}</td>
                  <td>{formatNumber(f.missing)}</td>
                  <td>{formatNumber(f.distinct)}</td>
                  <td className="muted" style={{ maxWidth: 320, whiteSpace: "normal" }}>
                    {f.numeric &&
                      `min ${formatNumber(f.numeric.min)} · avg ${formatNumber(
                        Math.round(f.numeric.mean * 10) / 10,
                      )} · max ${formatNumber(f.numeric.max)}`}
                    {f.dateRange &&
                      `${new Date(f.dateRange.min).toLocaleDateString()} → ${new Date(
                        f.dateRange.max,
                      ).toLocaleDateString()}`}
                    {f.topValues &&
                      f.topValues
                        .slice(0, 3)
                        .map((t) => `${t.value} (${t.count})`)
                        .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

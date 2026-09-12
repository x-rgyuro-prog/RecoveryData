import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useData } from "../DataContext";
import { Card, EmptyHint } from "../components/ui";
import { formatCurrency, formatNumber } from "../format";
import { colorAt } from "../theme";
import type { Breakdown, Histogram } from "../types";

function BreakdownCard({ b }: { b: Breakdown }) {
  const usePie = b.items.length <= 6;
  const hasValue = b.items.some((i) => typeof i.value === "number" && i.value !== 0);
  return (
    <Card title={`${b.role}: ${b.field}`} subtitle={`${b.items.length} shown`}>
      <ResponsiveContainer width="100%" height={300}>
        {usePie ? (
          <PieChart>
            <Pie
              data={b.items}
              dataKey="count"
              nameKey="label"
              outerRadius={110}
              label={(e) => `${e.label} (${e.count})`}
            >
              {b.items.map((_, i) => (
                <Cell key={i} fill={colorAt(i)} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatNumber(v)} />
          </PieChart>
        ) : (
          <BarChart data={b.items} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#26314f" horizontal={false} />
            <XAxis type="number" stroke="#9aa7c2" fontSize={12} allowDecimals={false} />
            <YAxis type="category" dataKey="label" stroke="#9aa7c2" fontSize={11} width={130} />
            <Tooltip
              formatter={(v: number, name) => (name === "value" ? formatCurrency(v) : formatNumber(v))}
            />
            <Bar dataKey="count" name="Records" radius={[0, 6, 6, 0]}>
              {b.items.map((_, i) => (
                <Cell key={i} fill={colorAt(i)} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
      {hasValue && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Top by value: {b.items[0]?.label} ({formatCurrency(b.items[0]?.value ?? 0)})
        </div>
      )}
    </Card>
  );
}

function HistogramCard({ h }: { h: Histogram }) {
  return (
    <Card
      title={`Distribution: ${h.field}`}
      subtitle={`min ${formatNumber(h.stats.min)} · median ${formatNumber(
        Math.round(h.stats.median),
      )} · max ${formatNumber(h.stats.max)}`}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={h.bins}>
          <CartesianGrid strokeDasharray="3 3" stroke="#26314f" />
          <XAxis dataKey="label" stroke="#9aa7c2" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
          <YAxis stroke="#9aa7c2" fontSize={12} allowDecimals={false} />
          <Tooltip formatter={(v: number) => formatNumber(v)} />
          <Bar dataKey="count" name="Records" fill={colorAt(4)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default function Breakdowns() {
  const { data } = useData();
  if (!data) return null;
  const { breakdowns, histograms } = data.insights;

  if (breakdowns.length === 0 && histograms.length === 0) {
    return (
      <Card title="Breakdowns">
        <EmptyHint>No categorical or numeric columns were detected to break down.</EmptyHint>
      </Card>
    );
  }

  return (
    <div className="grid" style={{ gap: 22 }}>
      {breakdowns.length > 0 && (
        <div className="grid chart-grid">
          {breakdowns.map((b) => (
            <BreakdownCard key={b.field} b={b} />
          ))}
        </div>
      )}
      {histograms.length > 0 && (
        <>
          <h2 className="page-title" style={{ fontSize: 18, marginTop: 8 }}>
            Numeric Distributions
          </h2>
          <div className="grid chart-grid">
            {histograms.map((h) => (
              <HistogramCard key={h.field} h={h} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

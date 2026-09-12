import {
  Area,
  AreaChart,
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
import { formatKpi, formatNumber, formatPeriod } from "../format";
import { colorAt } from "../theme";
import type { Kpi } from "../types";

function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  return (
    <div className="card kpi">
      <div className="kpi-accent" style={{ background: colorAt(index) }} />
      <div className="kpi-label">{kpi.label}</div>
      <div className="kpi-value">{formatKpi(kpi)}</div>
      {kpi.hint && <div className="kpi-hint">{kpi.hint}</div>}
    </div>
  );
}

export default function Overview() {
  const { data } = useData();
  if (!data) return null;
  const { insights } = data;
  const primarySeries = insights.timeSeries[0];
  const topBreakdown = insights.breakdowns[0];
  const aging = insights.aging;

  return (
    <div className="grid" style={{ gap: 22 }}>
      <div className="grid kpi-grid">
        {insights.kpis.map((kpi, i) => (
          <KpiCard key={kpi.key} kpi={kpi} index={i} />
        ))}
      </div>

      <div className="grid chart-grid">
        {primarySeries && primarySeries.points.length > 0 && (
          <Card
            title={`Recoveries Over Time`}
            subtitle={`Monthly volume by "${primarySeries.field}"`}
            className="span-2"
          >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={primarySeries.points.map((p) => ({ ...p, period: formatPeriod(p.period) }))}>
                <defs>
                  <linearGradient id="ovGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorAt(0)} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={colorAt(0)} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#26314f" />
                <XAxis dataKey="period" stroke="#9aa7c2" fontSize={12} />
                <YAxis stroke="#9aa7c2" fontSize={12} allowDecimals={false} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Area type="monotone" dataKey="count" name="Records" stroke={colorAt(0)} fill="url(#ovGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}

        {topBreakdown && topBreakdown.items.length > 0 && (
          <Card title={`By ${topBreakdown.role}`} subtitle={`Field: "${topBreakdown.field}"`}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topBreakdown.items} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#26314f" horizontal={false} />
                <XAxis type="number" stroke="#9aa7c2" fontSize={12} allowDecimals={false} />
                <YAxis type="category" dataKey="label" stroke="#9aa7c2" fontSize={11} width={120} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="count" name="Records" radius={[0, 6, 6, 0]}>
                  {topBreakdown.items.map((_, i) => (
                    <Cell key={i} fill={colorAt(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {aging && aging.buckets.some((b) => b.count > 0) && (
          <Card title="Record Aging" subtitle={`Age since "${aging.field}"`}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={aging.buckets}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={(e) => `${e.label}: ${e.count}`}
                >
                  {aging.buckets.map((_, i) => (
                    <Cell key={i} fill={colorAt(i)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatNumber(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {insights.kpis.length === 1 && (
        <Card title="Getting oriented">
          <EmptyHint>
            The sheet loaded with {formatNumber(insights.rowCount)} rows. Richer KPIs appear
            automatically once recognizable columns (dates, status, make, location, fees) are
            detected. Explore the raw data in the Data Explorer tab.
          </EmptyHint>
        </Card>
      )}
    </div>
  );
}

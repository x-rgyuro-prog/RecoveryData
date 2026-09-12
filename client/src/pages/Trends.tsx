import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useData } from "../DataContext";
import { Card, EmptyHint } from "../components/ui";
import { formatCurrency, formatNumber, formatPeriod } from "../format";
import { colorAt } from "../theme";

export default function Trends() {
  const { data } = useData();
  if (!data) return null;
  const series = data.insights.timeSeries.filter((s) => s.points.length > 0);

  if (series.length === 0) {
    return (
      <Card title="Trends">
        <EmptyHint>No date columns were detected, so time trends aren’t available.</EmptyHint>
      </Card>
    );
  }

  return (
    <div className="grid chart-grid">
      {series.map((s, idx) => {
        const hasValue = s.points.some((p) => typeof p.value === "number" && p.value !== 0);
        const rows = s.points.map((p) => ({ ...p, period: formatPeriod(p.period) }));
        const total = s.points.reduce((a, p) => a + p.count, 0);
        return (
          <Card
            key={s.field}
            title={`Trend — ${s.field}`}
            subtitle={`${formatNumber(total)} records across ${s.points.length} months`}
          >
            <ResponsiveContainer width="100%" height={300}>
              {hasValue ? (
                <ComposedChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26314f" />
                  <XAxis dataKey="period" stroke="#9aa7c2" fontSize={12} />
                  <YAxis yAxisId="l" stroke="#9aa7c2" fontSize={12} allowDecimals={false} />
                  <YAxis yAxisId="r" orientation="right" stroke="#9aa7c2" fontSize={12} />
                  <Tooltip
                    formatter={(v: number, name) =>
                      name === "Value" ? formatCurrency(v) : formatNumber(v)
                    }
                  />
                  <Legend />
                  <Bar yAxisId="l" dataKey="count" name="Records" fill={colorAt(idx)} radius={[6, 6, 0, 0]} barSize={26} />
                  <Line yAxisId="r" type="monotone" dataKey="value" name="Value" stroke={colorAt(idx + 2)} strokeWidth={2} dot={false} />
                </ComposedChart>
              ) : (
                <AreaChart data={rows}>
                  <defs>
                    <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colorAt(idx)} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={colorAt(idx)} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26314f" />
                  <XAxis dataKey="period" stroke="#9aa7c2" fontSize={12} />
                  <YAxis stroke="#9aa7c2" fontSize={12} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Area type="monotone" dataKey="count" name="Records" stroke={colorAt(idx)} strokeWidth={2} fill={`url(#grad-${idx})`} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </Card>
        );
      })}
    </div>
  );
}

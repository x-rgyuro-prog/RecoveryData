import type { Kpi } from "./types";

const numberFmt = new Intl.NumberFormat("en-US");
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const currencyPreciseFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

export function formatCurrency(n: number, precise = false): string {
  return (precise ? currencyPreciseFmt : currencyFmt).format(n);
}

export function formatKpi(kpi: Kpi): string {
  if (typeof kpi.value === "string") return kpi.value;
  switch (kpi.format) {
    case "currency":
      return formatCurrency(kpi.value, kpi.value < 1000);
    case "percent":
      return `${kpi.value}%`;
    case "days":
      return `${formatNumber(kpi.value)} days`;
    case "number":
      return formatNumber(kpi.value);
    default:
      return String(kpi.value);
  }
}

export function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  if (!m) return period;
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

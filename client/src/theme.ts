export const CHART_COLORS = [
  "#4f8cff",
  "#22d3a6",
  "#f6b73c",
  "#ff6b8b",
  "#a78bfa",
  "#38bdf8",
  "#fb923c",
  "#4ade80",
  "#e879f9",
  "#facc15",
  "#2dd4bf",
  "#f472b6",
];

export function colorAt(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

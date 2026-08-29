import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SAGE = "#5f7468";
const MUTED = "#6b6860";
const GRID = "#d4cfc3";
const PAPER = "#faf8f4";

export function ProbChart({
  ticks,
  outcomeId,
  label,
}: {
  ticks: { at: string; probs: Record<string, number> }[];
  outcomeId: string;
  label: string;
}) {
  const data = ticks.map((t) => ({
    at: t.at,
    p: (t.probs[outcomeId] ?? 0) * 100,
  }));
  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough history for a chart yet.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="at"
            tickFormatter={(v) => format(new Date(v), "MMM d")}
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <ReferenceLine y={50} stroke={GRID} strokeDasharray="3 4" />
          <Tooltip
            contentStyle={{ background: PAPER, border: `1px solid ${GRID}`, borderRadius: 8 }}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, label]}
            labelFormatter={(v) => format(new Date(String(v)), "MMM d, h:mm a")}
          />
          <Area type="monotone" dataKey="p" stroke={SAGE} fill={SAGE} fillOpacity={0.18} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
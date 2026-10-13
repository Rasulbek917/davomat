"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ATTENDANCE_HEX, ATTENDANCE_LABEL, ATTENDANCE_STATUSES } from "@/lib/constants";
import type { DailyRatePoint, StatusCounts } from "@/lib/attendance/queries";

const AXIS = { fill: "var(--muted-foreground)", fontSize: 12 };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label ? <p className="mb-1 font-medium text-popover-foreground">{label}</p> : null}
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span>{entry.name}:</span>
          <span className="font-medium text-popover-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export function DailyRateChart({ data }: { data: DailyRatePoint[] }) {
  const chartData = data.filter((point) => point.recorded > 0).map((point) => ({ ...point, name: point.label }));
  if (chartData.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Bu davr uchun ma’lumot yo‘q.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} width={40} unit="%" />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="rate"
            name="Davomat"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#rateFill)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDistributionChart({ counts }: { counts: StatusCounts }) {
  const data = ATTENDANCE_STATUSES.map((status) => {
    const key = status.toLowerCase() as keyof StatusCounts;
    return { name: ATTENDANCE_LABEL[status], value: counts[key], color: ATTENDANCE_HEX[status] };
  }).filter((entry) => entry.value > 0);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Bu davr uchun ma’lumot yo‘q.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={88} paddingAngle={2}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke="var(--card)" strokeWidth={2} />
            ))}
          </Pie>
          <Legend verticalAlign="bottom" height={28} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClassRateChart({ data }: { data: { className: string; rate: number }[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Ma’lumot yo‘q.</p>;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="className" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} width={40} unit="%" />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="rate" name="Davomat" radius={[6, 6, 0, 0]} fill="var(--chart-1)" maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

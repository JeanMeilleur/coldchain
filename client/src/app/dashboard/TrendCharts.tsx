"use client";

import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { TrendPoint } from "@/state/api";
import { INK, hue, money, shortDate } from "./viz";

const Panel = ({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) => (
  <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5">
    <div className="mb-1 flex items-baseline justify-between gap-4">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{title}</h3>
    </div>
    {note && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    {children}
  </div>
);

const tooltipStyle = (dark: boolean) => ({
  contentStyle: {
    background: dark ? "#1a1a19" : "#fcfcfb",
    border: `1px solid ${dark ? "#383835" : "#e1e0d9"}`,
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: dark ? "#c3c2b7" : "#52514e", marginBottom: 4 },
});

/**
 * Revenue and goods received share one chart because they share a scale.
 *
 * Waste gets its OWN chart rather than a second y-axis on this one. Waste runs
 * around $300/day against $8,000/day of revenue -- on a shared axis it would be
 * a flat line pinned to zero, and a dual axis would let us silently choose two
 * scales that make any story we like. One axis per chart.
 */
export const RevenueTrend = ({ data, dark }: { data: TrendPoint[]; dark: boolean }) => (
  <Panel
    title="Revenue and purchasing"
    note="Daily sales against goods received. Gaps are real zero days, not missing data."
  >
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hue("blue", dark)} stopOpacity={0.22} />
            <stop offset="100%" stopColor={hue("blue", dark)} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={dark ? INK.grid.dark : INK.grid.light} vertical={false} />
        <XAxis
          dataKey="day" tickFormatter={shortDate} minTickGap={40}
          tick={{ fill: INK.muted, fontSize: 11 }}
          axisLine={{ stroke: dark ? INK.axis.dark : INK.axis.light }} tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => money(v, true)} width={54}
          tick={{ fill: INK.muted, fontSize: 11 }} axisLine={false} tickLine={false}
        />
        <Tooltip
          {...tooltipStyle(dark)}
          formatter={(v: number, n: string) => [money(v), n]}
          labelFormatter={(l) => shortDate(l as string)}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
        <Area
          type="monotone" dataKey="revenue" name="Revenue"
          stroke={hue("blue", dark)} strokeWidth={2} fill="url(#revFill)" dot={false}
        />
        <Line
          type="monotone" dataKey="received" name="Goods received"
          stroke={hue("orange", dark)} strokeWidth={2} dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  </Panel>
);

export const WasteTrend = ({ data, dark }: { data: TrendPoint[]; dark: boolean }) => (
  <Panel
    title="Waste cost per day"
    note="Charted separately from revenue: on a shared axis this would flatten to zero."
  >
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={dark ? INK.grid.dark : INK.grid.light} vertical={false} />
        <XAxis
          dataKey="day" tickFormatter={shortDate} minTickGap={40}
          tick={{ fill: INK.muted, fontSize: 11 }}
          axisLine={{ stroke: dark ? INK.axis.dark : INK.axis.light }} tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => money(v, true)} width={54}
          tick={{ fill: INK.muted, fontSize: 11 }} axisLine={false} tickLine={false}
        />
        <Tooltip
          {...tooltipStyle(dark)}
          formatter={(v: number) => [money(v), "Waste"]}
          labelFormatter={(l) => shortDate(l as string)}
        />
        <Line
          type="monotone" dataKey="waste" name="Waste"
          stroke="#d03b3b" strokeWidth={2} dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </Panel>
);

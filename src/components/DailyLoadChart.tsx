"use client"

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { DailyLoad } from "@/lib/capacity"

const dayLabel = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })

/** Stacked bars: scheduled hours (assigned + nobody assigned) per working day, with the team's capacity as a line. */
export function DailyLoadChart({ rows }: { rows: DailyLoad[] }) {
  const data = rows.map((r) => ({
    day: dayLabel(r.date),
    Assigned: r.assigned,
    "Nobody assigned": r.unassigned,
    Capacity: Math.round(r.capacity * 10) / 10,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} unit="h" allowDecimals={false} />
        <Tooltip formatter={(v) => `${v}h`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Assigned" stackId="d" fill="#0f172a" />
        <Bar dataKey="Nobody assigned" stackId="d" fill="#f59e0b" radius={[3, 3, 0, 0]} />
        <Line type="stepAfter" dataKey="Capacity" stroke="#10b981" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

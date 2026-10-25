"use client"

import { useEffect, useMemo, useState } from "react"
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ApiError, apiFetch } from "@/lib/api-client"
import { PROJECTS } from "@/lib/jira-types"
import type { SprintStat } from "@/lib/history-types"
import { cn } from "@/lib/utils"
import { Card, ErrorBox, fmtDate, PageHeader, ProjectTabs, Spinner, StatTile, type ProjectFilter } from "@/components/ui-kit"

const PROJECT_COLOR: Record<string, string> = { IGD: "#0ea5e9", ISR: "#8b5cf6", IC: "#f59e0b" }

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
const times = (r: number | null) => (r === null ? "—" : `${Math.round(r * 10) / 10}×`)

function accuracyTone(r: number | null) {
  if (r === null) return "text-slate-400"
  if (r > 1.5) return "text-red-600 font-semibold"
  if (r > 1.15) return "text-amber-700"
  return "text-emerald-700"
}

export default function HistoryPage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [result, setResult] = useState<{ sprints: SprintStat[] | null; error: ApiError | null }>({ sprints: null, error: null })

  // Loaded once for all projects (cached on the server for an hour); the tabs just filter.
  useEffect(() => {
    let cancelled = false
    apiFetch<{ sprints: SprintStat[] }>("/api/history")
      .then((d) => {
        if (!cancelled) setResult({ sprints: d.sprints, error: null })
      })
      .catch((err) => {
        if (!cancelled) setResult({ sprints: null, error: err instanceof ApiError ? err : new ApiError(String(err), 0) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sprints = useMemo(
    () => (result.sprints ?? []).filter((s) => project === "all" || s.project === project),
    [result.sprints, project]
  )

  // One chart row per sprint end date; the three boards run on the same cadence.
  const chart = useMemo(() => {
    const rows = new Map<string, Record<string, number | string | null>>()
    for (const s of sprints) {
      const key = s.end ?? s.completed ?? ""
      const row = rows.get(key) ?? { label: fmtDate(key) }
      row[`${s.project} completion`] = pct(s.done, s.committed)
      row[`${s.project} dev`] = s.devAccuracy
      row[`${s.project} qa`] = s.qaAccuracy
      rows.set(key, row)
    }
    return [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, r]) => r)
  }, [sprints])

  const shownProjects = PROJECTS.filter((p) => project === "all" || p === project)

  const latest = useMemo(() => {
    const totals = { committed: 0, done: 0, carried: 0, dev: [] as number[], qa: [] as number[], bounce: [] as number[] }
    for (const p of shownProjects) {
      const last = sprints.filter((s) => s.project === p).at(-1)
      if (!last) continue
      totals.committed += last.committed
      totals.done += last.done
      totals.carried += last.carriedOver
      if (last.devAccuracy !== null) totals.dev.push(last.devAccuracy)
      if (last.qaAccuracy !== null) totals.qa.push(last.qaAccuracy)
      totals.bounce.push(last.bounceRate)
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    return { ...totals, dev: avg(totals.dev), qa: avg(totals.qa), bounce: avg(totals.bounce) }
  }, [sprints, shownProjects])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sprint history"
        description="The last six closed sprints per project: what was committed, what finished in the sprint, and how long dev and QA really took against their planned dates."
      />

      <ProjectTabs value={project} onChange={setProject} />

      {result.error && <ErrorBox error={result.error} />}
      {!result.sprints && !result.error && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Reading past sprints and their status history from Jira… the first load can take 10–20 seconds.
        </div>
      )}

      {result.sprints && sprints.length === 0 && <Card className="p-10 text-center text-sm text-slate-500">No closed sprints found.</Card>}

      {result.sprints && sprints.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatTile label="Last sprint finished" value={`${pct(latest.done, latest.committed)}%`} foot={`${latest.done} of ${latest.committed} issues`} />
            <StatTile label="Carried over" value={latest.carried} foot="moved into the next sprint" tone={latest.carried ? "warn" : undefined} />
            <StatTile label="Dev vs plan" value={times(latest.dev)} foot="actual ÷ planned days, median" tone={latest.dev && latest.dev > 1.5 ? "alert" : undefined} />
            <StatTile label="QA vs plan" value={times(latest.qa)} foot="actual ÷ planned days, median" tone={latest.qa && latest.qa > 1.5 ? "alert" : undefined} />
            <StatTile label="Sent back by QA" value={latest.bounce === null ? "—" : `${Math.round(latest.bounce)}%`} foot="of the last sprint's issues" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Finished within the sprint</h2>
              <p className="mb-3 text-xs text-slate-500">Share of each sprint&apos;s issues done by the time it closed.</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chart} margin={{ left: -12, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {shownProjects.map((p) => (
                    <Line key={p} type="monotone" dataKey={`${p} completion`} name={p} stroke={PROJECT_COLOR[p]} strokeWidth={2} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Development: actual vs planned time</h2>
              <p className="mb-3 text-xs text-slate-500">
                1× = took exactly the planned dev dates; 2× = twice as long. Planned = back-end/front-end start to end dates in Jira.
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chart} margin={{ left: -12, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}×`} />
                  <Tooltip formatter={(v) => `${v}×`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={1} stroke="#10b981" strokeDasharray="4 4" />
                  {shownProjects.map((p) => (
                    <Line key={p} type="monotone" dataKey={`${p} dev`} name={p} stroke={PROJECT_COLOR[p]} strokeWidth={2} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Sprint</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Issues</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Finished</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Carried over</th>
                  <th className="px-3 py-2.5 text-right font-semibold" title="Not finished in the sprint and not moved to a later one: finished afterwards, dropped, or rejected">Left behind</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Bugs</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Hours planned → done</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Dev vs plan</th>
                  <th className="px-3 py-2.5 text-right font-semibold">QA vs plan</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Sent back</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...sprints].reverse().map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: PROJECT_COLOR[s.project] }} />
                        <span className="font-medium text-slate-900">{s.name}</span>
                      </span>
                      <span className="ml-4 text-xs text-slate-500">{fmtDate(s.start)} → {fmtDate(s.completed ?? s.end)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.committed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {s.done} <span className="text-xs text-slate-500">({pct(s.done, s.committed)}%)</span>
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", s.carriedOver && "text-amber-700")}>{s.carriedOver}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{s.notDone - s.carriedOver}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {s.bugs} <span className="text-xs text-slate-500">({pct(s.bugs, s.committed)}%)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.plannedHours}h → {s.doneHours}h</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", accuracyTone(s.devAccuracy))} title={`${s.accuracySample.dev} issues with planned and actual dev time`}>
                      {times(s.devAccuracy)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", accuracyTone(s.qaAccuracy))} title={`${s.accuracySample.qa} issues with planned and actual QA time`}>
                      {times(s.qaAccuracy)}
                      {s.accuracySample.qa > 0 && s.accuracySample.qa < 3 && <span className="ml-1 text-[10px] text-slate-400">few</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{s.bounceRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-slate-500">
            &quot;Finished&quot; uses the date a card reached Done. &quot;Dev vs plan&quot; and &quot;QA vs plan&quot; compare real time in each phase (from
            Jira status history, ignoring quick click-throughs) with the planned start and end dates, as a median across the sprint.
          </p>
        </>
      )}
    </div>
  )
}

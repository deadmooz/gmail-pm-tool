"use client"

import { useMemo, useState } from "react"
import { useFlow } from "@/hooks/useFlow"
import { useTeam } from "@/hooks/useTeam"
import { isBug, isDone, type IssueSummary } from "@/lib/jira-types"
import {
  FLOW_PHASES,
  flowGroup,
  forecastIssue,
  median,
  PHASE_LABEL,
  type FlowBaseline,
  type IssueFlow,
} from "@/lib/flow"
import { qaPerson } from "@/lib/capacity"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import { ForecastChip } from "@/components/ForecastChip"
import {
  Card,
  ErrorBox,
  fmtDate,
  PageHeader,
  ProjectTabs,
  RefreshButton,
  Segmented,
  Spinner,
  StatTile,
  StatusPill,
  TypeIcon,
  type ProjectFilter,
} from "@/components/ui-kit"

type Scope = "sprint" | "next"

const days = (n: number) => `${Math.round(n * 10) / 10}d`
const sinceDays = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : 0)

function typicalFor(issue: IssueSummary, baseline: FlowBaseline | null) {
  if (!baseline) return null
  const g = flowGroup(issue)
  return baseline.sample[g] >= 5 ? baseline.median[g] : baseline.median[g === "bug" ? "task" : "bug"]
}

export default function FlowPage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [scope, setScope] = useState<Scope>("sprint")
  const [openKey, setOpenKey] = useState<string | null>(null)
  const { issues, flows, baseline, error, loading, firstLoad, reload } = useFlow(project, scope)
  const team = useTeam()

  const open = useMemo(() => issues.filter((i) => !isDone(i)), [issues])

  // Cards waiting for or in QA right now, longest wait first.
  const qaQueue = useMemo(
    () =>
      open
        .filter((i) => flows[i.key]?.current === "waitQa" || flows[i.key]?.current === "qa")
        .map((i) => ({ issue: i, flow: flows[i.key], waited: sinceDays(flows[i.key].currentSince) }))
        .sort((a, b) => b.waited - a.waited),
    [open, flows]
  )

  // Cards that have sat in their current phase much longer than usual.
  const stuck = useMemo(
    () =>
      open
        .map((i) => {
          const f = flows[i.key]
          const typical = typicalFor(i, baseline)
          if (!f || !typical || !(FLOW_PHASES as readonly string[]).includes(f.current)) return null
          const t = typical[f.current as (typeof FLOW_PHASES)[number]]
          const spent = sinceDays(f.currentSince)
          return t > 0 && spent > t * 1.5 && spent - t >= 1 ? { issue: i, flow: f, spent, typical: t } : null
        })
        .filter((x): x is { issue: IssueSummary; flow: IssueFlow; spent: number; typical: number } => !!x)
        .sort((a, b) => b.spent / b.typical - a.spent / a.typical),
    [open, flows, baseline]
  )

  const bounced = useMemo(() => issues.filter((i) => (flows[i.key]?.bounces ?? 0) > 0), [issues, flows])

  const review = useMemo(() => {
    const tasks = issues.filter((i) => !isBug(i))
    const bucket = (v: string | null) => {
      const s = v?.toLowerCase()
      return s === "done" || s === "yes" ? "done" : s === "not required" ? "na" : "missing"
    }
    const fields: [string, (i: IssueSummary) => string | null][] = [
      ["Test case review", (i) => i.delivery.qaReview],
      ["Reviewed with PM", (i) => i.delivery.qaReviewPm],
      ["Reviewed with Dev", (i) => i.delivery.qaReviewDev],
    ]
    return {
      total: tasks.length,
      rows: fields.map(([label, get]) => {
        const counts = { done: 0, na: 0, missing: 0 }
        tasks.forEach((t) => counts[bucket(get(t))]++)
        return { label, ...counts }
      }),
    }
  }, [issues])

  // Actual days per person in their phase, for cards that have been through it.
  const people = useMemo(() => {
    if (!team.team) return []
    const map = new Map<string, { name: string; role: string; days: number[]; cards: number }>()
    const add = (id: string, name: string, role: string, d: number) => {
      const e = map.get(`${id}|${role}`) ?? { name, role, days: [], cards: 0 }
      e.cards++
      if (d > 0.01) e.days.push(d)
      map.set(`${id}|${role}`, e)
    }
    for (const i of issues) {
      const f = flows[i.key]
      if (!f) continue
      if (i.delivery.beDev) add(i.delivery.beDev.id, i.delivery.beDev.name, "Back-end", f.phaseDays.dev)
      if (i.delivery.feDev) add(i.delivery.feDev.id, i.delivery.feDev.name, "Front-end", f.phaseDays.dev)
      const qa = qaPerson(i, team.team)
      if (qa) add(qa.id, qa.name, "QA", f.phaseDays.qa)
    }
    return [...map.values()].filter((p) => p.days.length).sort((a, b) => a.role.localeCompare(b.role) || median(b.days) - median(a.days))
  }, [issues, flows, team.team])

  const t = baseline?.median.task
  const historyMissing = !firstLoad && issues.length > 0 && Object.keys(flows).length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flow & QA"
        description="How long work really takes in each phase, from Jira's status history, and where cards are waiting."
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProjectTabs value={project} onChange={setProject} />
        <Segmented<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "sprint", label: "Current sprint" },
            { value: "next", label: "Next sprint" },
          ]}
        />
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {!error && firstLoad && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Reading status history from Jira… this can take a few seconds.
        </div>
      )}
      {historyMissing && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">This Jira doesn&apos;t provide status history in bulk, so flow numbers aren&apos;t available.</p>
      )}

      {!error && !firstLoad && (
        <>
          {baseline && t && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatTile label="Development" value={days(t.dev)} foot="typical, tasks" />
                <StatTile label="Waiting for QA" value={days(t.waitQa)} foot="typical, tasks" tone={t.waitQa > t.qa * 2 ? "warn" : undefined} />
                <StatTile label="QA" value={days(t.qa)} foot="typical, incl. code review" />
                <StatTile label="UAT & release" value={days(t.release)} foot="typical, tasks" />
                <StatTile label="Dev → done" value={days(baseline.cycleDays.task)} foot="typical, tasks" />
                <StatTile label="Sent back by QA" value={`${baseline.bounceRate.task}%`} foot="of finished tasks" />
              </div>

              <Card className="overflow-x-auto">
                <div className="border-b px-5 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">Typical days in each phase</h2>
                  <p className="text-xs text-slate-500">Medians from issues finished in the last 90 days. These drive the deployment forecast.</p>
                </div>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">Type</th>
                      {FLOW_PHASES.map((p) => (
                        <th key={p} className="px-3 py-2.5 text-right font-semibold">{PHASE_LABEL[p]}</th>
                      ))}
                      <th className="px-3 py-2.5 text-right font-semibold">Dev → done</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Based on</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(["task", "bug"] as const).map((g) => (
                      <tr key={g}>
                        <td className="px-5 py-2.5 font-medium">{g === "task" ? "Tasks" : "Bugs"}</td>
                        {FLOW_PHASES.map((p) => (
                          <td key={p} className="px-3 py-2.5 text-right tabular-nums">{days(baseline.median[g][p])}</td>
                        ))}
                        <td className="px-3 py-2.5 text-right tabular-nums">{days(baseline.cycleDays[g])}</td>
                        <td className={cn("px-5 py-2.5 text-right text-xs", baseline.sample[g] < 5 ? "text-amber-700" : "text-slate-500")}>
                          {baseline.sample[g]} issues{baseline.sample[g] < 5 && " (too few, using the other type)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">QA queue right now ({qaQueue.length})</h2>
              <p className="mb-2 text-xs text-slate-500">
                Cards waiting for QA or in QA, longest first.
                {t && ` Typical wait is ${days(t.waitQa)}.`}
              </p>
              {qaQueue.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Nothing waiting for QA.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {qaQueue.map(({ issue, flow, waited }) => {
                    const qa = team.team ? qaPerson(issue, team.team) : null
                    const long = t ? waited > (flow.current === "waitQa" ? t.waitQa : t.qa) : false
                    return (
                      <FlowRow key={issue.key} issue={issue} onOpen={() => setOpenKey(issue.key)}>
                        <span className={cn("w-24 text-right text-xs font-semibold tabular-nums", long ? "text-red-600" : "text-slate-700")}>
                          {flow.current === "waitQa" ? "waiting" : "in QA"} {days(waited)}
                        </span>
                        <span className="w-32 truncate text-xs text-slate-500">{qa?.name ?? "no QA person"}</span>
                        <ForecastChip forecast={forecastIssue(issue, flow, baseline)} />
                      </FlowRow>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Stuck longer than usual ({stuck.length})</h2>
              <p className="mb-2 text-xs text-slate-500">In their current phase for more than 1.5× the typical time.</p>
              {stuck.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Nothing unusually slow.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {stuck.map(({ issue, flow, spent, typical }) => (
                    <FlowRow key={issue.key} issue={issue} onOpen={() => setOpenKey(issue.key)}>
                      <span className="w-28 text-right text-xs text-slate-600">{PHASE_LABEL[flow.current]}</span>
                      <span className="w-32 text-right text-xs font-semibold tabular-nums text-red-600">
                        {days(spent)} <span className="font-normal text-slate-400">vs {days(typical)}</span>
                      </span>
                    </FlowRow>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Sent back from QA to development ({bounced.length})</h2>
              <p className="mb-2 text-xs text-slate-500">Cards in this sprint that moved from testing back to development at least once.</p>
              {bounced.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No cards were sent back.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {bounced.map((issue) => (
                    <FlowRow key={issue.key} issue={issue} onOpen={() => setOpenKey(issue.key)}>
                      <span className="text-xs font-semibold text-amber-700">
                        {flows[issue.key].bounces}× back to dev
                      </span>
                    </FlowRow>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">QA test case reviews</h2>
              <p className="mb-3 text-xs text-slate-500">Across the {review.total} non-bug cards in this sprint, from Jira&apos;s QA test case review fields.</p>
              <div className="space-y-3">
                {review.rows.map((r) => {
                  const pct = (n: number) => (review.total ? (n / review.total) * 100 : 0)
                  return (
                    <div key={r.label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-slate-700">{r.label}</span>
                        <span className="text-slate-500">
                          {r.done} done · {r.na} not required · {r.missing} not filled in
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="bg-emerald-500" style={{ width: `${pct(r.done)}%` }} />
                        <div className="bg-slate-300" style={{ width: `${pct(r.na)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {people.length > 0 && (
            <Card className="overflow-x-auto">
              <div className="border-b px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Actual time by person</h2>
                <p className="text-xs text-slate-500">
                  Median days their cards spent in development (developers) or QA (QA people) so far, against the typical time for
                  tasks. Long times can mean big cards, waiting, or too much work at once.
                </p>
              </div>
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Person</th>
                    <th className="px-3 py-2.5 font-semibold">Role</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Cards</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Median days</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Typical</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {people.map((p) => {
                    const m = median(p.days)
                    const typical = p.role === "QA" ? t?.qa ?? 0 : t?.dev ?? 0
                    return (
                      <tr key={`${p.name}-${p.role}`}>
                        <td className="px-5 py-2.5 font-medium text-slate-900">{p.name}</td>
                        <td className="px-3 py-2.5 text-slate-600">{p.role}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.cards}</td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", typical && m > typical * 1.5 ? "font-semibold text-red-600" : "")}>{days(m)}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">{days(typical)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} team={team.team} onTeamChanged={team.reload} />
    </div>
  )
}

function FlowRow({ issue, onOpen, children }: { issue: IssueSummary; onOpen: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left hover:bg-slate-50">
        <TypeIcon type={issue.type} />
        <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{issue.key}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-900">{issue.summary}</span>
          <span className="text-[11px] text-slate-500">
            Deploy {fmtDate(issue.delivery.deployment)}
            {issue.productOwner && ` · PO ${issue.productOwner.name}`}
          </span>
        </span>
        {children}
        <StatusPill status={issue.status} category={issue.statusCategory} />
      </button>
    </li>
  )
}

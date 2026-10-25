"use client"

import { useMemo, useState } from "react"
import { useFlow } from "@/hooks/useFlow"
import { useTeam } from "@/hooks/useTeam"
import {
  addDays,
  daysOverdue,
  deadline,
  isDone,
  qaAfterDeployment,
  releaseSlip,
  todayIso,
  type IssueSummary,
} from "@/lib/jira-types"
import { qaPerson } from "@/lib/capacity"
import { forecastIssue, type Forecast } from "@/lib/flow"
import type { TeamData } from "@/lib/team-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import { ForecastChip } from "@/components/ForecastChip"
import {
  Card,
  ErrorBox,
  fmtDate,
  matchesPerson,
  PageHeader,
  peopleOf,
  PersonSelect,
  ProjectTabs,
  RefreshButton,
  Segmented,
  Spinner,
  StatTile,
  StatusPill,
  TypeIcon,
  type ProjectFilter,
} from "@/components/ui-kit"

type Range = "upcoming" | "past"

function weekday(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

function flagsFor(issue: IssueSummary, today: string): { text: string; tone: "red" | "amber" }[] {
  const flags: { text: string; tone: "red" | "amber" }[] = []
  const late = daysOverdue(issue, today)
  if (late !== null && late > 0) flags.push({ text: `${late}d past deployment, not done`, tone: "red" })
  if (!isDone(issue) && qaAfterDeployment(issue)) flags.push({ text: `QA ends ${fmtDate(issue.delivery.qaEnd)}`, tone: "red" })
  if (!isDone(issue) && !issue.delivery.qaStart && !issue.delivery.qaEnd) flags.push({ text: "no QA dates", tone: "amber" })
  const slip = releaseSlip(issue)
  if (slip) flags.push({ text: `release moved ${slip.days > 0 ? "+" : ""}${slip.days}d`, tone: "amber" })
  return flags
}

export default function DeploymentsPage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [range, setRange] = useState<Range>("upcoming")
  const [owner, setOwner] = useState("")
  const [openKey, setOpenKey] = useState<string | null>(null)
  const { issues, flows, baseline, error, loading, firstLoad, reload } = useFlow(project, "deploy")
  const team = useTeam()
  const today = todayIso()

  const owners = useMemo(() => peopleOf(issues, (i) => i.productOwner), [issues])
  const scoped = useMemo(() => issues.filter((i) => matchesPerson(i.productOwner, owner)), [issues, owner])
  const forecasts = useMemo(() => {
    const out: Record<string, Forecast> = {}
    issues.forEach((i) => (out[i.key] = forecastIssue(i, flows[i.key], baseline, today)))
    return out
  }, [issues, flows, baseline, today])

  const stats = useMemo(() => {
    const dep = (i: IssueSummary) => i.delivery.deployment
    const inRange = (i: IssueSummary, from: string, to: string) => !!dep(i) && dep(i)! >= from && dep(i)! <= to
    return {
      today: scoped.filter((i) => dep(i) === today).length,
      thisWeek: scoped.filter((i) => inRange(i, today, addDays(today, 6))).length,
      nextWeek: scoped.filter((i) => inRange(i, addDays(today, 7), addDays(today, 13))).length,
      late: scoped.filter((i) => (daysOverdue(i, today) ?? 0) > 0).length,
      qaLate: scoped.filter((i) => !isDone(i) && qaAfterDeployment(i)).length,
      noDate: scoped.filter((i) => !dep(i) && !isDone(i) && i.sprint?.state === "active").length,
      atRisk: scoped.filter((i) => forecasts[i.key]?.status === "at-risk").length,
      willSlip: scoped.filter((i) => forecasts[i.key]?.status === "will-slip").length,
    }
  }, [scoped, today, forecasts])

  // Not late yet, but on typical timings they won't make their deployment date.
  const risky = useMemo(
    () =>
      scoped
        .filter((i) => ["at-risk", "will-slip"].includes(forecasts[i.key]?.status))
        .sort((a, b) => (forecasts[b.key].slipDays ?? 0) - (forecasts[a.key].slipDays ?? 0)),
    [scoped, forecasts]
  )

  const byDate = useMemo(() => {
    const [from, to] = range === "upcoming" ? [today, addDays(today, 42)] : [addDays(today, -14), addDays(today, -1)]
    const map = new Map<string, IssueSummary[]>()
    scoped
      .filter((i) => i.delivery.deployment && i.delivery.deployment >= from && i.delivery.deployment <= to)
      .forEach((i) => {
        const d = i.delivery.deployment!
        map.set(d, [...(map.get(d) ?? []), i])
      })
    const dates = [...map.keys()].sort()
    if (range === "past") dates.reverse()
    return dates.map((d) => ({ date: d, issues: map.get(d)! }))
  }, [scoped, range, today])

  const late = useMemo(
    () => scoped.filter((i) => (daysOverdue(i, today) ?? 0) > 0).sort((a, b) => (deadline(a) ?? "").localeCompare(deadline(b) ?? "")),
    [scoped, today]
  )
  const noDate = useMemo(() => scoped.filter((i) => !i.delivery.deployment && !isDone(i) && i.sprint?.state === "active"), [scoped])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deployments"
        description="What ships when, by Deployment Date, and what's at risk of missing it."
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProjectTabs value={project} onChange={setProject} />
        <PersonSelect label="Product Owner" emptyLabel="No Product Owner" people={owners} value={owner} onChange={setOwner} className="w-56" />
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {!error && firstLoad && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading from Jira…
        </div>
      )}

      {!error && !firstLoad && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Deploying today" value={stats.today} foot={fmtDate(today)} />
            <StatTile label="This week" value={stats.thisWeek} foot="today + 6 days" />
            <StatTile label="Next week" value={stats.nextWeek} foot="7–13 days out" />
            <StatTile label="Past deployment" value={stats.late} foot="date passed, not done" tone={stats.late ? "alert" : undefined} />
            <StatTile label="QA after deploy" value={stats.qaLate} foot="QA ends after deployment" tone={stats.qaLate ? "alert" : undefined} />
            <StatTile label="No deployment date" value={stats.noDate} foot="in current sprint, not done" tone={stats.noDate ? "warn" : undefined} />
            <StatTile label="Forecast: will slip" value={stats.willSlip} foot="likely done 3+ days after deployment" tone={stats.willSlip ? "alert" : undefined} />
            <StatTile label="Forecast: at risk" value={stats.atRisk} foot="likely 1–2 days after deployment" tone={stats.atRisk ? "warn" : undefined} />
          </div>

          {risky.length > 0 && (
            <Card className="border-amber-200 p-5">
              <h2 className="text-sm font-semibold text-amber-800">Likely to miss their deployment date ({risky.length})</h2>
              <p className="mb-2 text-xs text-slate-500">
                Predicted from where each card is in its workflow and how long each remaining phase typically takes (last 90 days). See Flow &amp; QA for the typical times.
              </p>
              <ul className="divide-y divide-slate-100">
                {risky.map((i) => (
                  <DeployRow key={i.key} issue={i} team={team.team} today={today} forecast={forecasts[i.key]} onOpen={() => setOpenKey(i.key)} showDate />
                ))}
              </ul>
            </Card>
          )}

          {late.length > 0 && (
            <Card className="border-red-200 p-5">
              <h2 className="text-sm font-semibold text-red-700">Past their deployment date and not done ({late.length})</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {late.map((i) => (
                  <DeployRow key={i.key} issue={i} team={team.team} today={today} forecast={forecasts[i.key]} onOpen={() => setOpenKey(i.key)} showDate />
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Deployment calendar</h2>
              <Segmented<Range>
                value={range}
                onChange={setRange}
                options={[
                  { value: "upcoming", label: "Next 6 weeks" },
                  { value: "past", label: "Last 2 weeks" },
                ]}
              />
            </div>
            {byDate.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No deployments in this range.</p>
            ) : (
              <div className="space-y-5">
                {byDate.map(({ date, issues: list }) => {
                  const done = list.filter(isDone).length
                  return (
                    <div key={date}>
                      <div className="flex items-baseline gap-3 border-b pb-1.5">
                        <h3 className={cn("text-sm font-semibold", date === today ? "text-sky-700" : "text-slate-800")}>
                          {weekday(date)}
                          {date === today && " · today"}
                        </h3>
                        <span className="text-xs text-slate-500">
                          {list.length} card{list.length === 1 ? "" : "s"} · {done} done
                        </span>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {list.map((i) => (
                          <DeployRow key={i.key} issue={i} team={team.team} today={today} forecast={forecasts[i.key]} onOpen={() => setOpenKey(i.key)} />
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {noDate.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">In the current sprint without a deployment date ({noDate.length})</h2>
              <p className="mb-2 text-xs text-slate-500">These can&apos;t be planned or tracked until a Deployment Date is set in Jira.</p>
              <ul className="divide-y divide-slate-100">
                {noDate.map((i) => (
                  <DeployRow key={i.key} issue={i} team={team.team} today={today} forecast={forecasts[i.key]} onOpen={() => setOpenKey(i.key)} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} team={team.team} onTeamChanged={team.reload} />
    </div>
  )
}

function DeployRow({
  issue,
  team,
  today,
  forecast,
  onOpen,
  showDate,
}: {
  issue: IssueSummary
  team: TeamData | null
  today: string
  forecast?: Forecast
  onOpen: () => void
  showDate?: boolean
}) {
  const d = issue.delivery
  const qa = team ? qaPerson(issue, team) : null
  const people = [
    d.beDev && `BE ${d.beDev.name}`,
    d.feDev && `FE ${d.feDev.name}`,
    qa && `QA ${qa.name}`,
  ].filter(Boolean)
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left hover:bg-slate-50">
        <TypeIcon type={issue.type} />
        <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{issue.key}</span>
        {showDate && (
          <span className="w-16 shrink-0 text-xs font-medium text-red-600" title={d.deployment ? "Deployment date" : "Jira due date (no deployment date set)"}>
            {fmtDate(deadline(issue))}
            {!d.deployment && "*"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-900">{issue.summary}</span>
          <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
            {issue.productOwner && <span className="rounded bg-slate-100 px-1.5 text-slate-600">PO {issue.productOwner.name}</span>}
            {people.map((p) => (
              <span key={p as string} className="rounded bg-slate-100 px-1.5 text-slate-600">{p}</span>
            ))}
            {flagsFor(issue, today).map((f) => (
              <span
                key={f.text}
                className={cn("rounded px-1.5 font-medium", f.tone === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")}
              >
                {f.text}
              </span>
            ))}
          </span>
        </span>
        {forecast && forecast.status !== "late" && forecast.status !== "no-date" && <ForecastChip forecast={forecast} />}
        <StatusPill status={issue.status} category={issue.statusCategory} />
      </button>
    </li>
  )
}

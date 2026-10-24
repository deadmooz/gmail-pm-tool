"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useIssues } from "@/hooks/useIssues"
import { useTeam } from "@/hooks/useTeam"
import { isBug, isDone, qaAfterDeployment, type IssueSummary } from "@/lib/jira-types"
import { qaPerson } from "@/lib/capacity"
import type { TeamData } from "@/lib/team-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import {
  Card,
  ErrorBox,
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

type SprintChoice = "sprint" | "next"

interface Check {
  id: string
  label: string
  /** Only applies to tasks, not bugs. */
  tasksOnly?: boolean
  test: (i: IssueSummary, team: TeamData) => boolean
}

const yes = (v: string | null) => v?.toLowerCase() === "yes"

// Every number elsewhere in PM Board depends on these fields, so this page shows
// who needs to fill in what. Nothing here changes Jira.
const CHECKS: Check[] = [
  { id: "deploy", label: "No deployment date", test: (i) => !i.delivery.deployment },
  { id: "po", label: "No Product Owner", test: (i) => !i.productOwner },
  { id: "dev", label: "No developer", test: (i) => !i.delivery.beDev && !i.delivery.feDev },
  { id: "beEst", label: "Back-end estimate missing", test: (i) => !!i.delivery.beDev && i.delivery.beEstimate === null },
  { id: "beDates", label: "Back-end dates missing", test: (i) => !!i.delivery.beDev && (!i.delivery.beStart || !i.delivery.beEnd) },
  { id: "feDev", label: "Front-end hours but no FE developer", test: (i) => (i.delivery.feEstimate ?? 0) > 0 && !i.delivery.feDev },
  { id: "feEst", label: "Front-end estimate missing", test: (i) => !!i.delivery.feDev && i.delivery.feEstimate === null },
  { id: "feDates", label: "Front-end dates missing", test: (i) => !!i.delivery.feDev && (!i.delivery.feStart || !i.delivery.feEnd) },
  { id: "qaEst", label: "QA estimate missing", test: (i) => i.delivery.qaEstimate === null },
  { id: "qaDates", label: "QA dates missing", test: (i) => (i.delivery.qaEstimate ?? 1) > 0 && (!i.delivery.qaStart || !i.delivery.qaEnd) },
  { id: "qaAfter", label: "QA ends after deployment", test: (i) => qaAfterDeployment(i) },
  { id: "qaPerson", label: "No QA person", test: (i, t) => (i.delivery.qaEstimate ?? 0) > 0 && !qaPerson(i, t) },
  { id: "prd", label: "PRD sign-off missing", tasksOnly: true, test: (i) => !yes(i.delivery.prdSignoff) },
  { id: "spm", label: "SPM sign-off missing", tasksOnly: true, test: (i) => !yes(i.delivery.spmSignoff) },
  { id: "tf", label: "Tech feasibility missing", tasksOnly: true, test: (i) => !yes(i.delivery.techFeasibility) },
]

const hasQaTeam = (team: TeamData) => team.members.some((m) => m.role === "QA")

function gapsFor(issue: IssueSummary, team: TeamData): Check[] {
  // Until QA people are set up, every card would be "No QA person" - that's noise, not a data gap.
  const qaReady = hasQaTeam(team)
  return CHECKS.filter((c) => !(c.tasksOnly && isBug(issue)) && (c.id !== "qaPerson" || qaReady) && c.test(issue, team))
}

export default function ChecklistPage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [sprint, setSprint] = useState<SprintChoice>("sprint")
  const [only, setOnly] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const { issues, error, loading, firstLoad, reload } = useIssues(project, sprint)
  const team = useTeam()

  const rows = useMemo(() => {
    if (!team.team) return []
    return issues.filter((i) => !isDone(i)).map((issue) => ({ issue, gaps: gapsFor(issue, team.team!) }))
  }, [issues, team.team])

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    rows.forEach((r) => r.gaps.forEach((g) => c.set(g.id, (c.get(g.id) ?? 0) + 1)))
    return CHECKS.map((ch) => ({ ...ch, count: c.get(ch.id) ?? 0 })).filter((ch) => ch.count > 0).sort((a, b) => b.count - a.count)
  }, [rows])

  const groups = useMemo(() => {
    const withGaps = rows.filter((r) => r.gaps.length && (!only || r.gaps.some((g) => g.id === only)))
    const map = new Map<string, { name: string; rows: typeof withGaps }>()
    withGaps.forEach((r) => {
      const name = r.issue.productOwner?.name ?? "No Product Owner"
      const g = map.get(name) ?? { name, rows: [] }
      g.rows.push(r)
      map.set(name, g)
    })
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length)
  }, [rows, only])

  const complete = rows.filter((r) => !r.gaps.length).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data checklist"
        description="What's missing in Jira for cards that aren't done, grouped by Product Owner. Fix these in Jira and every view here gets more accurate."
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProjectTabs value={project} onChange={setProject} />
        <Segmented<SprintChoice>
          value={sprint}
          onChange={setSprint}
          options={[
            { value: "sprint", label: "Current sprint" },
            { value: "next", label: "Next sprint" },
          ]}
        />
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {!error && (firstLoad || !team.team) && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      )}

      {!error && !firstLoad && team.team && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Cards checked" value={rows.length} foot="not done yet" />
            <StatTile label="Complete" value={`${rows.length ? Math.round((complete / rows.length) * 100) : 100}%`} foot={`${complete} with nothing missing`} tone="good" />
            <StatTile label="Need attention" value={rows.length - complete} foot="at least one gap" tone={rows.length - complete ? "warn" : undefined} />
            <StatTile label="Biggest gap" value={counts[0]?.count ?? 0} foot={counts[0]?.label ?? "none"} />
          </div>

          {!hasQaTeam(team.team) && (
            <p className="rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-900">
              The &quot;No QA person&quot; check starts once QA people are added in{" "}
              <Link href="/team" className="font-semibold underline">Team setup</Link>.
            </p>
          )}

          {counts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Show only:</span>
              {counts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOnly(only === c.id ? null : c.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    only === c.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {c.label} · {c.count}
                </button>
              ))}
              {only && (
                <button type="button" onClick={() => setOnly(null)} className="text-xs text-slate-500 hover:text-slate-900">
                  Clear
                </button>
              )}
            </div>
          )}

          {groups.length === 0 ? (
            <Card className="p-10 text-center text-sm text-slate-500">Nothing missing. Every card has what planning needs.</Card>
          ) : (
            groups.map((g) => (
              <Card key={g.name} className="overflow-hidden">
                <div className="flex items-baseline justify-between border-b px-5 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">{g.name}</h2>
                  <span className="text-xs text-slate-500">{g.rows.length} card{g.rows.length === 1 ? "" : "s"} to fix</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.rows.map(({ issue, gaps }) => (
                    <li key={issue.key}>
                      <button
                        type="button"
                        onClick={() => setOpenKey(issue.key)}
                        className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 px-5 py-2.5 text-left hover:bg-slate-50"
                      >
                        <TypeIcon type={issue.type} />
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{issue.key}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-900">{issue.summary}</span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {gaps.map((gap) => (
                              <span
                                key={gap.id}
                                className={cn(
                                  "rounded px-1.5 text-[11px] font-medium",
                                  gap.id === only ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-800"
                                )}
                              >
                                {gap.label}
                              </span>
                            ))}
                          </span>
                        </span>
                        <StatusPill status={issue.status} category={issue.statusCategory} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))
          )}
        </>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} team={team.team} onTeamChanged={team.reload} />
    </div>
  )
}

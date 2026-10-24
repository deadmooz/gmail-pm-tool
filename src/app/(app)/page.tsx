"use client"

import { useMemo, useState } from "react"
import { useIssues } from "@/hooks/useIssues"
import { useTeam } from "@/hooks/useTeam"
import { daysOverdue, isBug, PROJECTS, urgencyScore, type IssueSummary } from "@/lib/jira-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import { PeopleChart, PriorityChart, StatusByProjectChart } from "@/components/DashboardCharts"
import {
  Avatar,
  Card,
  ErrorBox,
  matchesPerson,
  PageHeader,
  peopleOf,
  PersonSelect,
  PriorityIcon,
  ProjectTabs,
  RefreshButton,
  Segmented,
  Spinner,
  StatusPill,
  TypeIcon,
  type ProjectFilter,
} from "@/components/ui-kit"

type DashScope = "sprint" | "open"

const isOverdue = (i: IssueSummary) => (daysOverdue(i) ?? 0) > 0
const notDone = (i: IssueSummary) => i.statusCategory !== "done"
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

function Tile({ label, value, foot, tone }: { label: string; value: string | number; foot: string; tone?: "alert" | "warn" }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tabular-nums",
          tone === "alert" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-900"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{foot}</p>
    </Card>
  )
}

function reasons(issue: IssueSummary): string[] {
  const out: string[] = []
  const overdue = daysOverdue(issue)
  if (overdue !== null && overdue > 0) out.push(`${overdue}d past deployment`)
  else if (overdue !== null && overdue >= -3) out.push(overdue === 0 ? "deploys today" : `deploys in ${-overdue}d`)
  if (!issue.assignee) out.push("unassigned")
  return out
}

export default function DashboardPage() {
  const [scope, setScope] = useState<DashScope>("sprint")
  const [project, setProject] = useState<ProjectFilter>("all")
  const [owner, setOwner] = useState("")
  const { issues, error, loading, firstLoad, reload } = useIssues("all", scope)
  const team = useTeam()
  const [openKey, setOpenKey] = useState<string | null>(null)

  const inSprint = scope === "sprint"
  const owners = useMemo(() => peopleOf(issues, (i) => i.productOwner), [issues])

  // In "all open" mode, an issue moved to Done from the panel drops out until the next refresh.
  const scoped = useMemo(
    () =>
      issues.filter(
        (i) =>
          (inSprint || notDone(i)) &&
          (project === "all" || i.project === project) &&
          matchesPerson(i.productOwner, owner)
      ),
    [issues, inSprint, project, owner]
  )
  const remaining = useMemo(() => scoped.filter(notDone), [scoped])

  const stats = useMemo(
    () => ({
      total: scoped.length,
      done: scoped.filter((i) => !notDone(i)).length,
      inProgress: scoped.filter((i) => i.statusCategory === "inprogress").length,
      todo: scoped.filter((i) => i.statusCategory === "todo").length,
      bugs: remaining.filter(isBug).length,
      overdue: remaining.filter(isOverdue).length,
      unassigned: remaining.filter((i) => !i.assignee).length,
      perProject: PROJECTS.filter((p) => project === "all" || p === project).map((p) => {
        const all = scoped.filter((i) => i.project === p)
        const left = all.filter(notDone)
        return {
          project: p,
          total: all.length,
          done: all.length - left.length,
          inProgress: all.filter((i) => i.statusCategory === "inprogress").length,
          todo: all.filter((i) => i.statusCategory === "todo").length,
          bugs: left.filter(isBug).length,
          overdue: left.filter(isOverdue).length,
          unassigned: left.filter((i) => !i.assignee).length,
        }
      }),
    }),
    [scoped, remaining, project]
  )

  const attention = useMemo(
    () => [...remaining].sort((a, b) => urgencyScore(b) - urgencyScore(a)).slice(0, 10),
    [remaining]
  )

  const scopeNoun = inSprint ? "in the current sprint" : "not done yet"
  const ownerName = owner === "none" ? "No Product Owner" : owners.find((o) => o.id === owner)?.name

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          inSprint
            ? "The current sprint across IGD, ISR and IC."
            : "Everything not done yet across IGD, ISR and IC."
        }
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<DashScope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "sprint", label: "Current sprint" },
            { value: "open", label: "All open work" },
          ]}
        />
        <ProjectTabs value={project} onChange={setProject} />
        <PersonSelect
          label="Product Owner"
          emptyLabel="No Product Owner"
          people={owners}
          value={owner}
          onChange={setOwner}
          className="w-56"
        />
        {ownerName && (
          <button type="button" onClick={() => setOwner("")} className="text-sm text-slate-500 hover:text-slate-900">
            Clear
          </button>
        )}
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      {!error && firstLoad && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading from Jira…
        </div>
      )}

      {!error && !firstLoad && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {inSprint ? (
              <>
                <Tile label="In sprint" value={stats.total} foot={ownerName ? `owned by ${ownerName}` : "issues in active sprints"} />
                <Tile label="Done" value={`${pct(stats.done, stats.total)}%`} foot={`${stats.done} of ${stats.total} issues`} />
                <Tile label="In progress" value={stats.inProgress} foot={`${stats.todo} not started yet`} />
              </>
            ) : (
              <>
                <Tile label="Not done" value={stats.total} foot={ownerName ? `owned by ${ownerName}` : "all open issues"} />
                <Tile label="In progress" value={stats.inProgress} foot="being worked on" />
                <Tile label="To do" value={stats.todo} foot="not started yet" />
              </>
            )}
            <Tile label="Open bugs" value={stats.bugs} foot={`${scopeNoun}, not done`} tone={stats.bugs ? "alert" : undefined} />
            <Tile label="Overdue" value={stats.overdue} foot="not done, past deployment date" tone={stats.overdue ? "alert" : undefined} />
            <Tile label="Unassigned" value={stats.unassigned} foot="not done, no assignee" tone={stats.unassigned ? "warn" : undefined} />
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Project</th>
                  <th className="px-5 py-3 text-right font-semibold">{inSprint ? "In sprint" : "Not done"}</th>
                  <th className="px-5 py-3 text-right font-semibold">To do</th>
                  <th className="px-5 py-3 text-right font-semibold">In progress</th>
                  <th className="px-5 py-3 text-right font-semibold">Open bugs</th>
                  <th className="px-5 py-3 text-right font-semibold">Overdue</th>
                  <th className="px-5 py-3 text-right font-semibold">Unassigned</th>
                  {inSprint && <th className="px-5 py-3 font-semibold">Progress</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.perProject.map((p) => {
                  const done = pct(p.done, p.total)
                  return (
                    <tr key={p.project}>
                      <td className="px-5 py-3 font-semibold text-slate-900">{p.project}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{p.total}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{p.todo}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{p.inProgress}</td>
                      <td className={cn("px-5 py-3 text-right tabular-nums", p.bugs && "text-red-600")}>{p.bugs}</td>
                      <td className={cn("px-5 py-3 text-right tabular-nums", p.overdue && "font-semibold text-red-600")}>{p.overdue}</td>
                      <td className={cn("px-5 py-3 text-right tabular-nums", p.unassigned && "text-amber-600")}>{p.unassigned}</td>
                      {inSprint && (
                        <td className="px-5 py-3">
                          {p.total ? (
                            <div className="flex items-center gap-3">
                              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${done}%` }} />
                              </div>
                              <span className="text-xs text-slate-600 tabular-nums">
                                {done}% · {p.done}/{p.total}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No active sprint</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <StatusByProjectChart
              issues={scoped}
              caption={inSprint ? "Issues in each project's current sprint, by status" : "Open issues in each project, by status"}
            />
            <PriorityChart open={remaining} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PeopleChart
              open={remaining}
              pick={(i) => i.productOwner}
              title="Not done, by Product Owner"
              caption="Remaining issues per Product Owner (top 10)"
              emptyName="No Product Owner"
            />
            <PeopleChart
              open={remaining}
              pick={(i) => i.assignee}
              title="Not done, by assignee"
              caption="Who is carrying the remaining work (top 10)"
              emptyName="Unassigned"
            />
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900">Needs attention</h3>
            <p className="mb-3 text-xs text-slate-500">Top 10 remaining issues by priority, deployment date and ownership</p>
            {attention.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Nothing left to do here. Nice.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attention.map((issue) => (
                  <li key={issue.key}>
                    <button
                      type="button"
                      onClick={() => setOpenKey(issue.key)}
                      className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <TypeIcon type={issue.type} />
                      <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{issue.key}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-900">{issue.summary}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {issue.productOwner && (
                            <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">PO: {issue.productOwner.name}</span>
                          )}
                          {reasons(issue).map((r) => (
                            <span key={r} className="rounded bg-red-50 px-1.5 text-[11px] font-medium text-red-700">{r}</span>
                          ))}
                        </span>
                      </span>
                      <span className="hidden shrink-0 md:block">
                        <StatusPill status={issue.status} category={issue.statusCategory} />
                      </span>
                      <PriorityIcon priority={issue.priority} />
                      <Avatar person={issue.assignee} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} team={team.team} onTeamChanged={team.reload} />
    </div>
  )
}

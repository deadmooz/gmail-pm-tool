"use client"

import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, Info } from "lucide-react"
import { useIssues } from "@/hooks/useIssues"
import { useTeam } from "@/hooks/useTeam"
import { addDays, todayIso } from "@/lib/jira-types"
import {
  computeLoads,
  dailyRoleLoad,
  loadLevel,
  sprintWindow,
  utilization,
  type LoadLevel,
  type PersonLoad,
} from "@/lib/capacity"
import { ROLE_LABEL, ROLES, type Role } from "@/lib/team-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import { DailyLoadChart } from "@/components/DailyLoadChart"
import {
  Card,
  ErrorBox,
  fmtDate,
  inputClass,
  PageHeader,
  ProjectTabs,
  RefreshButton,
  Segmented,
  Spinner,
  StatusPill,
  TypeIcon,
  type ProjectFilter,
} from "@/components/ui-kit"

type SprintChoice = "sprint" | "next"
type Mode = "plan" | "remaining"

const LEVEL_STYLE: Record<LoadLevel, { bar: string; text: string; label: string }> = {
  free: { bar: "bg-slate-300", text: "text-slate-600", label: "Has room" },
  ok: { bar: "bg-emerald-500", text: "text-emerald-700", label: "OK" },
  busy: { bar: "bg-amber-500", text: "text-amber-700", label: "Nearly full" },
  over: { bar: "bg-red-500", text: "text-red-700", label: "Over capacity" },
}

// "QA" stays upper-case mid-sentence; the others read as lower-case words.
const roleNoun = (r: Role) => (r === "QA" ? "QA" : ROLE_LABEL[r].toLowerCase())

const h = (n: number) => `${Math.round(n)}h`

function pctText(e: Pick<PersonLoad, "load" | "capacity" | "buffer">) {
  const u = utilization(e)
  return Number.isFinite(u) ? `${Math.round(u * 100)}%` : "—"
}

export default function PeoplePage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [sprint, setSprint] = useState<SprintChoice>("sprint")
  const [modeChoice, setMode] = useState<Mode>("remaining")
  const [roleFilter, setRoleFilter] = useState<"" | Role>("")
  const [chartRole, setChartRole] = useState<Role>("QA")
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [openKey, setOpenKey] = useState<string | null>(null)
  const { issues, error, loading, firstLoad, reload } = useIssues(project, sprint)
  const team = useTeam()
  const today = todayIso()
  // "From today" only makes sense for the sprint that's running.
  const mode: Mode = sprint === "next" ? "plan" : modeChoice

  const period = useMemo(() => {
    const w = sprintWindow(issues, sprint === "sprint" ? "active" : "future")
    return w ?? { start: today, end: addDays(today, 13), names: [], sprintIds: new Set<number>() }
  }, [issues, sprint, today])

  const loads = useMemo(
    () => (team.team ? computeLoads(issues, team.team, { start: period.start, end: period.end, mode, today }) : []),
    [issues, team.team, period, mode, today]
  )

  const daily = useMemo(
    () => (team.team ? dailyRoleLoad(issues, team.team, chartRole, { start: period.start, end: period.end, mode, today }) : []),
    [issues, team.team, chartRole, period, mode, today]
  )
  const dailyOver = daily.filter((d) => d.assigned + d.unassigned > d.capacity + 0.05)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return loads.filter((l) => (!roleFilter || l.role === roleFilter) && (!q || l.person.name.toLowerCase().includes(q)))
  }, [loads, roleFilter, query])

  const totals = useMemo(() => {
    const out = ROLES.map((role) => {
      const people = loads.filter((l) => l.role === role)
      const sum = (f: (l: PersonLoad) => number) => people.reduce((s, l) => s + f(l), 0)
      const capacity = sum((l) => l.capacity)
      const buffer = sum((l) => l.buffer)
      const load = sum((l) => l.load)
      const unassigned = sum((l) => (l.unassigned ? l.load : 0))
      return {
        role,
        people: people.filter((l) => !l.unassigned).length,
        capacity,
        buffer,
        load,
        unassigned,
        free: capacity - buffer - load,
        over: people.filter((l) => !l.unassigned && loadLevel(l) === "over").length,
      }
    })
    return out
  }, [loads])

  const effectiveStart = mode === "remaining" && today > period.start ? today : period.start
  const noTeam = team.team && team.team.members.length === 0
  const noQa = team.team && !team.team.members.some((m) => m.role === "QA")

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="People & Capacity"
        description="Who is working on what, how many hours they have, and how much is already planned."
        actions={<RefreshButton loading={loading || team.loading} onClick={() => { reload(); team.reload() }} />}
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
        {sprint === "sprint" && (
          <Segmented<Mode>
            value={modeChoice}
            onChange={setMode}
            options={[
              { value: "remaining", label: "From today" },
              { value: "plan", label: "Whole sprint" },
            ]}
          />
        )}
      </div>

      <p className="text-sm text-slate-600">
        <span className="font-medium">{fmtDate(effectiveStart)} → {fmtDate(period.end)}</span>
        {period.names.length > 0 && <span className="text-slate-400"> · {period.names.join(", ")}</span>}
        {mode === "remaining" ? " · remaining work on cards that aren't done, including work that should already have happened." : " · everything planned in the sprint, done or not."}
      </p>

      {(noTeam || noQa) && (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {noTeam
              ? "No team is set up yet, so roles are guessed from Jira and everyone gets the default hours per day. "
              : "No QA people are set up yet, so all QA work shows as \u201cQA not assigned\u201d and the QA team has no capacity. "}
            Add people, roles, holidays and leave in <Link href="/team" className="font-semibold underline">Team setup</Link>.
          </p>
        </div>
      )}

      {(error || team.error) && <ErrorBox error={(error ?? team.error)!} onRetry={() => { reload(); team.reload() }} />}
      {!error && !team.error && (firstLoad || !team.team) && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      )}

      {!error && !firstLoad && team.team && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {totals.map((t) => {
              const level = loadLevel(t)
              return (
                <Card key={t.role} className="p-5">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{ROLE_LABEL[t.role]} team</h3>
                    <span className="text-xs text-slate-500">{t.people} people</span>
                  </div>
                  <p className={cn("mt-2 text-3xl font-bold tabular-nums", t.free < 0 ? "text-red-600" : "text-slate-900")}>
                    {t.free < 0 ? `−${h(-t.free)}` : h(t.free)}
                    <span className="ml-1 text-sm font-medium text-slate-500">{t.free < 0 ? "short" : "free"}</span>
                  </p>
                  <UtilBar load={t.load} capacity={t.capacity} buffer={t.buffer} level={level} />
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="text-slate-500">Capacity</dt><dd className="font-semibold tabular-nums">{h(t.capacity)}</dd></div>
                    <div><dt className="text-slate-500">Bug buffer</dt><dd className="font-semibold tabular-nums">{h(t.buffer)}</dd></div>
                    <div><dt className="text-slate-500">Planned</dt><dd className="font-semibold tabular-nums">{h(t.load)}</dd></div>
                  </dl>
                  {t.unassigned > 0 && (
                    <p className="mt-2 text-xs font-medium text-amber-700">{h(t.unassigned)} of planned work has nobody assigned</p>
                  )}
                  {t.over > 0 && <p className="mt-1 text-xs font-medium text-red-600">{t.over} over capacity</p>}
                </Card>
              )
            })}
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{ROLE_LABEL[chartRole]} bandwidth, day by day</h2>
                <p className="text-xs text-slate-500">
                  Hours of {roleNoun(chartRole)} work scheduled on each working day (from each card&apos;s dates in Jira) against
                  the hours the {roleNoun(chartRole)} team has that day.
                  {dailyOver.length > 0 && (
                    <span className="font-medium text-red-600">
                      {" "}Over capacity on {dailyOver.length} day{dailyOver.length === 1 ? "" : "s"}.
                    </span>
                  )}
                </p>
              </div>
              <Segmented<Role>
                value={chartRole}
                onChange={setChartRole}
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              />
            </div>
            {daily.length ? (
              <DailyLoadChart rows={daily} />
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">No working days in this period.</p>
            )}
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" className={cn(inputClass, "w-56")} />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | Role)} className={cn(inputClass, "w-40")} aria-label="Role">
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <span className="ml-auto text-xs text-slate-500">Estimates are Jira hours spread evenly over each card&apos;s dev or QA dates.</span>
          </div>

          {[...ROLES, null].map((role) => {
            const people = shown.filter((l) => l.role === role)
            if (!people.length) return null
            return (
              <Card key={role ?? "none"} className="overflow-x-auto">
                <div className="border-b px-5 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">{role ? ROLE_LABEL[role] : "No role"}</h2>
                </div>
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">Person</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Cards</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Capacity</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Leave</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Planned</th>
                      <th className="w-56 px-3 py-2.5 font-semibold">Load</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Free next 7 days</th>
                      <th className="px-5 py-2.5 font-semibold">Free from</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {people.map((l) => {
                      const open = expanded.has(l.person.id)
                      const level = loadLevel(l)
                      const cards = new Set(l.assignments.map((a) => a.issue.key)).size
                      return (
                        <Fragment key={l.person.id}>
                          <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggle(l.person.id)}>
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-2 font-medium text-slate-900">
                                {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                <span className={cn(l.unassigned && "italic text-amber-800")}>{l.person.name}</span>
                                {!l.member && !l.unassigned && (
                                  <span className="rounded bg-slate-100 px-1.5 text-[10px] font-normal text-slate-500">not in team setup</span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{cards}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{l.unassigned ? "—" : h(l.capacity)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-500">{l.leaveDays ? `${Math.round(l.leaveDays * 10) / 10}d` : "—"}</td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              {h(l.load)}
                              {(l.unscheduled > 0 || l.late > 0) && (
                                <span className="block text-[10px] text-amber-700">
                                  {l.late > 0 && `${h(l.late)} late`}
                                  {l.late > 0 && l.unscheduled > 0 && " · "}
                                  {l.unscheduled > 0 && `${h(l.unscheduled)} undated`}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {l.unassigned ? (
                                <span className="text-xs font-medium text-amber-700">Needs someone</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1"><UtilBar load={l.load} capacity={l.capacity} buffer={l.buffer} level={level} /></div>
                                  <span className={cn("w-12 text-right text-xs font-semibold tabular-nums", LEVEL_STYLE[level].text)}>{pctText(l)}</span>
                                </div>
                              )}
                            </td>
                            <td className={cn("px-3 py-3 text-right tabular-nums", !l.unassigned && l.nextWeekFree < 0 ? "text-red-600" : "text-slate-700")}>
                              {l.unassigned ? "—" : l.nextWeekFree < 0 ? `−${h(-l.nextWeekFree)}` : h(l.nextWeekFree)}
                            </td>
                            <td className="px-5 py-3 text-slate-700">{l.unassigned ? "—" : l.freeFrom ? fmtDate(l.freeFrom) : "Now"}</td>
                          </tr>
                          {open && (
                            <tr className="bg-slate-50/60">
                              <td colSpan={8} className="px-5 py-3">
                                {l.assignments.length === 0 ? (
                                  <p className="text-xs text-slate-500">Nothing planned in this period.</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <tbody className="divide-y divide-slate-100">
                                      {l.assignments
                                        .slice()
                                        .sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999"))
                                        .map((a) => (
                                          <tr key={`${a.issue.key}-${a.role}`} className="cursor-pointer hover:bg-white" onClick={() => setOpenKey(a.issue.key)}>
                                            <td className="py-1.5 pr-3">
                                              <span className="flex items-center gap-1.5">
                                                <TypeIcon type={a.issue.type} />
                                                <span className="font-medium text-slate-600">{a.issue.key}</span>
                                              </span>
                                            </td>
                                            <td className="max-w-md truncate py-1.5 pr-3 text-slate-800">{a.issue.summary}</td>
                                            <td className="py-1.5 pr-3 text-slate-500">{ROLE_LABEL[a.role]}</td>
                                            <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">
                                              {a.start || a.end ? `${fmtDate(a.start)} → ${fmtDate(a.end)}` : <span className="text-amber-700">no dates</span>}
                                            </td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums">{a.hours}h</td>
                                            <td className="py-1.5 pr-3 text-slate-500">Deploy {fmtDate(a.issue.delivery.deployment)}</td>
                                            <td className="py-1.5"><StatusPill status={a.issue.status} category={a.issue.statusCategory} /></td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            )
          })}
        </>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} team={team.team} onTeamChanged={team.reload} />
    </div>
  )
}

function UtilBar({ load, capacity, buffer, level }: { load: number; capacity: number; buffer: number; level: LoadLevel }) {
  const total = Math.max(capacity, load, 1)
  return (
    <div
      className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"
      title={`${Math.round(load)}h planned of ${Math.round(capacity - buffer)}h usable (${Math.round(buffer)}h held for bugs)`}
    >
      <div className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_STYLE[level].bar)} style={{ width: `${Math.min(100, (load / total) * 100)}%` }} />
      {buffer > 0 && (
        <div className="absolute inset-y-0 border-l-2 border-dashed border-slate-500" style={{ left: `${((capacity - buffer) / total) * 100}%` }} />
      )}
    </div>
  )
}

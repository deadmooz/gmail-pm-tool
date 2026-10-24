"use client"

import { useMemo, useState } from "react"
import { useIssues } from "@/hooks/useIssues"
import { useTeam } from "@/hooks/useTeam"
import { addDays, diffDays, PROJECTS, todayIso, type IssueSummary } from "@/lib/jira-types"
import { assignmentsFor, eachDay, makeCalendar, sprintWindow, type Assignment, type IsWorkingDay } from "@/lib/capacity"
import { ROLE_LABEL, type Role } from "@/lib/team-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import {
  Card,
  ErrorBox,
  fmtDate,
  inputClass,
  matchesPerson,
  PageHeader,
  peopleOf,
  PersonSelect,
  ProjectTabs,
  RefreshButton,
  Segmented,
  Spinner,
  TypeIcon,
  type ProjectFilter,
} from "@/components/ui-kit"

type SprintChoice = "sprint" | "next"
type GroupBy = "project" | "person"

const DAY_W = 30
const LABEL_W = 300

const ROLE_BAR: Record<Role, string> = {
  BE: "bg-sky-500",
  FE: "bg-violet-500",
  QA: "bg-amber-500",
}

const defaultCalendar: IsWorkingDay = (d) => new Date(d + "T00:00:00Z").getUTCDay() !== 0

interface Row {
  id: string
  issue: IssueSummary
  bars: { role: Role; start: string; end: string; hours: number; person: string }[]
}

interface Group {
  id: string
  title: string
  subtitle?: string
  rows: Row[]
}

function barsOf(assignments: Assignment[]): Row["bars"] {
  return assignments
    .filter((a) => a.start || a.end)
    .map((a) => {
      const s = (a.start ?? a.end)!
      const e = (a.end ?? a.start)!
      return { role: a.role, start: s <= e ? s : e, end: s <= e ? e : s, hours: a.hours, person: a.person.name }
    })
}

export default function TimelinePage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [sprint, setSprint] = useState<SprintChoice>("sprint")
  const [groupBy, setGroupBy] = useState<GroupBy>("project")
  const [owner, setOwner] = useState("")
  const [role, setRole] = useState<"" | Role>("")
  const [query, setQuery] = useState("")
  const [openKey, setOpenKey] = useState<string | null>(null)
  const { issues, error, loading, firstLoad, reload } = useIssues(project, sprint)
  const team = useTeam()
  const today = todayIso()

  const owners = useMemo(() => peopleOf(issues, (i) => i.productOwner), [issues])
  const isWorking = useMemo(() => (team.team ? makeCalendar(team.team) : defaultCalendar), [team.team])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return issues.filter(
      (i) =>
        matchesPerson(i.productOwner, owner) &&
        (!q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q))
    )
  }, [issues, owner, query])

  const groups = useMemo<Group[]>(() => {
    if (!team.team) return []
    const t = team.team
    if (groupBy === "project") {
      return PROJECTS.filter((p) => project === "all" || p === project)
        .map((p) => ({
          id: p,
          title: p,
          rows: filtered
            .filter((i) => i.project === p)
            .map((issue) => ({
              id: issue.key,
              issue,
              bars: barsOf(assignmentsFor(issue, t).filter((a) => !role || a.role === role)),
            }))
            .sort((a, b) => (a.issue.delivery.deployment ?? "9999").localeCompare(b.issue.delivery.deployment ?? "9999")),
        }))
        .filter((g) => g.rows.length)
    }
    const byPerson = new Map<string, Group & { roles: Set<Role> }>()
    for (const issue of filtered) {
      for (const a of assignmentsFor(issue, t)) {
        if (role && a.role !== role) continue
        const g = byPerson.get(a.person.id) ?? { id: a.person.id, title: a.person.name, rows: [], roles: new Set<Role>() }
        g.roles.add(a.role)
        g.rows.push({ id: `${issue.key}-${a.role}`, issue, bars: barsOf([a]) })
        byPerson.set(a.person.id, g)
      }
    }
    return [...byPerson.values()]
      .map((g) => ({
        ...g,
        subtitle: [...g.roles].map((r) => ROLE_LABEL[r]).join(" · "),
        rows: g.rows.sort((a, b) => (a.bars[0]?.start ?? "9999").localeCompare(b.bars[0]?.start ?? "9999")),
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [filtered, team.team, groupBy, project, role])

  // The visible date range: the sprint, stretched to cover every bar and deployment date shown.
  const days = useMemo(() => {
    const win = sprintWindow(issues, sprint === "sprint" ? "active" : "future")
    const dates: string[] = []
    groups.forEach((g) =>
      g.rows.forEach((r) => {
        r.bars.forEach((b) => dates.push(b.start, b.end))
        if (r.issue.delivery.deployment) dates.push(r.issue.delivery.deployment)
      })
    )
    if (win) dates.push(win.start, win.end)
    if (!dates.length) return []
    dates.sort()
    let start = dates[0]
    let end = dates[dates.length - 1]
    if (diffDays(start, end) > 90) {
      // Keep the chart readable when some card has a far-off date.
      start = win?.start ?? start
      end = addDays(start, 90)
    }
    return eachDay(addDays(start, -1), addDays(end, 1))
  }, [groups, issues, sprint])

  const holidays = useMemo(() => new Map((team.team?.holidays ?? []).map((h) => [h.date, h.name])), [team.team])
  const rangeStart = days[0]
  const x = (iso: string) => diffDays(rangeStart, iso) * DAY_W
  const width = days.length * DAY_W

  return (
    <div className="space-y-5">
      <PageHeader
        title="Timeline"
        description="Back-end, front-end and QA windows for every card, with its deployment date."
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
        <Segmented<GroupBy>
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "project", label: "By project" },
            { value: "person", label: "By person" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search key or summary…" className={cn(inputClass, "w-64")} />
        <PersonSelect label="Product Owner" emptyLabel="No Product Owner" people={owners} value={owner} onChange={setOwner} className="w-52" />
        <select value={role} onChange={(e) => setRole(e.target.value as "" | Role)} className={cn(inputClass, "w-40")} aria-label="Role">
          <option value="">All roles</option>
          <option value="BE">Back-end</option>
          <option value="FE">Front-end</option>
          <option value="QA">QA</option>
        </select>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-600">
          {(["BE", "FE", "QA"] as Role[]).map((r) => (
            <span key={r} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-5 rounded-sm", ROLE_BAR[r])} /> {ROLE_LABEL[r]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rotate-45 bg-emerald-600" /> Deployment
          </span>
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {!error && (firstLoad || !team.team) && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      )}

      {!error && !firstLoad && team.team && (
        groups.length === 0 || days.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">No cards with dates to show.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <div style={{ width: LABEL_W + width }}>
              {/* Day header */}
              <div className="sticky top-0 z-10 flex border-b bg-white">
                <div className="sticky left-0 z-20 shrink-0 border-r bg-white" style={{ width: LABEL_W }} />
                <div className="relative flex" style={{ width }}>
                  {days.map((d) => {
                    const off = !isWorking(d)
                    const date = new Date(d + "T00:00:00Z")
                    return (
                      <div
                        key={d}
                        title={holidays.get(d) ?? (off ? "Day off" : undefined)}
                        className={cn(
                          "flex shrink-0 flex-col items-center border-r border-slate-100 py-1 text-[10px]",
                          off && "bg-slate-100 text-slate-400",
                          d === today && "bg-sky-100 font-semibold text-sky-800"
                        )}
                        style={{ width: DAY_W }}
                      >
                        <span>{date.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}</span>
                        <span>{date.getUTCDate()}</span>
                        {date.getUTCDate() === 1 || d === days[0] ? (
                          <span className="font-semibold">{date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {groups.map((g) => (
                <div key={g.id}>
                  <div className="flex border-b bg-slate-50">
                    <div className="sticky left-0 z-10 shrink-0 border-r bg-slate-50 px-4 py-2" style={{ width: LABEL_W }}>
                      <span className="text-sm font-semibold text-slate-900">{g.title}</span>
                      {g.subtitle && <span className="ml-2 text-xs text-slate-500">{g.subtitle}</span>}
                      <span className="ml-2 text-xs text-slate-400">{g.rows.length}</span>
                    </div>
                    <div style={{ width }} />
                  </div>
                  {g.rows.map((r) => (
                    <TimelineRow
                      key={r.id}
                      row={r}
                      days={days}
                      isWorking={isWorking}
                      today={today}
                      x={x}
                      width={width}
                      onOpen={() => setOpenKey(r.issue.key)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} team={team.team} onTeamChanged={team.reload} />
    </div>
  )
}

function TimelineRow({
  row,
  days,
  isWorking,
  today,
  x,
  width,
  onOpen,
}: {
  row: Row
  days: string[]
  isWorking: IsWorkingDay
  today: string
  x: (iso: string) => number
  width: number
  onOpen: () => void
}) {
  const { issue, bars } = row
  const deploy = issue.delivery.deployment
  const height = Math.max(36, bars.length * 10 + 16)
  return (
    <div className="flex border-b border-slate-100 hover:bg-slate-50/60">
      <button
        type="button"
        onClick={onOpen}
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-white px-4 text-left hover:bg-slate-50"
        style={{ width: LABEL_W, height }}
      >
        <TypeIcon type={issue.type} />
        <span className="shrink-0 text-xs font-medium text-slate-500">{issue.key}</span>
        <span className="truncate text-xs text-slate-800" title={issue.summary}>{issue.summary}</span>
      </button>
      <div className="relative" style={{ width, height }}>
        {days.map((d, i) =>
          !isWorking(d) || d === today ? (
            <div
              key={d}
              className={cn("absolute inset-y-0", d === today ? "bg-sky-100/70" : "bg-slate-100/70")}
              style={{ left: i * DAY_W, width: DAY_W }}
            />
          ) : null
        )}
        {bars.map((b, i) => (
          <div
            key={`${b.role}-${i}`}
            title={`${ROLE_LABEL[b.role]} · ${b.person} · ${fmtDate(b.start)} → ${fmtDate(b.end)} · ${b.hours}h`}
            className={cn("absolute h-2 rounded-full", ROLE_BAR[b.role])}
            style={{ left: x(b.start) + 2, width: x(b.end) - x(b.start) + DAY_W - 4, top: 8 + i * 10 }}
          />
        ))}
        {deploy && x(deploy) >= 0 && x(deploy) < width && (
          <div
            title={`Deployment ${fmtDate(deploy)}`}
            className={cn("absolute h-3 w-3 rotate-45", issue.statusCategory === "done" ? "bg-emerald-600" : deploy < today ? "bg-red-600" : "bg-emerald-600")}
            style={{ left: x(deploy) + DAY_W / 2 - 6, top: height / 2 - 6 }}
          />
        )}
        {!bars.length && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">No dev or QA dates in Jira</span>
        )}
      </div>
    </div>
  )
}

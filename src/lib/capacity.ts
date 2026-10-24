// Capacity planning maths. Pure functions, used in the browser.
//
// Model: each card can carry up to three pieces of work (back-end, front-end,
// QA), each with a person, an hour estimate and a start/end date from Jira.
// The estimate is spread evenly over the working days in that window. A
// person's capacity is their hours per day on working days, minus holidays
// and leave. Load in any window is the work that falls inside it.

import {
  addDays,
  isBug,
  isDone,
  todayIso,
  type IssueSummary,
  type Person,
} from "@/lib/jira-types"
import { ROLE_LABEL, ROLES, type Role, type TeamData, type TeamMember } from "@/lib/team-types"

/* ----------------------------------------------------------------- calendar */

export type IsWorkingDay = (date: string) => boolean

/** Sundays and holidays are off; Saturdays are off when they are an "off" Saturday of the month. */
export function makeCalendar(team: TeamData): IsWorkingDay {
  const holidays = new Set(team.holidays.map((h) => h.date))
  const offSaturdays = new Set(team.settings.saturdaysOff)
  return (date) => {
    if (holidays.has(date)) return false
    const d = new Date(date + "T00:00:00Z")
    const weekday = d.getUTCDay()
    if (weekday === 0) return false
    if (weekday === 6) return !offSaturdays.has(Math.ceil(d.getUTCDate() / 7))
    return true
  }
}

/** Every date from start to end inclusive (capped at ~1 year to stay safe on bad data). */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = []
  for (let d = start; d <= end && days.length < 400; d = addDays(d, 1)) days.push(d)
  return days
}

/* -------------------------------------------------------------- assignments */

export interface Assignment {
  issue: IssueSummary
  role: Role
  person: Person
  hours: number
  start: string | null
  end: string | null
}

const UNASSIGNED_PREFIX = "__unassigned_"

/** Stand-in "person" for work that has dates or hours in Jira but nobody to do it yet. */
export function unassignedPerson(role: Role): Person {
  return { id: UNASSIGNED_PREFIX + role, name: `${ROLE_LABEL[role]} not assigned` }
}

export const isUnassigned = (p: Person) => p.id.startsWith(UNASSIGNED_PREFIX)

export function memberMap(team: TeamData): Map<string, TeamMember> {
  return new Map(team.members.map((m) => [m.accountId, m]))
}

/** Who tests a card: the PM Board assignment, else the Jira assignee if they are a QA team member. */
export function qaPerson(issue: IssueSummary, team: TeamData, members = memberMap(team)): Person | null {
  const assigned = team.qa[issue.key]
  if (assigned) return assigned
  const a = issue.assignee
  return a && members.get(a.id)?.role === "QA" ? a : null
}

/**
 * The back-end, front-end and QA work on a card. A phase with hours or dates
 * but nobody on it is returned with the "not assigned" stand-in, so the work
 * still shows on the timeline and still counts as demand on the team.
 */
export function assignmentsFor(issue: IssueSummary, team: TeamData, members = memberMap(team)): Assignment[] {
  const d = issue.delivery
  const out: Assignment[] = []
  const phase = (role: Role, person: Person | null, hours: number | null, start: string | null, end: string | null) => {
    const hasWork = (hours ?? 0) > 0 || !!start || !!end
    if (!person && !hasWork) return
    out.push({ issue, role, person: person ?? unassignedPerson(role), hours: hours ?? 0, start, end })
  }
  phase("BE", d.beDev, d.beEstimate, d.beStart, d.beEnd)
  phase("FE", d.feDev, d.feEstimate, d.feStart, d.feEnd)
  phase("QA", qaPerson(issue, team, members), d.qaEstimate, d.qaStart, d.qaEnd)
  return out
}

/** Hours per working day for an assignment, or null when it has no dates (unscheduled). */
export function spread(a: Assignment, isWorking: IsWorkingDay): Map<string, number> | null {
  const start = a.start ?? a.end
  const end = a.end ?? a.start
  if (!start || !end) return null
  const [from, to] = start <= end ? [start, end] : [end, start]
  const days = eachDay(from, to).filter(isWorking)
  const out = new Map<string, number>()
  if (!days.length) {
    out.set(from, a.hours)
  } else {
    days.forEach((day) => out.set(day, a.hours / days.length))
  }
  return out
}

// Statuses at or after testing: development work on these cards is finished.
const PAST_DEV_RE = /test|\bqa\b|uat|signoff|pre-?prod|production|go live|ready to go|live/i

/** True when a card has moved on to testing or release, so its dev hours are no longer owed. */
export function devFinished(issue: IssueSummary): boolean {
  return isDone(issue) || PAST_DEV_RE.test(issue.status)
}

/* ----------------------------------------------------------------- capacity */

export function hoursPerDay(personId: string, team: TeamData, members = memberMap(team)): number {
  return members.get(personId)?.hoursPerDay ?? team.settings.defaultHoursPerDay
}

function leaveHours(personId: string, day: string, perDay: number, team: TeamData): number {
  let off = 0
  for (const l of team.leaves) {
    if (l.accountId === personId && l.start <= day && day <= l.end) off += l.hours ?? perDay
  }
  return Math.min(off, perDay)
}

/** Working hours a person has between start and end inclusive, after holidays and leave. */
export function availableHours(
  personId: string,
  start: string,
  end: string,
  team: TeamData,
  isWorking: IsWorkingDay,
  members = memberMap(team)
): { hours: number; leaveDays: number } {
  const perDay = hoursPerDay(personId, team, members)
  let hours = 0
  let leaveDays = 0
  for (const day of eachDay(start, end)) {
    if (!isWorking(day)) continue
    const off = leaveHours(personId, day, perDay, team)
    hours += perDay - off
    leaveDays += off / perDay
  }
  return { hours, leaveDays }
}

/* -------------------------------------------------------------------- loads */

export interface PersonLoad {
  person: Person
  /** True for the "not assigned" stand-in: demand with no capacity behind it. */
  unassigned: boolean
  member: TeamMember | null
  /** Team role if set up, otherwise the role they have the most hours in. */
  role: Role | null
  assignments: Assignment[]
  capacity: number
  buffer: number
  /** Scheduled hours inside the window, plus unscheduled and (in "remaining" mode) late work. */
  load: number
  unscheduled: number
  late: number
  leaveDays: number
  /** Free hours in the next 7 days. */
  nextWeekFree: number
  /** First day after their last scheduled work, or null if nothing is scheduled. */
  freeFrom: string | null
}

export interface LoadOptions {
  start: string
  end: string
  /**
   * "plan": the whole window, every card (done included) - is the sprint over-committed?
   * "remaining": from today, only cards not done, and work that should already
   * have happened counts as still owed.
   */
  mode: "plan" | "remaining"
  today?: string
}

export function computeLoads(issues: IssueSummary[], team: TeamData, opts: LoadOptions): PersonLoad[] {
  const members = memberMap(team)
  const isWorking = makeCalendar(team)
  const today = opts.today ?? todayIso()
  const remaining = opts.mode === "remaining"
  const start = remaining && today > opts.start ? today : opts.start
  const end = opts.end
  const weekEnd = addDays(today, 6)

  const byPerson = new Map<string, PersonLoad>()
  const entry = (person: Person, role?: Role): PersonLoad => {
    let e = byPerson.get(person.id)
    if (!e) {
      const member = members.get(person.id) ?? null
      const unassigned = isUnassigned(person)
      e = {
        person: member ? { id: person.id, name: member.name } : person,
        unassigned,
        member,
        role: member?.role ?? (unassigned ? role ?? null : null),
        assignments: [],
        capacity: 0,
        buffer: 0,
        load: 0,
        unscheduled: 0,
        late: 0,
        leaveDays: 0,
        nextWeekFree: 0,
        freeFrom: null,
      }
      byPerson.set(person.id, e)
    }
    return e
  }

  team.members.forEach((m) => entry({ id: m.accountId, name: m.name }))
  const nextWeekScheduled = new Map<string, number>()
  const hoursByRole = new Map<string, Record<Role, number>>()

  for (const issue of issues) {
    if (remaining && isDone(issue)) continue
    for (const a of assignmentsFor(issue, team, members)) {
      // From today, a card that's already in testing no longer needs developer time.
      if (remaining && a.role !== "QA" && devFinished(issue)) continue
      const e = entry(a.person, a.role)
      const roleHours = hoursByRole.get(a.person.id) ?? { BE: 0, FE: 0, QA: 0 }
      roleHours[a.role] += a.hours
      hoursByRole.set(a.person.id, roleHours)

      const days = spread(a, isWorking)
      if (!days) {
        e.unscheduled += a.hours
        e.load += a.hours
        e.assignments.push(a)
        continue
      }
      const dayList = [...days.keys()].sort()
      const firstDay = dayList[0]
      const lastDay = dayList[dayList.length - 1]
      let inWindow = 0
      let before = 0
      for (const [day, h] of days) {
        if (day >= start && day <= end) inWindow += h
        else if (day < start) before += h
        if (day >= today && day <= weekEnd) {
          nextWeekScheduled.set(a.person.id, (nextWeekScheduled.get(a.person.id) ?? 0) + h)
        }
      }
      const overlaps = firstDay <= end && lastDay >= start
      const owedLate = remaining && before > 0
      if (overlaps || owedLate) {
        e.load += inWindow + (owedLate ? before : 0)
        if (owedLate) e.late += before
        e.assignments.push(a)
      }
      if (lastDay >= today && (!e.freeFrom || addDays(lastDay, 1) > e.freeFrom)) e.freeFrom = addDays(lastDay, 1)
    }
  }

  for (const e of byPerson.values()) {
    if (!e.role) {
      const rh = hoursByRole.get(e.person.id)
      e.role = rh ? ROLES.reduce((best, r) => (rh[r] > rh[best] ? r : best), "BE" as Role) : null
    }
    // Unassigned work has no one's time behind it.
    const avail = e.unassigned ? { hours: 0, leaveDays: 0 } : availableHours(e.person.id, start, end, team, isWorking, members)
    e.capacity = avail.hours
    e.leaveDays = avail.leaveDays
    e.buffer = e.role ? (e.capacity * team.settings.bugBuffer[e.role]) / 100 : 0
    const week = e.unassigned ? 0 : availableHours(e.person.id, today, weekEnd, team, isWorking, members).hours
    e.nextWeekFree = week - (nextWeekScheduled.get(e.person.id) ?? 0)
    e.load = Math.round(e.load * 10) / 10
  }

  return [...byPerson.values()]
    .filter((e) => e.member || e.assignments.length)
    .sort(
      (a, b) =>
        Number(a.unassigned) - Number(b.unassigned) ||
        utilization(b) - utilization(a) ||
        a.person.name.localeCompare(b.person.name)
    )
}

/* -------------------------------------------------------------- daily view */

export interface DailyLoad {
  date: string
  /** Hours of work scheduled that day for people on the team. */
  assigned: number
  /** Hours scheduled that day with nobody assigned. */
  unassigned: number
  /** Hours the team members in this role have that day, after leave. */
  capacity: number
}

/**
 * Day-by-day demand vs capacity for one role: how many hours of (say) QA are
 * scheduled each working day, against how many QA hours the team has.
 * Undated work can't be placed on a day and is left out here.
 */
export function dailyRoleLoad(issues: IssueSummary[], team: TeamData, role: Role, opts: LoadOptions): DailyLoad[] {
  const members = memberMap(team)
  const isWorking = makeCalendar(team)
  const today = opts.today ?? todayIso()
  const remaining = opts.mode === "remaining"
  const start = remaining && today > opts.start ? today : opts.start
  const days = eachDay(start, opts.end).filter(isWorking)
  const rows = new Map<string, DailyLoad>(days.map((d) => [d, { date: d, assigned: 0, unassigned: 0, capacity: 0 }]))

  for (const issue of issues) {
    if (remaining && isDone(issue)) continue
    for (const a of assignmentsFor(issue, team, members)) {
      if (a.role !== role) continue
      if (remaining && role !== "QA" && devFinished(issue)) continue
      const spreadDays = spread(a, isWorking)
      if (!spreadDays) continue
      for (const [day, h] of spreadDays) {
        const row = rows.get(day)
        if (!row) continue
        if (isUnassigned(a.person)) row.unassigned += h
        else row.assigned += h
      }
    }
  }

  const people = team.members.filter((m) => m.role === role)
  for (const row of rows.values()) {
    for (const m of people) {
      const perDay = m.hoursPerDay ?? team.settings.defaultHoursPerDay
      row.capacity += perDay - leaveHours(m.accountId, row.date, perDay, team)
    }
  }
  return [...rows.values()].map((r) => ({
    ...r,
    assigned: Math.round(r.assigned * 10) / 10,
    unassigned: Math.round(r.unassigned * 10) / 10,
  }))
}

/** Load as a share of usable capacity (capacity minus bug buffer). */
export function utilization(e: Pick<PersonLoad, "load" | "capacity" | "buffer">): number {
  const usable = e.capacity - e.buffer
  if (usable <= 0) return e.load > 0 ? Infinity : 0
  return e.load / usable
}

export type LoadLevel = "free" | "ok" | "busy" | "over"

export function loadLevel(e: Pick<PersonLoad, "load" | "capacity" | "buffer">): LoadLevel {
  const u = utilization(e)
  if (u > 1) return "over"
  if (u >= 0.85) return "busy"
  if (u >= 0.4) return "ok"
  return "free"
}

/** Share of each role's estimated hours that is on bugs - a starting point for the bug buffer. */
export function bugShareByRole(issues: IssueSummary[], team: TeamData): Record<Role, number> {
  const members = memberMap(team)
  const total: Record<Role, number> = { BE: 0, FE: 0, QA: 0 }
  const bugs: Record<Role, number> = { BE: 0, FE: 0, QA: 0 }
  for (const issue of issues) {
    for (const a of assignmentsFor(issue, team, members)) {
      total[a.role] += a.hours
      if (isBug(issue)) bugs[a.role] += a.hours
    }
  }
  return {
    BE: total.BE ? Math.round((bugs.BE / total.BE) * 100) : 0,
    FE: total.FE ? Math.round((bugs.FE / total.FE) * 100) : 0,
    QA: total.QA ? Math.round((bugs.QA / total.QA) * 100) : 0,
  }
}

/* ------------------------------------------------------------ sprint window */

export interface SprintWindow {
  start: string
  end: string
  names: string[]
  sprintIds: Set<number>
}

/**
 * The date range covered by the active (or next) sprint of each project in the
 * list. For "future", only the earliest upcoming sprint per board is used.
 */
export function sprintWindow(issues: IssueSummary[], state: "active" | "future"): SprintWindow | null {
  const perProject = new Map<string, { id: number; name: string; start: string | null; end: string | null }>()
  for (const i of issues) {
    const s = i.sprint
    if (!s || s.state !== state) continue
    const current = perProject.get(i.project)
    if (!current || (state === "future" && (s.start ?? "9999") < (current.start ?? "9999"))) {
      perProject.set(i.project, s)
    }
  }
  const sprints = [...perProject.values()]
  const starts = sprints.map((s) => s.start).filter((d): d is string => !!d).sort()
  const ends = sprints.map((s) => s.end).filter((d): d is string => !!d).sort()
  if (!starts.length || !ends.length) return null
  return {
    start: starts[0],
    end: ends[ends.length - 1],
    names: sprints.map((s) => s.name),
    sprintIds: new Set(sprints.map((s) => s.id)),
  }
}

import { prisma } from "@/lib/prisma"
import { isRole, type TeamData, type TeamSettings } from "@/lib/team-types"

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"))
}

export async function getTeamSettings(): Promise<TeamSettings> {
  const s = await prisma.appSettings.findUnique({ where: { id: 1 } })
  return {
    defaultHoursPerDay: s?.defaultHoursPerDay ?? 8,
    saturdaysOff: (s?.saturdaysOff ?? "2,4,5")
      .split(",")
      .map(Number)
      .filter((n) => n >= 1 && n <= 5),
    bugBuffer: { BE: s?.bugBufferBE ?? 0, FE: s?.bugBufferFE ?? 0, QA: s?.bugBufferQA ?? 0 },
  }
}

export async function getTeamData(): Promise<TeamData> {
  const [members, holidays, leaves, qa, settings] = await Promise.all([
    prisma.teamMember.findMany({ orderBy: { name: "asc" } }),
    prisma.holiday.findMany({ orderBy: { date: "asc" } }),
    prisma.leave.findMany({ orderBy: { start: "asc" } }),
    prisma.qaAssignment.findMany(),
    getTeamSettings(),
  ])
  return {
    members: members.map((m) => ({
      accountId: m.accountId,
      name: m.name,
      role: isRole(m.role) ? m.role : "BE",
      hoursPerDay: m.hoursPerDay,
    })),
    holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
    leaves: leaves.map((l) => ({
      id: l.id,
      accountId: l.accountId,
      name: l.name,
      start: l.start,
      end: l.end,
      hours: l.hours,
      note: l.note,
    })),
    qa: Object.fromEntries(qa.map((q) => [q.issueKey, { id: q.accountId, name: q.name }])),
    settings,
  }
}

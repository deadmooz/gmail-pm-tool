// Planning data PM Board keeps for itself (Jira has no place for it). Shared by server and browser.

import type { Person } from "@/lib/jira-types"

export const ROLES = ["BE", "FE", "QA"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  BE: "Back-end",
  FE: "Front-end",
  QA: "QA",
}

export interface TeamMember {
  accountId: string
  name: string
  role: Role
  hoursPerDay: number | null
}

export interface Holiday {
  date: string
  name: string
}

export interface Leave {
  id: string
  accountId: string
  name: string
  start: string
  end: string
  /** Hours off per day; null = the whole day. */
  hours: number | null
  note: string | null
}

export interface TeamSettings {
  defaultHoursPerDay: number
  /** Which Saturdays of the month are off (1–5). Sundays are always off. */
  saturdaysOff: number[]
  /** Percent of each role's capacity held back for bugs. */
  bugBuffer: Record<Role, number>
}

export interface TeamData {
  members: TeamMember[]
  holidays: Holiday[]
  leaves: Leave[]
  /** Issue key -> the person testing it. */
  qa: Record<string, Person>
  settings: TeamSettings
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
}

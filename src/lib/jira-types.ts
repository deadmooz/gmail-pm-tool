// Shared between server and browser code, so nothing here may import server-only modules.

export const PROJECTS = ["IGD", "ISR", "IC"] as const
export type ProjectKey = (typeof PROJECTS)[number]

export const ISSUE_KEY_RE = /^(IGD|ISR|IC)-\d+$/

export type StatusCategory = "todo" | "inprogress" | "done"

export const STATUS_CATEGORY_LABEL: Record<StatusCategory, string> = {
  todo: "To Do",
  inprogress: "In Progress",
  done: "Done",
}

export const STATUS_CATEGORY_ORDER: StatusCategory[] = ["todo", "inprogress", "done"]

export type IssueScope = "sprint" | "open" | "recent"

export interface Person {
  id: string
  name: string
}

export interface IssueSummary {
  key: string
  project: string
  summary: string
  type: string
  status: string
  statusCategory: StatusCategory
  priority: string | null
  assignee: Person | null
  reporter: Person | null
  created: string
  updated: string
  due: string | null
  resolved: string | null
  labels: string[]
  productOwner: Person | null
  url: string
}

export interface IssueComment {
  id: string
  author: Person | null
  body: string
  created: string
}

export interface IssueTransition {
  id: string
  name: string
  to: string
  toCategory: StatusCategory
}

export interface IssueDetail extends IssueSummary {
  description: string
  comments: IssueComment[]
  transitions: IssueTransition[]
}

// 0 = most urgent. Covers Jira's default names and the P0–P4 scheme.
const PRIORITY_RANK: Record<string, number> = {
  highest: 0, blocker: 0, critical: 0, p0: 0,
  high: 1, major: 1, p1: 1,
  medium: 2, p2: 2,
  low: 3, minor: 3, p3: 3,
  lowest: 4, trivial: 4, p4: 4,
}

export function priorityRank(priority: string | null): number {
  return priority ? PRIORITY_RANK[priority.toLowerCase()] ?? 2 : 5
}

/** Whole days past the due date (positive = overdue), or null when there is no due date. */
export function daysOverdue(issue: IssueSummary, today = new Date()): number | null {
  if (!issue.due || issue.statusCategory === "done") return null
  const due = Date.parse(issue.due + "T00:00:00Z")
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.floor((now - due) / 86400000)
}

/** Higher = more urgent. Mixes priority, bug-ness and lateness. */
export function urgencyScore(issue: IssueSummary): number {
  let score = (5 - priorityRank(issue.priority)) * 15
  if (issue.type.toLowerCase() === "bug") score += 10
  const overdue = daysOverdue(issue)
  if (overdue !== null && overdue > 0) score += Math.min(overdue, 30) * 2
  else if (overdue !== null && overdue >= -3) score += 10
  if (!issue.assignee) score += 5
  return score
}

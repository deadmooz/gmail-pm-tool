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

/**
 * sprint = active sprints, next = future sprints, open = everything not done,
 * recent = updated in 30 days, deploy = active sprints plus anything with a
 * deployment date from two weeks ago onwards.
 */
export type IssueScope = "sprint" | "next" | "open" | "recent" | "deploy"

export interface Person {
  id: string
  name: string
}

export interface SprintRef {
  id: number
  name: string
  state: string
  start: string | null
  end: string | null
}

/** Who builds and tests a card, when, and how many hours each part is estimated at. */
export interface Delivery {
  beDev: Person | null
  feDev: Person | null
  beStart: string | null
  beEnd: string | null
  feStart: string | null
  feEnd: string | null
  qaStart: string | null
  qaEnd: string | null
  beEstimate: number | null
  feEstimate: number | null
  qaEstimate: number | null
  deployment: string | null
  release: string | null
  revisedRelease: string | null
  prdSignoff: string | null
  spmSignoff: string | null
  uatSignoff: string | null
  techFeasibility: string | null
}

export interface IssueSummary {
  key: string
  project: string
  summary: string
  type: string
  status: string
  statusId: string
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
  sprint: SprintRef | null
  delivery: Delivery
  url: string
}

export interface IssueComment {
  id: string
  author: Person | null
  body: string
  created: string
}

export interface IssueDetail extends IssueSummary {
  description: string
  comments: IssueComment[]
}

export interface BoardColumn {
  name: string
  statusIds: string[]
}

export interface BoardConfig {
  boardId: number
  boardName: string
  columns: BoardColumn[]
}

/* ------------------------------------------------------------------ helpers */

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

export const isBug = (i: IssueSummary) => i.type.toLowerCase() === "bug"
export const isDone = (i: IssueSummary) => i.statusCategory === "done"

/** The date a card has to be ready by: its Deployment Date, falling back to Jira's due date. */
export function deadline(issue: IssueSummary): string | null {
  return issue.delivery.deployment ?? issue.due
}

export function todayIso(now = new Date()): string {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function diffDays(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000)
}

/** Whole days past the deadline (positive = late), or null when there is no deadline or it's done. */
export function daysOverdue(issue: IssueSummary, today = todayIso()): number | null {
  const d = deadline(issue)
  if (!d || isDone(issue)) return null
  return diffDays(d, today)
}

/** Higher = more urgent. Mixes priority, bug-ness and lateness against the deployment date. */
export function urgencyScore(issue: IssueSummary): number {
  let score = (5 - priorityRank(issue.priority)) * 15
  if (isBug(issue)) score += 10
  const overdue = daysOverdue(issue)
  if (overdue !== null && overdue > 0) score += Math.min(overdue, 30) * 2
  else if (overdue !== null && overdue >= -3) score += 10
  if (!issue.assignee) score += 5
  return score
}

/** True when QA is scheduled to finish after the card is meant to deploy. */
export function qaAfterDeployment(issue: IssueSummary): boolean {
  const { qaEnd, deployment } = issue.delivery
  return !!qaEnd && !!deployment && qaEnd > deployment
}

/** The latest planned release date, and whether it moved. */
export function releaseSlip(issue: IssueSummary): { from: string; to: string; days: number } | null {
  const { release, revisedRelease } = issue.delivery
  if (!release || !revisedRelease || revisedRelease === release) return null
  return { from: release, to: revisedRelease, days: diffDays(release, revisedRelease) }
}

import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { customFieldIds, jiraContext, jqlField, searchIssues } from "@/lib/jira"
import { baselineFor, flowsFor } from "@/lib/flow-server"
import { PROJECTS } from "@/lib/jira-types"

export const dynamic = "force-dynamic"

const SCOPES = {
  sprint: "sprint in openSprints()",
  next: "sprint in futureSprints()",
} as const

/**
 * Issues in scope with their real status history (time in each phase,
 * bounces back from QA) plus typical phase times from the last 90 days.
 * scope=deploy covers the active sprint and anything deploying from two weeks ago on.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser()
  const params = new URL(req.url).searchParams
  const project = PROJECTS.find((p) => p === params.get("project"))
  const keys = project ? [project] : [...PROJECTS]
  const scope = params.get("scope")

  const ctx = await jiraContext(user)
  let clause: string = SCOPES.sprint
  if (scope === "next") clause = SCOPES.next
  if (scope === "deploy") {
    const deployField = jqlField((await customFieldIds(ctx)).deployment)
    if (deployField) clause = `(sprint in openSprints() OR ${deployField} >= startOfDay(-14d))`
  }

  const issues = await searchIssues(ctx, `project in (${keys.join(", ")}) AND ${clause} ORDER BY Rank ASC`, 500)
  const [flows, baseline] = await Promise.all([flowsFor(ctx, issues), baselineFor(ctx, [...PROJECTS])])
  return NextResponse.json({ issues, flows, baseline })
})

import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { jiraContext, searchIssues } from "@/lib/jira"
import { PROJECTS, type IssueScope } from "@/lib/jira-types"

export const dynamic = "force-dynamic"

const SCOPE_CLAUSE: Record<IssueScope, string> = {
  sprint: "sprint in openSprints()",
  open: "statusCategory != Done",
  recent: "updated >= -30d",
}

export const GET = handler(async (req: Request) => {
  const user = await requireUser()
  const params = new URL(req.url).searchParams

  // Only ever query the three supported projects; anything else means "all of them".
  const project = PROJECTS.find((p) => p === params.get("project"))
  const keys = project ? [project] : [...PROJECTS]
  const scopeParam = params.get("scope") as IssueScope
  const scope: IssueScope = scopeParam in SCOPE_CLAUSE ? scopeParam : "open"

  const order = scope === "sprint" ? "ORDER BY Rank ASC" : "ORDER BY updated DESC"
  const jql = `project in (${keys.join(", ")}) AND ${SCOPE_CLAUSE[scope]} ${order}`

  const ctx = await jiraContext(user)
  const issues = await searchIssues(ctx, jql, 500)
  return NextResponse.json({ issues, limit: 500 })
})

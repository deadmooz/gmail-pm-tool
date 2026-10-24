import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { customFieldIds, jiraContext, jqlField, searchIssues } from "@/lib/jira"
import { PROJECTS, type IssueScope } from "@/lib/jira-types"

export const dynamic = "force-dynamic"

const SCOPES: IssueScope[] = ["sprint", "next", "open", "recent", "deploy"]

export const GET = handler(async (req: Request) => {
  const user = await requireUser()
  const params = new URL(req.url).searchParams

  // Only ever query the three supported projects; anything else means "all of them".
  const project = PROJECTS.find((p) => p === params.get("project"))
  const keys = project ? [project] : [...PROJECTS]
  const scope = SCOPES.find((s) => s === params.get("scope")) ?? "open"

  const ctx = await jiraContext(user)
  let clause: string
  switch (scope) {
    case "sprint":
      clause = "sprint in openSprints()"
      break
    case "next":
      clause = "sprint in futureSprints()"
      break
    case "recent":
      clause = "updated >= -30d"
      break
    case "deploy": {
      const deployField = jqlField((await customFieldIds(ctx)).deployment)
      clause = deployField
        ? `(sprint in openSprints() OR ${deployField} >= startOfDay(-14d))`
        : "sprint in openSprints()"
      break
    }
    default:
      clause = "statusCategory != Done"
  }

  const order = scope === "sprint" || scope === "next" ? "ORDER BY Rank ASC" : "ORDER BY updated DESC"
  const jql = `project in (${keys.join(", ")}) AND ${clause} ${order}`
  const issues = await searchIssues(ctx, jql, 500)
  return NextResponse.json({ issues, limit: 500 })
})

import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { jiraContext } from "@/lib/jira"
import { sprintHistory } from "@/lib/flow-server"
import { PROJECTS } from "@/lib/jira-types"

export const dynamic = "force-dynamic"

/** The last six closed sprints of each project's board, with delivery stats. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser()
  const project = PROJECTS.find((p) => p === new URL(req.url).searchParams.get("project"))
  const ctx = await jiraContext(user)
  const keys = project ? [project] : [...PROJECTS]
  const results = await Promise.all(keys.map((p) => sprintHistory(ctx, p).catch(() => [])))
  return NextResponse.json({ sprints: results.flat() })
})

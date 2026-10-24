import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { getBoardConfig, jiraContext } from "@/lib/jira"
import { PROJECTS, type BoardConfig } from "@/lib/jira-types"

export const dynamic = "force-dynamic"

/** Each project's scrum board columns (name + statuses), in Jira's order. */
export const GET = handler(async () => {
  const user = await requireUser()
  const ctx = await jiraContext(user)
  const entries = await Promise.all(
    PROJECTS.map(async (p) => [p, await getBoardConfig(ctx, p).catch(() => null)] as const)
  )
  const boards: Record<string, BoardConfig | null> = Object.fromEntries(entries)
  return NextResponse.json({ boards })
})

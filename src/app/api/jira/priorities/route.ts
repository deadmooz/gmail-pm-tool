import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { getPriorities, jiraContext } from "@/lib/jira"

export const dynamic = "force-dynamic"

export const GET = handler(async () => {
  const user = await requireUser()
  const priorities = await getPriorities(await jiraContext(user))
  return NextResponse.json({ priorities })
})

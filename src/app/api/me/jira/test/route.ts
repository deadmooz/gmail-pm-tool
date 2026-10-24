import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { getMyself, jiraContext } from "@/lib/jira"

export const dynamic = "force-dynamic"

/** Checks the saved Jira credentials by asking Jira who they belong to. */
export const GET = handler(async () => {
  const user = await requireUser()
  const me = await getMyself(await jiraContext(user))
  return NextResponse.json({ ok: true, jiraUser: me })
})

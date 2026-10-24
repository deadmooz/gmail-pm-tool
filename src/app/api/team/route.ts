import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { getTeamData } from "@/lib/team"

export const dynamic = "force-dynamic"

/** Everything PM Board stores for planning: roles, calendar, holidays, leave and QA assignments. */
export const GET = handler(async () => {
  await requireUser()
  return NextResponse.json(await getTeamData())
})

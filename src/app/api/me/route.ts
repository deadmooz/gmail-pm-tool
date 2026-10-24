import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { publicUser, requireUser } from "@/lib/session"
import { getJiraDomain } from "@/lib/jira"

export const dynamic = "force-dynamic"

export const GET = handler(async () => {
  const user = await requireUser()
  return NextResponse.json({ user: publicUser(user), jiraDomain: await getJiraDomain() })
})

import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { requireAdmin } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { isRole } from "@/lib/team-types"

/** Body: { accountId, name, role, hoursPerDay | null }. Adds or updates one person. */
export const PUT = handler(async (req: Request) => {
  await requireAdmin()
  const body = await readJson(req)
  const accountId = str(body.accountId)
  const name = str(body.name)
  if (!accountId || !name) throw new HttpError(400, "Pick a person from Jira.")
  if (!isRole(body.role)) throw new HttpError(400, "Pick a role: Back-end, Front-end or QA.")

  let hoursPerDay: number | null = null
  if (body.hoursPerDay !== null && body.hoursPerDay !== undefined && body.hoursPerDay !== "") {
    hoursPerDay = Number(body.hoursPerDay)
    if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 16) {
      throw new HttpError(400, "Hours per day must be between 0 and 16.")
    }
  }

  const data = { name, role: body.role, hoursPerDay }
  const member = await prisma.teamMember.upsert({
    where: { accountId },
    update: data,
    create: { accountId, ...data },
  })
  return NextResponse.json({ member })
})

export const DELETE = handler(async (req: Request) => {
  await requireAdmin()
  const accountId = new URL(req.url).searchParams.get("accountId") ?? ""
  await prisma.teamMember.deleteMany({ where: { accountId } })
  return NextResponse.json({ ok: true })
})

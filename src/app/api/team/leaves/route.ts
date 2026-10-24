import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { isIsoDate } from "@/lib/team"

// Any signed-in user can record leave, so people (or their leads) can keep it current.

/** Body: { accountId, name, start, end, hours | null, note? }. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser()
  const body = await readJson(req)
  const accountId = str(body.accountId)
  const name = str(body.name)
  if (!accountId || !name) throw new HttpError(400, "Pick a person.")
  if (!isIsoDate(body.start) || !isIsoDate(body.end)) throw new HttpError(400, "Pick the first and last day of leave.")
  if (body.end < body.start) throw new HttpError(400, "The last day can't be before the first day.")

  let hours: number | null = null
  if (body.hours !== null && body.hours !== undefined && body.hours !== "") {
    hours = Number(body.hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 16) throw new HttpError(400, "Hours off must be between 0 and 16.")
  }

  const leave = await prisma.leave.create({
    data: {
      accountId,
      name,
      start: body.start,
      end: body.end,
      hours,
      note: str(body.note).slice(0, 200) || null,
      createdBy: user.email,
    },
  })
  return NextResponse.json({ leave }, { status: 201 })
})

export const DELETE = handler(async (req: Request) => {
  await requireUser()
  const id = new URL(req.url).searchParams.get("id") ?? ""
  await prisma.leave.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
})

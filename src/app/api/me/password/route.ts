import { NextResponse } from "next/server"
import { handler, HttpError, readJson } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password"

export const POST = handler(async (req: Request) => {
  const user = await requireUser()
  const body = await readJson(req)
  const current = typeof body.currentPassword === "string" ? body.currentPassword : ""
  const next = typeof body.newPassword === "string" ? body.newPassword : ""

  if (!(await verifyPassword(current, user.passwordHash))) throw new HttpError(400, "Your current password is wrong.")
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } })
  return NextResponse.json({ ok: true })
})

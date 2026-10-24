import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { publicUser, requireAdmin } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password"

type Ctx = { params: Promise<{ id: string }> }

async function targetUser(ctx: Ctx) {
  const { id } = await ctx.params
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new HttpError(404, "That user no longer exists.")
  return user
}

/** Body: any of { name, role, status, password, clearJira }. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin()
  const user = await targetUser(ctx)
  const body = await readJson(req)
  const data: {
    name?: string
    role?: string
    status?: string
    passwordHash?: string
    jiraEmail?: null
    jiraApiToken?: null
  } = {}

  if ("name" in body) {
    const name = str(body.name)
    if (!name) throw new HttpError(400, "Enter a name.")
    data.name = name
  }
  if ("role" in body) {
    if (body.role !== "admin" && body.role !== "member") throw new HttpError(400, "Invalid role.")
    if (user.id === admin.id && body.role !== "admin") throw new HttpError(400, "You can't remove your own admin role.")
    data.role = body.role
  }
  if ("status" in body) {
    if (body.status !== "active" && body.status !== "suspended") throw new HttpError(400, "Invalid status.")
    if (user.id === admin.id && body.status !== "active") throw new HttpError(400, "You can't suspend yourself.")
    data.status = body.status
  }
  if ("password" in body) {
    const password = typeof body.password === "string" ? body.password : ""
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    }
    data.passwordHash = await hashPassword(password)
  }
  if (body.clearJira === true) {
    data.jiraEmail = null
    data.jiraApiToken = null
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  return NextResponse.json({ user: publicUser(updated) })
})

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin()
  const user = await targetUser(ctx)
  if (user.id === admin.id) throw new HttpError(400, "You can't delete your own account.")
  await prisma.user.delete({ where: { id: user.id } })
  return NextResponse.json({ ok: true })
})

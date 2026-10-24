import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import { hashPassword, verifyPassword } from "@/lib/password"

export const BOOTSTRAP_ADMIN_EMAIL = "admin@pm-tool.local"

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * ADMIN_USERNAME / ADMIN_PASSWORD from .env always work as a break-glass
 * admin login, so there is a way in before any users exist.
 */
async function bootstrapAdmin(login: string, password: string) {
  const envUser = process.env.ADMIN_USERNAME
  const envPass = process.env.ADMIN_PASSWORD
  if (!envUser || !envPass) return null
  if (!safeEqual(login, envUser) || !safeEqual(password, envPass)) return null

  return prisma.user.upsert({
    where: { email: BOOTSTRAP_ADMIN_EMAIL },
    update: { role: "admin", status: "active" },
    create: {
      name: "Admin",
      email: BOOTSTRAP_ADMIN_EMAIL,
      passwordHash: await hashPassword(envPass),
      role: "admin",
    },
  })
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        login: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const login = credentials?.login?.trim().toLowerCase() ?? ""
        const password = credentials?.password ?? ""
        if (!login || !password) return null

        const admin = await bootstrapAdmin(login, password)
        if (admin) return { id: admin.id, name: admin.name, email: admin.email, role: admin.role }

        const user = await prisma.user.findUnique({ where: { email: login } })
        if (!user || user.status !== "active") return null
        if (!(await verifyPassword(password, user.passwordHash))) return null
        return { id: user.id, name: user.name, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = user.role
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.role = token.role ?? "member"
      }
      return session
    },
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
}

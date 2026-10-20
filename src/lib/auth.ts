import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import type { Adapter } from "next-auth/adapters"

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    CredentialsProvider({
      name: "Admin Login",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminUser = process.env.ADMIN_USERNAME
        const adminPass = process.env.ADMIN_PASSWORD
        // Fail closed when credentials are not configured.
        if (!adminUser || !adminPass || !credentials) return null

        if (
          !safeEqual(credentials.username ?? "", adminUser) ||
          !safeEqual(credentials.password ?? "", adminPass)
        ) {
          return null
        }

        const user = await prisma.user.upsert({
          where: { email: "admin@pm-tool.local" },
          update: {},
          create: { name: "Admin User", email: "admin@pm-tool.local" },
        })
        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session?.user && token?.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
  session: {
    strategy: "jwt", // Credentials provider requires JWT session strategy
  },
}

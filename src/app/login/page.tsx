"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { inputClass, primaryButtonClass, Spinner } from "@/components/ui-kit"

export default function LoginPage() {
  const router = useRouter()
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn("credentials", { login, password, redirect: false })
    if (res?.ok) {
      router.replace("/")
      router.refresh()
      return
    }
    setBusy(false)
    setError("That email and password don't match an active account.")
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PM Board</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to see IGD, ISR and IC.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="login" className="text-sm font-medium text-slate-700">Email</label>
          <input
            id="login"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryButtonClass} w-full`}>
          {busy && <Spinner className="text-white" />}
          Sign in
        </button>
      </form>
    </div>
  )
}

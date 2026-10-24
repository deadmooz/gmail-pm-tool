"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { apiFetch, errorMessage } from "@/lib/api-client"
import type { PublicUser } from "@/lib/session"
import {
  Card,
  inputClass,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  Spinner,
} from "@/components/ui-kit"

type Notice = { ok: boolean; text: string } | null

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null
  return <p className={notice.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{notice.text}</p>
}

export default function SettingsPage() {
  const [me, setMe] = useState<{ user: PublicUser; jiraDomain: string | null } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ user: PublicUser; jiraDomain: string | null }>("/api/me")
      .then((d) => {
        if (!cancelled) setMe(d)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="My Settings" description="Connect your own Jira account and manage your password." />
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {!me && !loadError && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      )}
      {me && (
        <>
          <JiraCard
            key={me.user.jiraEmail ?? ""}
            user={me.user}
            jiraDomain={me.jiraDomain}
            onSaved={(user) => setMe({ ...me, user })}
          />
          <PasswordCard />
        </>
      )}
    </div>
  )
}

function JiraCard({
  user,
  jiraDomain,
  onSaved,
}: {
  user: PublicUser
  jiraDomain: string | null
  onSaved: (user: PublicUser) => void
}) {
  const [email, setEmail] = useState(user.jiraEmail ?? user.email)
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState<"save" | "test" | "disconnect" | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy("save")
    setNotice(null)
    try {
      const d = await apiFetch<{ user: PublicUser }>("/api/me/jira", {
        method: "PUT",
        body: { jiraEmail: email, jiraApiToken: token },
      })
      setToken("")
      onSaved(d.user)
      // Check straight away so a typo shows up now, not on the board.
      const t = await apiFetch<{ jiraUser: { name: string } }>("/api/me/jira/test")
      setNotice({ ok: true, text: `Saved. Jira recognises you as ${t.jiraUser.name}.` })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  async function test() {
    setBusy("test")
    setNotice(null)
    try {
      const t = await apiFetch<{ jiraUser: { name: string } }>("/api/me/jira/test")
      setNotice({ ok: true, text: `Connected. Jira recognises you as ${t.jiraUser.name}.` })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    if (!confirm("Remove your Jira API token from PM Board?")) return
    setBusy("disconnect")
    setNotice(null)
    try {
      const d = await apiFetch<{ user: PublicUser }>("/api/me/jira", { method: "DELETE" })
      onSaved(d.user)
      setNotice({ ok: true, text: "Disconnected. Your token was deleted." })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Jira connection</h2>
          <p className="mt-1 text-sm text-slate-500">
            Everything you see and change here goes through your own Jira account.
            {jiraDomain ? (
              <> Jira site: <span className="font-medium text-slate-700">{jiraDomain}</span></>
            ) : (
              <span className="text-amber-700"> An admin still needs to set the Jira site address.</span>
            )}
          </p>
        </div>
        {user.jiraConnected && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        )}
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="jira-email" className="text-sm font-medium text-slate-700">Jira email</label>
          <input id="jira-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="jira-token" className="text-sm font-medium text-slate-700">Jira API token</label>
          <input
            id="jira-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={user.jiraConnected ? "Saved. Leave blank to keep it." : "Paste your API token"}
            className={inputClass}
            required={!user.jiraConnected}
          />
          <p className="text-xs text-slate-500">
            Create one at{" "}
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 underline"
            >
              Atlassian account → Security → API tokens
            </a>
            . It is stored encrypted and never shown again.
          </p>
        </div>
        <NoticeLine notice={notice} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy !== null} className={primaryButtonClass}>
            {busy === "save" && <Spinner className="text-white" />}
            Save and test
          </button>
          {user.jiraConnected && (
            <>
              <button type="button" onClick={test} disabled={busy !== null} className={secondaryButtonClass}>
                {busy === "test" && <Spinner />}
                Test connection
              </button>
              <button type="button" onClick={disconnect} disabled={busy !== null} className={`${secondaryButtonClass} text-red-600`}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </form>
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirmNext, setConfirmNext] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirmNext) {
      setNotice({ ok: false, text: "The two new passwords don't match." })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await apiFetch("/api/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } })
      setCurrent("")
      setNext("")
      setConfirmNext("")
      setNotice({ ok: true, text: "Password changed." })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-5 text-lg font-semibold">Password</h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="pw-current" className="text-sm font-medium text-slate-700">Current password</label>
          <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="pw-new" className="text-sm font-medium text-slate-700">New password</label>
            <input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} required />
          </div>
          <div className="space-y-1">
            <label htmlFor="pw-confirm" className="text-sm font-medium text-slate-700">Repeat new password</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} className={inputClass} required />
          </div>
        </div>
        <NoticeLine notice={notice} />
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy && <Spinner className="text-white" />}
          Change password
        </button>
      </form>
    </Card>
  )
}

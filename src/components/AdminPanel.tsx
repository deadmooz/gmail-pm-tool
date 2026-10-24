"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, CircleDashed } from "lucide-react"
import { apiFetch, errorMessage } from "@/lib/api-client"
import type { PublicUser } from "@/lib/session"
import { cn } from "@/lib/utils"
import {
  Card,
  fmtDate,
  inputClass,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  Spinner,
} from "@/components/ui-kit"

type Notice = { ok: boolean; text: string } | null

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Admin" description="Manage who can use PM Board and where it connects to Jira." />
      <JiraSiteCard />
      <UsersCard currentUserId={currentUserId} />
    </div>
  )
}

function JiraSiteCard() {
  const [domain, setDomain] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ jiraDomain: string | null }>("/api/admin/settings")
      .then((d) => {
        if (!cancelled) setDomain(d.jiraDomain ?? "")
      })
      .catch((err) => {
        if (!cancelled) {
          setDomain("")
          setNotice({ ok: false, text: errorMessage(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const d = await apiFetch<{ jiraDomain: string }>("/api/admin/settings", { method: "PUT", body: { jiraDomain: domain } })
      setDomain(d.jiraDomain)
      setNotice({ ok: true, text: "Saved." })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Jira site</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">Shared by everyone. Each user signs in to it with their own API token.</p>
      {domain === null ? (
        <Spinner />
      ) : (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="your-company.atlassian.net"
            className={cn(inputClass, "w-96 max-w-full")}
            required
            aria-label="Jira site address"
          />
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy && <Spinner className="text-white" />}
            Save
          </button>
          {notice && <span className={notice.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{notice.text}</span>}
        </form>
      )}
    </Card>
  )
}

function UsersCard({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<PublicUser[] | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ users: PublicUser[] }>("/api/admin/users")
      .then((d) => {
        if (!cancelled) setUsers(d.users)
      })
      .catch((err) => {
        if (!cancelled) setNotice({ ok: false, text: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [reloadCount])

  const reload = useCallback(() => setReloadCount((n) => n + 1), [])

  async function update(user: PublicUser, body: Record<string, unknown>, success: string) {
    setBusyId(user.id)
    setNotice(null)
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body })
      setNotice({ ok: true, text: success })
      setEditingId(null)
      reload()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusyId(null)
    }
  }

  function resetPassword(user: PublicUser) {
    const password = prompt(`New password for ${user.name} (at least 8 characters):`)
    if (password === null) return
    update(user, { password }, `Password reset for ${user.name}. Share it with them privately.`)
  }

  async function remove(user: PublicUser) {
    if (!confirm(`Delete ${user.name} (${user.email})? This can't be undone.`)) return
    setBusyId(user.id)
    setNotice(null)
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
      setNotice({ ok: true, text: `${user.name} was deleted.` })
      reload()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-6">
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="mt-1 text-sm text-slate-500">
          Admins can manage users and the Jira site. Members can use the board. Suspended users can&apos;t sign in.
        </p>
      </div>

      <AddUserForm onAdded={(name) => { setNotice({ ok: true, text: `${name} was added.` }); reload() }} />

      {notice && (
        <p className={cn("border-b px-6 py-3 text-sm", notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
          {notice.text}
        </p>
      )}

      {!users ? (
        <div className="p-6"><Spinner /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Jira</th>
                <th className="px-4 py-3 font-semibold">Added</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) =>
                editingId === u.id ? (
                  <EditRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUserId}
                    busy={busyId === u.id}
                    onCancel={() => setEditingId(null)}
                    onSave={(body) => update(u, body, `${u.name} was updated.`)}
                  />
                ) : (
                  <tr key={u.id} className={cn(u.status === "suspended" && "bg-slate-50 text-slate-400")}>
                    <td className="px-6 py-3">
                      <p className="font-medium text-slate-900">
                        {u.name} {u.id === currentUserId && <span className="text-xs font-normal text-slate-400">(you)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", u.role === "admin" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700")}>
                        {u.role === "admin" ? "Admin" : "Member"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.status === "active" ? (
                        <span className="text-emerald-700">Active</span>
                      ) : (
                        <span className="text-amber-700">Suspended</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.jiraConnected ? (
                        <span className="flex items-center gap-1 text-emerald-700" title={u.jiraEmail ?? undefined}>
                          <CheckCircle2 className="h-4 w-4" /> Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400">
                          <CircleDashed className="h-4 w-4" /> Not yet
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(u.createdAt)}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {busyId === u.id && <Spinner />}
                        <RowButton disabled={busyId !== null} onClick={() => setEditingId(u.id)}>Edit</RowButton>
                        <RowButton disabled={busyId !== null} onClick={() => resetPassword(u)}>Reset password</RowButton>
                        {u.jiraConnected && (
                          <RowButton
                            disabled={busyId !== null}
                            onClick={() =>
                              confirm(`Remove ${u.name}'s Jira API token?`) &&
                              update(u, { clearJira: true }, `${u.name}'s Jira token was removed.`)
                            }
                          >
                            Remove Jira key
                          </RowButton>
                        )}
                        {u.id !== currentUserId && (
                          <RowButton danger disabled={busyId !== null} onClick={() => remove(u)}>Delete</RowButton>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function RowButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50",
        danger ? "text-red-600" : "text-slate-700"
      )}
    >
      {children}
    </button>
  )
}

function EditRow({
  user,
  isSelf,
  busy,
  onCancel,
  onSave,
}: {
  user: PublicUser
  isSelf: boolean
  busy: boolean
  onCancel: () => void
  onSave: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const [status, setStatus] = useState(user.status)

  return (
    <tr className="bg-sky-50/50">
      <td className="px-6 py-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} aria-label="Name" />
        <p className="mt-1 text-xs text-slate-500">{user.email}</p>
      </td>
      <td className="px-4 py-3">
        <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf} className={inputClass} aria-label="Role">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isSelf} className={inputClass} aria-label="Status">
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </td>
      <td className="px-4 py-3" colSpan={2} />
      <td className="px-6 py-3">
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={secondaryButtonClass}>Cancel</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(isSelf ? { name } : { name, role, status })}
            className={primaryButtonClass}
          >
            {busy && <Spinner className="text-white" />}
            Save
          </button>
        </div>
      </td>
    </tr>
  )
}

function AddUserForm({ onAdded }: { onAdded: (name: string) => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("member")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiFetch("/api/admin/users", { method: "POST", body: { name, email, password, role } })
      onAdded(name)
      setName("")
      setEmail("")
      setPassword("")
      setRole("member")
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="border-b bg-slate-50/60 p-6">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Add a user</h3>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_140px_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} required aria-label="Full name" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (used to sign in)" className={inputClass} required aria-label="Email" />
        <input
          type="text"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Starting password (8+ chars)"
          minLength={8}
          className={inputClass}
          required
          aria-label="Starting password"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} aria-label="Role">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy && <Spinner className="text-white" />}
          Add user
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-500">
        Share the starting password privately. They can change it, and add their Jira API key, in My Settings.
      </p>
    </form>
  )
}

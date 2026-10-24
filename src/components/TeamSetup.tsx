"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useIssues } from "@/hooks/useIssues"
import { useTeam } from "@/hooks/useTeam"
import { apiFetch, errorMessage } from "@/lib/api-client"
import { todayIso, type IssueSummary, type Person } from "@/lib/jira-types"
import { bugShareByRole } from "@/lib/capacity"
import { ROLE_LABEL, ROLES, type Role, type TeamData } from "@/lib/team-types"
import { cn } from "@/lib/utils"
import {
  Card,
  ErrorBox,
  fmtDate,
  inputClass,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  Spinner,
} from "@/components/ui-kit"

type Notice = { ok: boolean; text: string } | null

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null
  return <p className={cn("text-sm", notice.ok ? "text-emerald-700" : "text-red-600")}>{notice.text}</p>
}

const TESTING_RE = /test|\bqa\b|uat/i

interface Candidate {
  person: Person
  suggested: Role
  /** e.g. "Back-end on 12 cards", or null when only seen as an assignee. */
  evidence: string | null
}

/** People seen in Jira's developer fields or as assignees, with the role they most often appear in. */
function jiraPeople(issues: IssueSummary[]): Candidate[] {
  const seen = new Map<string, { person: Person; counts: Record<Role, number> }>()
  const add = (p: Person | null, role: Role | null) => {
    if (!p) return
    const e = seen.get(p.id) ?? { person: p, counts: { BE: 0, FE: 0, QA: 0 } }
    if (role) e.counts[role]++
    seen.set(p.id, e)
  }
  issues.forEach((i) => {
    add(i.delivery.beDev, "BE")
    add(i.delivery.feDev, "FE")
    // Whoever holds a card while it's in testing is very likely QA.
    add(i.assignee, TESTING_RE.test(i.status) ? "QA" : null)
  })
  return [...seen.values()]
    .map((e) => {
      const suggested = ROLES.reduce((best, r) => (e.counts[r] > e.counts[best] ? r : best), "QA" as Role)
      const n = e.counts[suggested]
      return {
        person: e.person,
        suggested,
        evidence: !n
          ? null
          : suggested === "QA"
            ? `Assigned ${n} card${n === 1 ? "" : "s"} in testing`
            : `${ROLE_LABEL[suggested]} on ${n} card${n === 1 ? "" : "s"}`,
      }
    })
    .sort((a, b) => a.person.name.localeCompare(b.person.name))
}

export function TeamSetup({ isAdmin }: { isAdmin: boolean }) {
  const team = useTeam()
  const current = useIssues("all", "sprint")
  const next = useIssues("all", "next")

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Team setup"
        description="Roles, working hours, holidays and leave. Stored in PM Board only and used for capacity. Nothing here changes Jira."
      />
      {!isAdmin && (
        <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">
          Only admins can change people, the calendar and holidays. Anyone can record leave.
        </p>
      )}
      {team.error && <ErrorBox error={team.error} onRetry={team.reload} />}
      {!team.team && !team.error && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      )}
      {team.team && (
        <>
          <MembersCard
            team={team.team}
            isAdmin={isAdmin}
            candidates={jiraPeople([...current.issues, ...next.issues])}
            loadingCandidates={current.firstLoad || next.firstLoad}
            onChanged={team.reload}
          />
          <CalendarCard team={team.team} isAdmin={isAdmin} sprintIssues={current.issues} onChanged={team.reload} />
          <div className="grid gap-6 lg:grid-cols-2">
            <LeaveCard team={team.team} onChanged={team.reload} />
            <HolidaysCard team={team.team} isAdmin={isAdmin} onChanged={team.reload} />
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ members */

function MembersCard({
  team,
  isAdmin,
  candidates,
  loadingCandidates,
  onChanged,
}: {
  team: TeamData
  isAdmin: boolean
  candidates: Candidate[]
  loadingCandidates: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const memberIds = new Set(team.members.map((m) => m.accountId))
  const newPeople = candidates.filter((c) => !memberIds.has(c.person.id))
  const devs = newPeople.filter((c) => c.evidence)
  const others = newPeople.filter((c) => !c.evidence)

  async function save(accountId: string, name: string, role: Role, hoursPerDay: number | null) {
    setBusy(accountId)
    setNotice(null)
    try {
      await apiFetch("/api/team/members", { method: "PUT", body: { accountId, name, role, hoursPerDay } })
      onChanged()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  async function remove(accountId: string, name: string) {
    if (!confirm(`Remove ${name} from the team? Their leave records stay.`)) return
    setBusy(accountId)
    try {
      await apiFetch(`/api/team/members?accountId=${encodeURIComponent(accountId)}`, { method: "DELETE" })
      onChanged()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-5">
        <h2 className="text-lg font-semibold">People</h2>
        <p className="mt-1 text-sm text-slate-500">
          Everyone whose time should be planned. Hours per day overrides the default ({team.settings.defaultHoursPerDay}h). Jira has no QA
          field, so add your QA people here and assign them to cards from the issue panel.
        </p>
        <NoticeLine notice={notice} />
      </div>

      {team.members.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Role</th>
              <th className="px-3 py-2.5 font-semibold">Hours per day</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ROLES.flatMap((role) => team.members.filter((m) => m.role === role)).map((m) => (
              <tr key={m.accountId}>
                <td className="px-5 py-2.5 font-medium text-slate-900">{m.name}</td>
                <td className="px-3 py-2.5">
                  <select
                    value={m.role}
                    disabled={!isAdmin || busy === m.accountId}
                    onChange={(e) => save(m.accountId, m.name, e.target.value as Role, m.hoursPerDay)}
                    className={cn(inputClass, "w-36 py-1")}
                    aria-label={`${m.name} role`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="number"
                    min={0.5}
                    max={16}
                    step={0.5}
                    defaultValue={m.hoursPerDay ?? ""}
                    placeholder={`${team.settings.defaultHoursPerDay} (default)`}
                    disabled={!isAdmin || busy === m.accountId}
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value)
                      if (v !== m.hoursPerDay) save(m.accountId, m.name, m.role, v)
                    }}
                    className={cn(inputClass, "w-36 py-1")}
                    aria-label={`${m.name} hours per day`}
                  />
                </td>
                <td className="px-5 py-2.5 text-right">
                  {busy === m.accountId && <Spinner className="mr-2 inline" />}
                  {isAdmin && (
                    <button type="button" onClick={() => remove(m.accountId, m.name)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove ${m.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdmin && (
        <div className="border-t bg-slate-50/60 p-5">
          <h3 className="text-sm font-semibold text-slate-900">Add people from Jira</h3>
          <p className="mb-3 text-xs text-slate-500">
            Found in the current and next sprint. Check the role before adding.
          </p>
          {loadingCandidates ? (
            <Spinner />
          ) : newPeople.length === 0 ? (
            <p className="text-sm text-slate-500">Everyone found in Jira is already set up.</p>
          ) : (
            <div className="space-y-4">
              {devs.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Developers and likely QA (from Jira)</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {devs.map((c) => (
                      <CandidateRow key={c.person.id} candidate={c} busy={busy === c.person.id} onAdd={(role) => save(c.person.id, c.person.name, role, null)} />
                    ))}
                  </div>
                </div>
              )}
              {others.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Others assigned to cards</h4>
                  <p className="mb-2 text-xs text-slate-500">Often QA, Product Owners or managers. Only add people whose time should be planned.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {others.map((c) => (
                      <CandidateRow key={c.person.id} candidate={c} busy={busy === c.person.id} onAdd={(role) => save(c.person.id, c.person.name, role, null)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function CandidateRow({ candidate, busy, onAdd }: { candidate: Candidate; busy: boolean; onAdd: (role: Role) => void }) {
  const { person, suggested, evidence } = candidate
  const [role, setRole] = useState<Role>(suggested)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-800">{person.name}</span>
        {evidence && <span className="block text-[11px] text-slate-500">{evidence}</span>}
      </span>
      <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={cn(inputClass, "w-32 py-1")} aria-label={`${person.name} role`}>
        {ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
        ))}
      </select>
      <button type="button" disabled={busy} onClick={() => onAdd(role)} className={cn(secondaryButtonClass, "px-2 py-1")}>
        {busy ? <Spinner /> : <Plus className="h-4 w-4" />} Add
      </button>
    </div>
  )
}

/* ----------------------------------------------------------------- calendar */

function CalendarCard({
  team,
  isAdmin,
  sprintIssues,
  onChanged,
}: {
  team: TeamData
  isAdmin: boolean
  sprintIssues: IssueSummary[]
  onChanged: () => void
}) {
  const s = team.settings
  const [hours, setHours] = useState(String(s.defaultHoursPerDay))
  const [saturdays, setSaturdays] = useState<number[]>(s.saturdaysOff)
  const [buffer, setBuffer] = useState<Record<Role, string>>({ BE: String(s.bugBuffer.BE), FE: String(s.bugBuffer.FE), QA: String(s.bugBuffer.QA) })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const suggested = useMemo(() => bugShareByRole(sprintIssues, team), [sprintIssues, team])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await apiFetch("/api/team/settings", {
        method: "PUT",
        body: { defaultHoursPerDay: Number(hours), saturdaysOff: saturdays, bugBuffer: { BE: Number(buffer.BE), FE: Number(buffer.FE), QA: Number(buffer.QA) } },
      })
      setNotice({ ok: true, text: "Saved." })
      onChanged()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Working calendar and bug buffer</h2>
      <form onSubmit={save} className="mt-4 grid gap-6 md:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="default-hours" className="text-sm font-medium text-slate-700">Default hours per day</label>
          <input id="default-hours" type="number" min={1} max={16} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} disabled={!isAdmin} className={inputClass} />
          <p className="text-xs text-slate-500">Used for anyone without their own hours.</p>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Saturdays off</legend>
          <div className="flex flex-wrap gap-3 pt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={saturdays.includes(n)}
                  onChange={(e) => setSaturdays((cur) => (e.target.checked ? [...cur, n] : cur.filter((x) => x !== n)))}
                />
                {["1st", "2nd", "3rd", "4th", "5th"][n - 1]}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">Sundays and holidays are always off.</p>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Capacity held back for bugs</legend>
          {ROLES.map((r) => (
            <div key={r} className="flex items-center gap-2 text-sm">
              <span className="w-20 text-slate-600">{ROLE_LABEL[r]}</span>
              <input
                type="number"
                min={0}
                max={90}
                value={buffer[r]}
                disabled={!isAdmin}
                onChange={(e) => setBuffer((b) => ({ ...b, [r]: e.target.value }))}
                className={cn(inputClass, "w-20 py-1")}
                aria-label={`${ROLE_LABEL[r]} bug buffer percent`}
              />
              <span className="text-slate-500">%</span>
              <span className="text-xs text-slate-400">
                bugs are {suggested[r]}% of this sprint
                {isAdmin && suggested[r] !== Number(buffer[r]) && (
                  <button type="button" onClick={() => setBuffer((b) => ({ ...b, [r]: String(suggested[r]) }))} className="ml-1 text-sky-700 underline">
                    use
                  </button>
                )}
              </span>
            </div>
          ))}
        </fieldset>
        {isAdmin && (
          <div className="flex items-center gap-3 md:col-span-3">
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy && <Spinner className="text-white" />}
              Save calendar
            </button>
            <NoticeLine notice={notice} />
          </div>
        )}
      </form>
    </Card>
  )
}

/* -------------------------------------------------------------------- leave */

function LeaveCard({ team, onChanged }: { team: TeamData; onChanged: () => void }) {
  const today = todayIso()
  const [accountId, setAccountId] = useState("")
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [partial, setPartial] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const upcoming = team.leaves.filter((l) => l.end >= today)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const member = team.members.find((m) => m.accountId === accountId)
    if (!member) {
      setNotice({ ok: false, text: "Pick a person." })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await apiFetch("/api/team/leaves", {
        method: "POST",
        body: { accountId, name: member.name, start, end, hours: partial === "" ? null : Number(partial), note },
      })
      setNote("")
      setPartial("")
      setNotice({ ok: true, text: `Leave added for ${member.name}.` })
      onChanged()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/team/leaves?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      onChanged()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Leave</h2>
      <p className="mt-1 text-sm text-slate-500">Anyone can add leave for a team member.</p>
      {team.members.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Add people above first.</p>
      ) : (
        <form onSubmit={add} className="mt-4 grid grid-cols-2 gap-3">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={cn(inputClass, "col-span-2")} aria-label="Person" required>
            <option value="">Who is on leave?</option>
            {team.members.map((m) => (
              <option key={m.accountId} value={m.accountId}>{m.name}</option>
            ))}
          </select>
          <label className="space-y-1 text-xs text-slate-600">
            First day
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} required />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            Last day
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputClass} required />
          </label>
          <input
            type="number"
            min={0.5}
            max={16}
            step={0.5}
            value={partial}
            onChange={(e) => setPartial(e.target.value)}
            placeholder="Hours off per day (blank = full day)"
            className={inputClass}
            aria-label="Hours off per day"
          />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputClass} aria-label="Note" />
          <div className="col-span-2 flex items-center gap-3">
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy && <Spinner className="text-white" />}
              Add leave
            </button>
            <NoticeLine notice={notice} />
          </div>
        </form>
      )}
      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {upcoming.length === 0 && <li className="py-2 text-slate-400">No current or upcoming leave.</li>}
        {upcoming.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-slate-900">{l.name}</span>
              <span className="ml-2 text-slate-600">
                {fmtDate(l.start)}{l.end !== l.start && ` → ${fmtDate(l.end)}`}
                {l.hours !== null && ` · ${l.hours}h/day`}
              </span>
              {l.note && <span className="block truncate text-xs text-slate-500">{l.note}</span>}
            </span>
            <button type="button" onClick={() => remove(l.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Delete leave for ${l.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ----------------------------------------------------------------- holidays */

function HolidaysCard({ team, isAdmin, onChanged }: { team: TeamData; isAdmin: boolean; onChanged: () => void }) {
  const today = todayIso()
  const [date, setDate] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const upcoming = team.holidays.filter((h) => h.date >= today)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await apiFetch("/api/team/holidays", { method: "POST", body: { date, name } })
      setDate("")
      setName("")
      onChanged()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(d: string) {
    try {
      await apiFetch(`/api/team/holidays?date=${d}`, { method: "DELETE" })
      onChanged()
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Company holidays</h2>
      <p className="mt-1 text-sm text-slate-500">Nobody&apos;s capacity counts on these days.</p>
      {isAdmin && (
        <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, "w-40")} required aria-label="Holiday date" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" className={cn(inputClass, "min-w-0 flex-1")} required aria-label="Holiday name" />
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy && <Spinner className="text-white" />}
            Add
          </button>
        </form>
      )}
      <NoticeLine notice={notice} />
      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {upcoming.length === 0 && <li className="py-2 text-slate-400">No upcoming holidays.</li>}
        {upcoming.map((h) => (
          <li key={h.date} className="flex items-center gap-3 py-2">
            <span className="w-24 font-medium text-slate-900">{fmtDate(h.date)}</span>
            <span className="flex-1 text-slate-700">{h.name}</span>
            {isAdmin && (
              <button type="button" onClick={() => remove(h.date)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Delete ${h.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

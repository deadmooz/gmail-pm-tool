"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { PROJECTS, priorityRank, type IssueSummary, type Person } from "@/lib/jira-types"
import { Card } from "@/components/ui-kit"

const COLORS = { todo: "#94a3b8", inprogress: "#38bdf8", done: "#34d399", bar: "#0f172a" }

function ChartCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mb-4 text-xs text-slate-500">{caption}</p>
      {children}
    </Card>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-56 items-center justify-center text-sm text-slate-400">{text}</div>
}

export function StatusByProjectChart({ issues, caption }: { issues: IssueSummary[]; caption: string }) {
  const data = PROJECTS.map((p) => {
    const mine = issues.filter((i) => i.project === p)
    return {
      project: p,
      "To Do": mine.filter((i) => i.statusCategory === "todo").length,
      "In Progress": mine.filter((i) => i.statusCategory === "inprogress").length,
      Done: mine.filter((i) => i.statusCategory === "done").length,
    }
  })
  return (
    <ChartCard title="Status by project" caption={caption}>
      {issues.length === 0 ? (
        <Empty text="No issues to show." />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="project" tick={{ fontSize: 12 }} width={40} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="To Do" stackId="s" fill={COLORS.todo} />
            <Bar dataKey="In Progress" stackId="s" fill={COLORS.inprogress} />
            <Bar dataKey="Done" stackId="s" fill={COLORS.done} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

export function PeopleChart({
  open,
  pick,
  title,
  caption,
  emptyName,
}: {
  open: IssueSummary[]
  pick: (issue: IssueSummary) => Person | null
  title: string
  caption: string
  emptyName: string
}) {
  const counts = new Map<string, number>()
  open.forEach((i) => {
    const name = pick(i)?.name ?? emptyName
    counts.set(name, (counts.get(name) ?? 0) + 1)
  })
  const data = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  return (
    <ChartCard title={title} caption={caption}>
      {data.length === 0 ? (
        <Empty text="No open issues." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28 + 30)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={130} />
            <Tooltip />
            <Bar dataKey="count" name="Open issues" fill={COLORS.bar} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

export function PriorityChart({ open }: { open: IssueSummary[] }) {
  const counts = new Map<string, number>()
  open.forEach((i) => {
    const p = i.priority ?? "None"
    counts.set(p, (counts.get(p) ?? 0) + 1)
  })
  const data = [...counts.entries()]
    .map(([priority, count]) => ({ priority, count }))
    .sort((a, b) => priorityRank(a.priority === "None" ? null : a.priority) - priorityRank(b.priority === "None" ? null : b.priority))
  return (
    <ChartCard title="Not done, by priority" caption="Issues that aren't done yet">
      {data.length === 0 ? (
        <Empty text="No open issues." />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ left: -16, right: 8 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="priority" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" name="Open issues" fill={COLORS.bar} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

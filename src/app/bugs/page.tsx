import { JiraTable } from "@/components/JiraTable"

export default function BugsPage() {
  return (
    <JiraTable 
      type="bug"
      title="Bugs"
      description="Live bug reports fetched directly from your Jira workspace."
    />
  )
}

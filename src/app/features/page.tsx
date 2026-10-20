import { JiraTable } from "@/components/JiraTable"

export default function FeaturesPage() {
  return (
    <JiraTable 
      type="task"
      title="Tasks & Features"
      description="Live tasks and feature requests fetched directly from your Jira workspace."
    />
  )
}

"use client";

import { useState, useEffect } from "react";
import { ExternalLink, AlertCircle, RefreshCw } from "lucide-react";

interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  assignee: string;
  priority: string;
  created: string;
  url: string;
}

interface JiraTableProps {
  type: "bug" | "task";
  title: string;
  description: string;
}

export function JiraTable({ type, title, description }: JiraTableProps) {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  const fetchIssues = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jira/jql?type=${type}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch issues");
        if (!cancelled) setIssues(data.issues || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch issues");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, reloadKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-slate-500">{description}</p>
        </div>
        <button
          onClick={fetchIssues}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 flex items-start space-x-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">Error Loading Jira Issues</h3>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-sm mt-2 text-red-600">
              Make sure you have configured your Jira credentials and JQL query in the Settings page.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="rounded-xl border bg-white shadow-sm p-12 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-slate-300 animate-spin mb-4" />
          <p className="text-slate-500">Loading issues from Jira...</p>
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-xl border bg-white shadow-sm p-12 flex flex-col items-center justify-center">
          <p className="text-slate-500">No issues found for your JQL query.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b text-slate-600 font-medium">
                <tr>
                  <th className="px-6 py-4">Key</th>
                  <th className="px-6 py-4">Summary</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-blue-600 whitespace-nowrap">
                      <a href={issue.url} target="_blank" rel="noopener noreferrer" className="flex items-center hover:underline">
                        {issue.key}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </td>
                    <td className="px-6 py-4 text-slate-900 line-clamp-2 max-w-md">{issue.summary}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        {issue.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{issue.priority}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{issue.assignee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

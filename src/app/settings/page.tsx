"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [settings, setSettings] = useState({
    jiraDomain: "",
    jiraEmail: "",
    jiraApiToken: "",
    jiraBugJql: "",
    jiraTaskJql: "",
  });
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          const { hasJiraApiToken, ...rest } = data.settings;
          setSettings((prev) => ({ ...prev, ...rest }));
          setHasToken(Boolean(hasJiraApiToken));
        }
        setFetching(false);
      })
      .catch((err) => {
        console.error("Failed to load settings", err);
        setFetching(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const data = await res.json();
        setHasToken(Boolean(data.settings?.hasJiraApiToken));
        setSettings((prev) => ({ ...prev, jiraApiToken: "" }));
        alert("Settings saved successfully!");
      } else {
        alert("Failed to save settings.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while saving.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-8 text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-2">Manage your Jira integration.</p>
      </div>

      {/* Jira Settings */}
      <div className="rounded-xl border bg-white shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold border-b pb-2">Jira Integration</h2>
          <p className="text-sm text-slate-500 mt-1">Connect your Jira account to list bugs and tasks.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Jira Domain</label>
              <input
                type="text"
                name="jiraDomain"
                value={settings.jiraDomain}
                onChange={handleChange}
                placeholder="https://your-domain.atlassian.net"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Jira Email</label>
              <input
                type="email"
                name="jiraEmail"
                value={settings.jiraEmail}
                onChange={handleChange}
                placeholder="your.name@company.com"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700">Jira API Token</label>
            <input
              type="password"
              name="jiraApiToken"
              value={settings.jiraApiToken}
              onChange={handleChange}
              placeholder={hasToken ? "Saved — leave blank to keep the current token" : "Paste your Jira API Token"}
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Create this in your Atlassian Account Security settings.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-slate-700">JQL for Fetching Bugs</label>
              <textarea
                name="jiraBugJql"
                value={settings.jiraBugJql}
                onChange={handleChange}
                rows={3}
                placeholder="e.g. project = PM AND issuetype = Bug AND status != Done"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">JQL for Fetching Tasks</label>
              <textarea
                name="jiraTaskJql"
                value={settings.jiraTaskJql}
                onChange={handleChange}
                rows={3}
                placeholder="e.g. project = PM AND issuetype = Task AND status != Done"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

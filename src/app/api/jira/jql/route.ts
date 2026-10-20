import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const FIELDS = ["summary", "status", "assignee", "priority", "created"];

// Statuses that mean "this endpoint isn't available", so another API version is worth trying.
const UNSUPPORTED = new Set([404, 405, 410]);

interface JiraApiIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    assignee?: { displayName?: string } | null;
    priority?: { name?: string } | null;
    created?: string;
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = new URL(req.url).searchParams.get("type"); // 'bug' or 'task'

    if (type !== "bug" && type !== "task") {
      return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
    }

    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings?.jiraDomain || !settings?.jiraEmail || !settings?.jiraApiToken) {
      return NextResponse.json(
        { error: "Jira credentials are not configured in settings." },
        { status: 400 }
      );
    }

    const jql = type === "bug" ? settings.jiraBugJql : settings.jiraTaskJql;

    if (!jql) {
      return NextResponse.json(
        { error: `No JQL configured for ${type}s in settings.` },
        { status: 400 }
      );
    }

    let domain = settings.jiraDomain.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`;

    const credentials = Buffer.from(
      `${settings.jiraEmail}:${decryptSecret(settings.jiraApiToken)}`
    ).toString("base64");
    const headers = { Authorization: `Basic ${credentials}`, Accept: "application/json" };
    const jsonHeaders = { ...headers, "Content-Type": "application/json" };
    const payload = JSON.stringify({ jql, maxResults: 50, fields: FIELDS });

    // Try each API variant in turn, moving on only when the endpoint is unsupported.
    const attempts: Array<() => Promise<Response>> = [
      () => fetch(`${domain}/rest/api/2/search`, { method: "POST", headers: jsonHeaders, body: payload }),
      () =>
        fetch(
          `${domain}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=${FIELDS.join(",")}`,
          { method: "GET", headers }
        ),
      () => fetch(`${domain}/rest/api/3/search/jql`, { method: "POST", headers: jsonHeaders, body: payload }),
    ];

    let response!: Response;
    for (const attempt of attempts) {
      response = await attempt();
      if (response.ok || !UNSUPPORTED.has(response.status)) break;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Jira API error:", response.status, errorText);
      const message =
        response.status === 401 || response.status === 403
          ? "Jira rejected the credentials. Check your email and API token in Settings."
          : `Jira API Error ${response.status}: ${errorText.slice(0, 500)}`;
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const data = await response.json();
    const rawIssues: JiraApiIssue[] = data.issues || data.values || data.results || [];
    const total: number = data.total ?? data.totalCount ?? rawIssues.length;

    return NextResponse.json({ issues: mapJiraIssues(rawIssues, domain), total }, { status: 200 });
  } catch (error) {
    console.error("Error fetching from Jira:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function mapJiraIssues(issues: JiraApiIssue[], domain: string) {
  return issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields?.summary || "No summary",
    status: issue.fields?.status?.name || "Unknown",
    assignee: issue.fields?.assignee?.displayName || "Unassigned",
    priority: issue.fields?.priority?.name || "None",
    created: issue.fields?.created,
    url: `${domain}/browse/${issue.key}`,
  }));
}

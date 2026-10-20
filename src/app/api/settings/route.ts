import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Never send the stored API token to the browser; expose only whether one is set.
function toPublic(settings: {
  jiraDomain: string | null;
  jiraEmail: string | null;
  jiraApiToken: string | null;
  jiraBugJql: string | null;
  jiraTaskJql: string | null;
} | null) {
  return {
    jiraDomain: settings?.jiraDomain ?? "",
    jiraEmail: settings?.jiraEmail ?? "",
    jiraBugJql: settings?.jiraBugJql ?? "",
    jiraTaskJql: settings?.jiraTaskJql ?? "",
    hasJiraApiToken: Boolean(settings?.jiraApiToken),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ settings: toPublic(settings) }, { status: 200 });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const data: Record<string, string | null> = {
      jiraDomain: clean(body.jiraDomain),
      jiraEmail: clean(body.jiraEmail),
      jiraBugJql: clean(body.jiraBugJql),
      jiraTaskJql: clean(body.jiraTaskJql),
    };

    // An empty token field means "keep the existing token".
    const token = clean(body.jiraApiToken);
    if (token) data.jiraApiToken = encryptSecret(token);

    const updated = await prisma.settings.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { userId: session.user.id, ...data },
    });

    return NextResponse.json({ settings: toPublic(updated) }, { status: 200 });
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

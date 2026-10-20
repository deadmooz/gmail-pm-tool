import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import "./globals.css";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PM Intelligence",
  description: "Track Jira bugs and tasks in one place.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // All pages require a signed-in user; the sign-in page lives under /api/auth.
  const session = await getServerSession(authOptions);
  if (!session) redirect("/api/auth/signin");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex overflow-hidden bg-slate-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

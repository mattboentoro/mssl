import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { themeInitScript } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/authz";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Microsoft Soccer League (MSSL)",
    template: "%s · MSSL",
  },
  description:
    "Fixtures, results, standings and referee match reports for the Microsoft Soccer League.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col`}>
        <SiteHeader
          user={
            user
              ? {
                  name: user.name,
                  email: user.email,
                  isReferee: user.isReferee,
                  isAdmin: user.isAdmin,
                  isPlayer: user.isPlayer,
                  isCaptain: user.isCaptain,
                  isDevBypass: user.isDevBypass,
                }
              : null
          }
        />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

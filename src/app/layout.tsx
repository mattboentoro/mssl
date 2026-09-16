import type { Metadata } from "next";
import { Archivo, Archivo_Narrow, Geist_Mono } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/authz";

import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });
const archivoNarrow = Archivo_Narrow({ variable: "--font-archivo-narrow", subsets: ["latin"] });
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
    <html lang="en">
      <body
        className={`${archivo.variable} ${archivoNarrow.variable} ${geistMono.variable} flex min-h-screen flex-col`}
      >
        <SiteHeader
          user={
            user
              ? {
                  name: user.name,
                  email: user.email,
                  isReferee: user.isReferee,
                  isAdmin: user.isAdmin,
                  isDevBypass: user.isDevBypass,
                }
              : null
          }
        />
        <main id="main" className="site-width flex-1 py-8 sm:py-12">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

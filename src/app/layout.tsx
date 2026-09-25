import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "TaskTeens — Local jobs. Real experience. Built for teens.", template: "%s · TaskTeens" },
  description: "TaskTeens connects East Bay teenagers in Berkeley, Albany and El Cerrito with safe, legitimate work from local families and small businesses.",
  openGraph: { title: "TaskTeens — Bay Area Built", description: "Local jobs. Real experience. Built for teens.", type: "website", images: ["/hero-bay-sm.jpg"] },
  icons: { icon: [{ url: "/favicon.ico?v=2", sizes: "any" }, { url: "/icon.png?v=2", type: "image/png" }], apple: "/apple-icon.png?v=2" },
};

export const viewport: Viewport = { themeColor: "#0B1F3A", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:ital,wght@0,400;0,500;0,600;1,700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <DemoBanner />
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/components/providers/AppProviders";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { UpdateNotice } from "@/components/pwa/UpdateNotice";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Cookwise",
    template: "%s · Cookwise",
  },
  description:
    "Cook smarter, live healthier. Your personal cooking companion that measures, guides and adapts.",
  applicationName: "Cookwise",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cookwise",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f7f4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppProviders>
          <div className="app-shell">{children}</div>
          <ServiceWorkerRegister />
          {/* Mounted at the root so the install event, which fires once and
              early, is captured on whichever page the user lands on. */}
          <InstallPrompt />
          <UpdateNotice />
        </AppProviders>
      </body>
    </html>
  );
}

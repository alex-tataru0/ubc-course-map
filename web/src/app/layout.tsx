import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Links in the page's tags (like the preview image) are made absolute with this, since
  // sites that show link previews need a full URL.
  metadataBase: new URL("https://ubc-course-map.vercel.app"),
  title: "UBC Course Map",
  description: "Plan UBC courses with the prerequisite graph.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Vercel Web Analytics: counts page views, without cookies. It never sees the
            courses you tick, which stay in your browser. */}
        <Analytics />
      </body>
    </html>
  );
}

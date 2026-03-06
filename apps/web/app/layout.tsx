import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import AuthHashCleanup from "@/components/AuthHashCleanup";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "JanSamadhan",
  description:
    "JanSamadhan is a public grievance platform to report civic issues, track complaint status, and connect citizens with the right local authorities.",
  openGraph: {
    title: "JanSamadhan",
    description:
      "Report civic issues, track complaint progress, and get connected to the correct department with JanSamadhan.",
    siteName: "JanSamadhan",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "JanSamadhan",
    description:
      "A civic issue reporting and complaint-tracking platform for citizens and authorities.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased`}>
        <ThemeProvider>
          <AuthHashCleanup />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

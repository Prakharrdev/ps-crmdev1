import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
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
  metadataBase: new URL("https://jansamadhan.perkkk.dev"),
  title: "Jan Samadhan | Delhi's Public Grievance Portal | Jansamadhan",
  description:
    "Jan Samadhan (Jansamadhan) is Delhi's centralized public grievance platform. Report civic issues, track complaint status, and connect with local authorities in India.",
  keywords: [
    "Jan Samadhan",
    "Jansamadhan",
    "Jan Samadhan Delhi",
    "Public Grievance Portal India",
    "Complaint Tracking System",
    "Civic Issues Delhi",
    "Jan Samadhan Status",
  ],
  alternates: {
    canonical: "https://jansamadhan.perkkk.dev",
  },
  openGraph: {
    title: "Jan Samadhan | Delhi's Public Grievance Portal",
    description:
      "Official Jan Samadhan (Jansamadhan) platform for citizens to report and track civic issues in Delhi, India.",
    url: "https://jansamadhan.perkkk.dev",
    siteName: "JanSamadhan",
    images: [
      {
        url: "https://jansamadhan.perkkk.dev/icon.png",
        width: 800,
        height: 600,
        alt: "Jan Samadhan Emblem",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jan Samadhan | Delhi's Public Grievance Portal",
    description:
      "Report civic issues, track progress, and build a better Delhi with Jan Samadhan.",
    images: ["https://jansamadhan.perkkk.dev/icon.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentOrganization",
    name: "Jan Samadhan Delhi",
    url: "https://jansamadhan.perkkk.dev",
    logo: "https://jansamadhan.perkkk.dev/icon.png",
    address: {
      "@type": "PostalAddress",
      addressLocality: "New Delhi",
      addressRegion: "Delhi",
      addressCountry: "India",
    },
    serviceType: "Public Grievance Redressal",
    areaServed: "Delhi",
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

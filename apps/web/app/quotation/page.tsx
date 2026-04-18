import type { Metadata } from "next";
import QuotationClient from "./QuotationClient";

export const metadata: Metadata = {
  title: "JanSamadhan Quotation | Citizen Resolution Platform",
  description:
    "Detailed project quotation for JanSamadhan, including scope, technical architecture, timeline, and scale-based cost model.",
  alternates: {
    canonical: "https://jansamadhan.perkkk.dev/quotation",
  },
  openGraph: {
    title: "JanSamadhan Quotation",
    description:
      "Detailed quotation and delivery model for the JanSamadhan civic grievance platform.",
    url: "https://jansamadhan.perkkk.dev/quotation",
    siteName: "JanSamadhan",
    locale: "en_IN",
    type: "website",
  },
};

export default function QuotationPage() {
  return <QuotationClient />;
}

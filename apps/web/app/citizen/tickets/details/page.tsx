import { Suspense } from "react";
import TicketDetailClient from "./_components/TicketDetailClient";
import { createClient } from "@/src/lib/supabase/server";
import { Metadata } from "next";

export async function generateMetadata(
  props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
  }
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const id = searchParams.id as string;
  if (!id) return { title: "Ticket Details | JanSamadhan" };

  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("complaints")
    .select("title, description, photo_urls, ticket_id")
    .eq("id", id)
    .single();

  if (!ticket) return { title: "Ticket Not Found | JanSamadhan" };

  const firstPhoto = ticket.photo_urls?.[0];
  const image = firstPhoto && firstPhoto.startsWith("http") 
    ? firstPhoto 
    : "https://jansamadhan.perkkk.dev/icon.png";
  
  return {
    title: `${ticket.title} | JanSamadhan`,
    description: ticket.description || `View details for ticket ${ticket.ticket_id} on JanSamadhan.`,
    openGraph: {
      title: ticket.title || "Civic Issue Details",
      description: ticket.description || "Track and upvote civic issues in Delhi.",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: ticket.title || "Civic Issue",
        }
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ticket.title || "Civic Issue Details",
      description: ticket.description || "Track and upvote civic issues in Delhi.",
      images: [image],
    },
  };
}

export default function TicketDetailsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-[#161616]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
      </div>
    }>
      <TicketDetailClient />
    </Suspense>
  );
}

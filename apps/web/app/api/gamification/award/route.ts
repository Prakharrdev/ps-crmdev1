import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gamificationService, GAMIFICATION_CONFIG } from "@/src/lib/gamification";
import type { Database } from "@/src/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticket_id, userId } = body;

    if (!ticket_id || !userId) {
      return NextResponse.json({ error: "Missing ticket_id or userId" }, { status: 400 });
    }

    console.log(`[Gamification/Award] Attempting to award points for ticket: ${ticket_id} to user: ${userId}`);

    // 1. Verify the ticket exists and belongs to the user
    // This provides a basic security check to prevent spoofing
    const { data: ticket, error: ticketError } = await supabase
      .from('complaints')
      .select('citizen_id, id')
      .eq('ticket_id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      // If not found by ticket_id, try by internal ID (some flows return UUID)
      const { data: ticketById } = await supabase
        .from('complaints')
        .select('citizen_id, id')
        .eq('id', ticket_id)
        .single();
        
      if (!ticketById) {
        console.error(`[Gamification/Award] Ticket ${ticket_id} not found.`);
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }
      
      if (ticketById.citizen_id !== userId) {
        return NextResponse.json({ error: "Unauthorized: Ticket owner mismatch" }, { status: 403 });
      }
    } else if (ticket.citizen_id !== userId) {
      return NextResponse.json({ error: "Unauthorized: Ticket owner mismatch" }, { status: 403 });
    }

    // 2. Award points
    // Note: awardPoints currently handles the wallet existence check
    const result = await gamificationService.awardPoints(userId, GAMIFICATION_CONFIG.POINTS_TICKET_CREATION, 'ticket_creation');

    if (!result.success) {
      return NextResponse.json({ error: "Failed to award points", details: result.error }, { status: 500 });
    }

    console.log(`[Gamification/Award] Successfully awarded points for ticket ${ticket_id}`);
    return NextResponse.json({ 
      success: true, 
      points_awarded: GAMIFICATION_CONFIG.POINTS_TICKET_CREATION,
      new_balance: (result.data as any)?.points_balance 
    });

  } catch (err) {
    console.error("[Gamification/Award] Unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

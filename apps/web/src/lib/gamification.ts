import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

export const GAMIFICATION_CONFIG = {
  POINTS_LOGIN_BONUS: 100,
  POINTS_TICKET_CREATION: 10,
  UPVOTE_THRESHOLD: 5,
  POINTS_UPVOTE_MILESTONE: 50,
  POINTS_SPAM_PENALTY: -100,
};

export type GamificationReason = 
  | 'login_bonus' 
  | 'ticket_creation' 
  | 'upvote_milestone' 
  | 'spam_penalty'
  | 'other';

export const gamificationService = {
  /**
   * Awards points to a user via the award_points RPC.
   * Ensures the user has a wallet first.
   */
  async awardPoints(userId: string, points: number, reason: GamificationReason = 'other') {
    try {
      console.log(`[Gamification] Awarding ${points} points to ${userId} for reason: ${reason}`);
      
      // Ensure the wallet exists before awarding points
      await this.ensureWalletExists(userId);
      
      const { data, error } = await supabase.rpc('award_points', {
        p_points: points,
        p_user_id: userId,
      });

      if (error) {
        console.error(`[Gamification] RPC Error awarding points to ${userId}:`, JSON.stringify(error, null, 2));
        return { success: false, error };
      }

      return { success: true, data };
    } catch (err) {
      console.error(`[Gamification] Unexpected error awarding points to ${userId}:`, err);
      return { success: false, error: err };
    }
  },

  /**
   * Ensures a row exists in the gamification_wallets table for the user.
   */
  async ensureWalletExists(userId: string) {
    try {
      const { error } = await supabase
        .from('gamification_wallets')
        .upsert({ 
          user_id: userId,
          points_balance: 0,
          lifetime_earned: 0,
          lifetime_spent: 0
        }, { onConflict: 'user_id' });

      if (error) {
        console.warn(`[Gamification] Error in upsert wallet for ${userId}:`, error.message);
      }
    } catch (err) {
      console.error(`[Gamification] Unexpected error ensuring wallet for ${userId}:`, err);
    }
  },

  /**
   * Checks if a complaint has reached exactly the upvote threshold.
   * This is used to award points only once at a specific milestone.
   */
  async handleUpvoteMilestone(complaintId: string, citizenId: string, currentUpvoteCount: number) {
    if (currentUpvoteCount === GAMIFICATION_CONFIG.UPVOTE_THRESHOLD) {
      return this.awardPoints(citizenId, GAMIFICATION_CONFIG.POINTS_UPVOTE_MILESTONE, 'upvote_milestone');
    }
    return null;
  },

  /**
   * Penalizes a user for spam and increments their spam strike count.
   */
  async handleSpamPenalty(userId: string) {
    // 1. Deduct points
    const pointResult = await this.awardPoints(userId, GAMIFICATION_CONFIG.POINTS_SPAM_PENALTY, 'spam_penalty');
    
    // 2. Increment spam strikes in profiles
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('spam_strikes')
        .eq('id', userId)
        .single();

      const currentStrikes = profile?.spam_strikes ?? 0;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          spam_strikes: currentStrikes + 1,
          is_blocked: currentStrikes + 1 >= 5 // Example: auto-block at 5 strikes
        })
        .eq('id', userId);

      if (updateError) {
        console.error(`[Gamification] Error incrementing spam strikes for ${userId}:`, updateError);
      }
    } catch (err) {
      console.error(`[Gamification] Unexpected error in handleSpamPenalty for ${userId}:`, err);
    }

    return pointResult;
  }
};

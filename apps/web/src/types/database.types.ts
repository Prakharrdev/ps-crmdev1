export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          authority_code: string | null
          authority_full: string | null
          default_severity: string | null
          department: string
          icon: string | null
          id: number
          is_active: boolean
          name: string
          name_hindi: string | null
          parent_id: number | null
          sort_order: number | null
          zone: string | null
        }
        Insert: {
          authority_code?: string | null
          authority_full?: string | null
          default_severity?: string | null
          department: string
          icon?: string | null
          id?: number
          is_active?: boolean
          name: string
          name_hindi?: string | null
          parent_id?: number | null
          sort_order?: number | null
          zone?: string | null
        }
        Update: {
          authority_code?: string | null
          authority_full?: string | null
          default_severity?: string | null
          department?: string
          icon?: string | null
          id?: number
          is_active?: boolean
          name?: string
          name_hindi?: string | null
          parent_id?: number | null
          sort_order?: number | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          address_text: string | null
          assigned_department: string | null
          assigned_officer_id: string | null
          category_id: number
          citizen_id: string
          created_at: string
          description: string
          digipin: string | null
          effective_severity: string
          escalation_level: number
          id: string
          is_spam: boolean
          location: unknown
          photo_count: number | null
          photo_urls: string[] | null
          pincode: string | null
          resolution_note: string | null
          resolved_at: string | null
          severity: string
          sla_breached: boolean
          sla_deadline: string | null
          status: string
          ticket_id: string
          title: string
          updated_at: string
          upvote_boost: number
          upvote_count: number
          ward_name: string | null
        }
        Insert: {
          address_text?: string | null
          assigned_department?: string | null
          assigned_officer_id?: string | null
          category_id: number
          citizen_id: string
          created_at?: string
          description: string
          digipin?: string | null
          effective_severity?: string
          escalation_level?: number
          id?: string
          is_spam?: boolean
          location: unknown
          photo_count?: number | null
          photo_urls?: string[] | null
          pincode?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string
          sla_breached?: boolean
          sla_deadline?: string | null
          status?: string
          ticket_id: string
          title: string
          updated_at?: string
          upvote_boost?: number
          upvote_count?: number
          ward_name?: string | null
        }
        Update: {
          address_text?: string | null
          assigned_department?: string | null
          assigned_officer_id?: string | null
          category_id?: number
          citizen_id?: string
          created_at?: string
          description?: string
          digipin?: string | null
          effective_severity?: string
          escalation_level?: number
          id?: string
          is_spam?: boolean
          location?: unknown
          photo_count?: number | null
          photo_urls?: string[] | null
          pincode?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string
          sla_breached?: boolean
          sla_deadline?: string | null
          status?: string
          ticket_id?: string
          title?: string
          updated_at?: string
          upvote_boost?: number
          upvote_count?: number
          ward_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_assigned_officer_id_fkey"
            columns: ["assigned_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aadhar_hash: string | null
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          is_blocked: boolean
          kyc_verified: boolean
          phone: string | null
          role: string
          spam_strikes: number
          updated_at: string
        }
        Insert: {
          aadhar_hash?: string | null
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id: string
          is_blocked?: boolean
          kyc_verified?: boolean
          phone?: string | null
          role?: string
          spam_strikes?: number
          updated_at?: string
        }
        Update: {
          aadhar_hash?: string | null
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          kyc_verified?: boolean
          phone?: string | null
          role?: string
          spam_strikes?: number
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          citizen_id: string
          complaint_id: string
          created_at: string
          feedback: string | null
          id: string
          rating: number
        }
        Insert: {
          citizen_id: string
          complaint_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          rating: number
        }
        Update: {
          citizen_id?: string
          complaint_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: true
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      seva_queries: {
        Row: {
          created_at: string
          id: string
          intent: string | null
          query_text: string
          response_tokens: number | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          intent?: string | null
          query_text: string
          response_tokens?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          intent?: string | null
          query_text?: string
          response_tokens?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seva_queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_history: {
        Row: {
          changed_by: string
          complaint_id: string
          created_at: string
          id: string
          is_internal: boolean
          new_status: string
          note: string | null
          old_status: string | null
        }
        Insert: {
          changed_by: string
          complaint_id: string
          created_at?: string
          id?: string
          is_internal?: boolean
          new_status: string
          note?: string | null
          old_status?: string | null
        }
        Update: {
          changed_by?: string
          complaint_id?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          new_status?: string
          note?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_history_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      upvotes: {
        Row: {
          citizen_id: string
          complaint_id: string
          created_at: string
          id: string
        }
        Insert: {
          citizen_id: string
          complaint_id: string
          created_at?: string
          id?: string
        }
        Update: {
          citizen_id?: string
          complaint_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upvotes_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upvotes_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_for_duplicate_report: {
        Args: { p_category_id: number; p_lat: number; p_lng: number }
        Returns: {
          distance_meters: number
          id: string
          status: string
          ticket_id: string
          title: string
          upvote_count: number
        }[]
      }
      get_category_breakdown: {
        Args: never
        Returns: {
          category: string
          count: number
        }[]
      }
      get_monthly_trend: {
        Args: { p_months?: number }
        Returns: {
          month: string
          resolved: number
          submitted: number
        }[]
      }
      get_nearby_complaints: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          category_id: number
          created_at: string
          distance_meters: number
          id: string
          severity: string
          status: string
          ticket_id: string
          title: string
          upvote_count: number
        }[]
      }
      increment_upvote_count: {
        Args: { p_complaint_id: string }
        Returns: undefined
      }
      recalculate_severity: {
        Args: { p_complaint_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

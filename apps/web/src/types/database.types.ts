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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      cctv_analysis_logs: {
        Row: {
          ai_metadata: Json | null
          camera_id: string | null
          complaint_id: string | null
          created_at: string | null
          id: string
          status_result: string | null
        }
        Insert: {
          ai_metadata?: Json | null
          camera_id?: string | null
          complaint_id?: string | null
          created_at?: string | null
          id?: string
          status_result?: string | null
        }
        Update: {
          ai_metadata?: Json | null
          camera_id?: string | null
          complaint_id?: string | null
          created_at?: string | null
          id?: string
          status_result?: string | null
        }
        Relationships: []
      }
      cctv_cameras: {
        Row: {
          created_at: string | null
          digipin: string | null
          generated_ticket_id: string | null
          id: string
          last_status: string | null
          latitude: number
          longitude: number
          name: string
          road_type: string
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          digipin?: string | null
          generated_ticket_id?: string | null
          id?: string
          last_status?: string | null
          latitude: number
          longitude: number
          name: string
          road_type: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          digipin?: string | null
          generated_ticket_id?: string | null
          id?: string
          last_status?: string | null
          latitude?: number
          longitude?: number
          name?: string
          road_type?: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      complaints: {
        Row: {
          address_text: string | null
          assigned_department: string | null
          assigned_officer_id: string | null
          assigned_worker_id: string | null
          camera_id: string | null
          category_id: number
          cctv_verification_status: string | null
          cctv_verified_at: string | null
          citizen_id: string | null
          city: string
          created_at: string
          description: string
          digipin: string | null
          effective_severity: Database["public"]["Enums"]["severity_level"]
          escalation_level: number
          id: string
          is_spam: boolean
          location: unknown
          photo_count: number | null
          photo_urls: string[] | null
          pincode: string | null
          possible_duplicate: boolean
          rejection_reason: string | null
          reopen_count: number
          reopen_deadline: string | null
          resolution_note: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          sla_breached: boolean
          sla_deadline: string | null
          source: Database["public"]["Enums"]["complaint_source"] | null
          status: Database["public"]["Enums"]["complaint_status"]
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
          assigned_worker_id?: string | null
          camera_id?: string | null
          category_id: number
          cctv_verification_status?: string | null
          cctv_verified_at?: string | null
          citizen_id?: string | null
          city?: string
          created_at?: string
          description: string
          digipin?: string | null
          effective_severity?: Database["public"]["Enums"]["severity_level"]
          escalation_level?: number
          id?: string
          is_spam?: boolean
          location: unknown
          photo_count?: number | null
          photo_urls?: string[] | null
          pincode?: string | null
          possible_duplicate?: boolean
          rejection_reason?: string | null
          reopen_count?: number
          reopen_deadline?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          sla_breached?: boolean
          sla_deadline?: string | null
          source?: Database["public"]["Enums"]["complaint_source"] | null
          status?: Database["public"]["Enums"]["complaint_status"]
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
          assigned_worker_id?: string | null
          camera_id?: string | null
          category_id?: number
          cctv_verification_status?: string | null
          cctv_verified_at?: string | null
          citizen_id?: string | null
          city?: string
          created_at?: string
          description?: string
          digipin?: string | null
          effective_severity?: Database["public"]["Enums"]["severity_level"]
          escalation_level?: number
          id?: string
          is_spam?: boolean
          location?: unknown
          photo_count?: number | null
          photo_urls?: string[] | null
          pincode?: string | null
          possible_duplicate?: boolean
          rejection_reason?: string | null
          reopen_count?: number
          reopen_deadline?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          sla_breached?: boolean
          sla_deadline?: string | null
          source?: Database["public"]["Enums"]["complaint_source"] | null
          status?: Database["public"]["Enums"]["complaint_status"]
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
            foreignKeyName: "complaints_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cctv_cameras"
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
      detections_telemetry: {
        Row: {
          camera_id: string | null
          confidence: number
          digipin: string
          id: string
          timestamp: string | null
        }
        Insert: {
          camera_id?: string | null
          confidence: number
          digipin: string
          id?: string
          timestamp?: string | null
        }
        Update: {
          camera_id?: string | null
          confidence?: number
          digipin?: string
          id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "detections_telemetry_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "cctv_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_wallets: {
        Row: {
          lifetime_earned: number
          lifetime_spent: number
          points_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          lifetime_earned?: number
          lifetime_spent?: number
          points_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          lifetime_earned?: number
          lifetime_spent?: number
          points_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_collector_samples: {
        Row: {
          actor_id: string | null
          camera_id: string | null
          category_id: number | null
          complaint_id: string
          created_at: string
          dedup_key: string
          digipin: string | null
          event_type: string
          export_batch_id: string | null
          exported_at: string | null
          id: number
          invalidated_at: string | null
          invalidation_reason: string | null
          is_active: boolean
          is_exported: boolean
          label_source: string
          metadata: Json
          proof_photo_url: string | null
          severity: string | null
          source_image_ref: string | null
          target_bucket: string
          ticket_id: string | null
        }
        Insert: {
          actor_id?: string | null
          camera_id?: string | null
          category_id?: number | null
          complaint_id: string
          created_at?: string
          dedup_key: string
          digipin?: string | null
          event_type: string
          export_batch_id?: string | null
          exported_at?: string | null
          id?: number
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_active?: boolean
          is_exported?: boolean
          label_source?: string
          metadata?: Json
          proof_photo_url?: string | null
          severity?: string | null
          source_image_ref?: string | null
          target_bucket: string
          ticket_id?: string | null
        }
        Update: {
          actor_id?: string | null
          camera_id?: string | null
          category_id?: number | null
          complaint_id?: string
          created_at?: string
          dedup_key?: string
          digipin?: string | null
          event_type?: string
          export_batch_id?: string | null
          exported_at?: string | null
          id?: number
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_active?: boolean
          is_exported?: boolean
          label_source?: string
          metadata?: Json
          proof_photo_url?: string | null
          severity?: string | null
          source_image_ref?: string | null
          target_bucket?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_collector_samples_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requests: {
        Row: {
          complaint_id: string
          created_at: string | null
          id: string
          material_id: string
          notes: string | null
          requested_quantity: number
          status: string
          updated_at: string | null
          worker_id: string
        }
        Insert: {
          complaint_id: string
          created_at?: string | null
          id?: string
          material_id: string
          notes?: string | null
          requested_quantity: number
          status?: string
          updated_at?: string | null
          worker_id: string
        }
        Update: {
          complaint_id?: string
          created_at?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          requested_quantity?: number
          status?: string
          updated_at?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "warehouse_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_worker_id_fkey"
            columns: ["worker_id"]
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
          city: string | null
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
          whatsapp_link_code: string | null
        }
        Insert: {
          aadhar_hash?: string | null
          avatar_url?: string | null
          city?: string | null
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
          whatsapp_link_code?: string | null
        }
        Update: {
          aadhar_hash?: string | null
          avatar_url?: string | null
          city?: string | null
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
          whatsapp_link_code?: string | null
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
          worker_id: string | null
        }
        Insert: {
          citizen_id: string
          complaint_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          rating: number
          worker_id?: string | null
        }
        Update: {
          citizen_id?: string
          complaint_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: number
          worker_id?: string | null
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
          {
            foreignKeyName: "reviews_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      reward_catalog: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          per_user_limit: number
          points_cost: number
          stock_remaining: number | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          per_user_limit?: number
          points_cost: number
          stock_remaining?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          per_user_limit?: number
          points_cost?: number
          stock_remaining?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          created_at: string
          id: string
          points_spent: number
          reward_id: string
          status: string
          user_id: string
          voucher_code: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          points_spent: number
          reward_id: string
          status?: string
          user_id: string
          voucher_code?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          points_spent?: number
          reward_id?: string
          status?: string
          user_id?: string
          voucher_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      suspected_incidents: {
        Row: {
          detection_count: number | null
          digipin: string
          first_detected: string | null
          last_camera_id: string | null
          last_detected: string | null
          max_confidence: number
          status: string
        }
        Insert: {
          detection_count?: number | null
          digipin: string
          first_detected?: string | null
          last_camera_id?: string | null
          last_detected?: string | null
          max_confidence: number
          status: string
        }
        Update: {
          detection_count?: number | null
          digipin?: string
          first_detected?: string | null
          last_camera_id?: string | null
          last_detected?: string | null
          max_confidence?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "suspected_incidents_last_camera_id_fkey"
            columns: ["last_camera_id"]
            isOneToOne: false
            referencedRelation: "cctv_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_history: {
        Row: {
          changed_by: string | null
          complaint_id: string
          created_at: string
          id: string
          is_internal: boolean
          new_status: string
          note: string | null
          old_status: string | null
        }
        Insert: {
          changed_by?: string | null
          complaint_id: string
          created_at?: string
          id?: string
          is_internal?: boolean
          new_status: string
          note?: string | null
          old_status?: string | null
        }
        Update: {
          changed_by?: string | null
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
      user_mapping: {
        Row: {
          email: string
          new_id: string | null
          old_id: string | null
        }
        Insert: {
          email: string
          new_id?: string | null
          old_id?: string | null
        }
        Update: {
          email?: string
          new_id?: string | null
          old_id?: string | null
        }
        Relationships: []
      }
      warehouse_inventory: {
        Row: {
          available_quantity: number
          created_at: string | null
          description: string | null
          id: string
          name: string
          unit: string
          updated_at: string | null
        }
        Insert: {
          available_quantity?: number
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          unit: string
          updated_at?: string | null
        }
        Update: {
          available_quantity?: number
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          unit?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      worker_profiles: {
        Row: {
          availability: string
          average_rating: number | null
          city: string
          current_complaint_id: string | null
          department: string
          joined_at: string
          last_location: unknown
          total_resolved: number
          total_reviews: number | null
          worker_id: string
        }
        Insert: {
          availability: string
          average_rating?: number | null
          city?: string
          current_complaint_id?: string | null
          department: string
          joined_at?: string
          last_location?: unknown
          total_resolved?: number
          total_reviews?: number | null
          worker_id: string
        }
        Update: {
          availability?: string
          average_rating?: number | null
          city?: string
          current_complaint_id?: string | null
          department?: string
          joined_at?: string
          last_location?: unknown
          total_resolved?: number
          total_reviews?: number | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_current_complaint_id_fkey"
            columns: ["current_complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_all_time: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          points: number | null
          rank: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gamification_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_worker_to_complaint: {
        Args: {
          p_admin_id: string
          p_complaint_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      award_points: {
        Args: { p_points: number; p_user_id: string }
        Returns: Json
      }
      check_for_duplicate_report:
        | {
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
        | {
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
      check_sla_breaches: { Args: never; Returns: number }
      decrement_upvote_count: {
        Args: { p_complaint_id: string }
        Returns: undefined
      }
      find_duplicate_complaints_v2: {
        Args: {
          p_active_statuses: string[]
          p_category_id: number
          p_digipin: string
          p_lat: number
          p_lng: number
          p_radius: number
        }
        Returns: {
          address_text: string | null
          assigned_department: string | null
          assigned_officer_id: string | null
          assigned_worker_id: string | null
          camera_id: string | null
          category_id: number
          cctv_verification_status: string | null
          cctv_verified_at: string | null
          citizen_id: string | null
          city: string
          created_at: string
          description: string
          digipin: string | null
          effective_severity: Database["public"]["Enums"]["severity_level"]
          escalation_level: number
          id: string
          is_spam: boolean
          location: unknown
          photo_count: number | null
          photo_urls: string[] | null
          pincode: string | null
          possible_duplicate: boolean
          rejection_reason: string | null
          reopen_count: number
          reopen_deadline: string | null
          resolution_note: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          sla_breached: boolean
          sla_deadline: string | null
          source: Database["public"]["Enums"]["complaint_source"] | null
          status: Database["public"]["Enums"]["complaint_status"]
          ticket_id: string
          title: string
          updated_at: string
          upvote_boost: number
          upvote_count: number
          ward_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "complaints"
          isOneToOne: false
          isSetofReturn: true
        }
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
      get_nearby_complaints:
        | {
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
        | {
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
      nearest_urgent_complaint:
        | {
            Args: { worker_lat: number; worker_lng: number }
            Returns: {
              address_text: string
              distance_m: number
              effective_severity: string
              id: string
              lat: number
              lng: number
              title: string
            }[]
          }
        | {
            Args: { worker_location: unknown }
            Returns: {
              address_text: string
              effective_severity: string
              id: string
              lat: number
              lng: number
              title: string
            }[]
          }
      recalculate_severity: {
        Args: { p_complaint_id: string }
        Returns: undefined
      }
      redeem_reward: {
        Args: { p_reward_id: string; p_user_id: string }
        Returns: Json
      }
      update_complaint_status_citizen: {
        Args: { p_citizen_id: string; p_complaint_id: string; p_status: string }
        Returns: Json
      }
    }
    Enums: {
      complaint_source: "citizen" | "system"
      complaint_status:
        | "submitted"
        | "under_review"
        | "assigned"
        | "in_progress"
        | "pending_closure"
        | "resolved"
        | "rejected"
        | "escalated"
        | "reopened"
        | "spam"
      severity_level: "L1" | "L2" | "L3" | "L4"
      worker_availability: "available" | "busy" | "inactive"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      complaint_source: ["citizen", "system"],
      complaint_status: [
        "submitted",
        "under_review",
        "assigned",
        "in_progress",
        "pending_closure",
        "resolved",
        "rejected",
        "escalated",
        "reopened",
        "spam",
      ],
      severity_level: ["L1", "L2", "L3", "L4"],
      worker_availability: ["available", "busy", "inactive"],
    },
  },
} as const

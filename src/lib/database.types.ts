export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      automation_settings: {
        Row: {
          allowed_symbols: string[]
          enabled: boolean
          max_orders_per_day: number
          max_position_usd: number
          min_confidence: number
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_symbols?: string[]
          enabled?: boolean
          max_orders_per_day?: number
          max_position_usd?: number
          min_confidence?: number
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_symbols?: string[]
          enabled?: boolean
          max_orders_per_day?: number
          max_position_usd?: number
          min_confidence?: number
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_accounts: {
        Row: {
          broker: string
          created_at: string
          id: string
          is_active: boolean
          key_secret_id: string | null
          label: string | null
          mode: string
          secret_secret_id: string | null
          user_id: string
        }
        Insert: {
          broker?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key_secret_id?: string | null
          label?: string | null
          mode: string
          secret_secret_id?: string | null
          user_id: string
        }
        Update: {
          broker?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key_secret_id?: string | null
          label?: string | null
          mode?: string
          secret_secret_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      data_source_installations: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          schedule: string | null
          skill_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          schedule?: string | null
          skill_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          schedule?: string | null
          skill_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_source_installations_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "data_source_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      data_source_skills: {
        Row: {
          author_id: string | null
          config_schema: Json
          created_at: string
          description: string | null
          id: string
          is_builtin: boolean
          name: string
          pipeline: Json
          signal_kind: string
          slug: string
          updated_at: string
          version: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          config_schema?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_builtin?: boolean
          name: string
          pipeline?: Json
          signal_kind?: string
          slug: string
          updated_at?: string
          version?: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          config_schema?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
          pipeline?: Json
          signal_kind?: string
          slug?: string
          updated_at?: string
          version?: string
          visibility?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          created_at: string
          id: string
          mode: string
          model: string | null
          prompt: string | null
          response: Json | null
          signal_snapshot_id: string | null
          symbols: string[]
          system_prompt: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          model?: string | null
          prompt?: string | null
          response?: Json | null
          signal_snapshot_id?: string | null
          symbols?: string[]
          system_prompt?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          model?: string | null
          prompt?: string | null
          response?: Json | null
          signal_snapshot_id?: string | null
          symbols?: string[]
          system_prompt?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_signal_snapshot_id_fkey"
            columns: ["signal_snapshot_id"]
            isOneToOne: false
            referencedRelation: "signal_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          order_id: string
          payload: Json
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          order_id: string
          payload?: Json
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string
          payload?: Json
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          broker: string
          broker_order_id: string | null
          created_at: string
          decision_id: string | null
          fees: number
          filled_avg_price: number | null
          filled_qty: number
          id: string
          limit_price: number | null
          mode: string
          qty: number
          recommendation_id: string | null
          side: string
          source: string
          status: string
          submitted_at: string | null
          symbol: string
          time_in_force: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          broker?: string
          broker_order_id?: string | null
          created_at?: string
          decision_id?: string | null
          fees?: number
          filled_avg_price?: number | null
          filled_qty?: number
          id?: string
          limit_price?: number | null
          mode: string
          qty: number
          recommendation_id?: string | null
          side: string
          source?: string
          status?: string
          submitted_at?: string | null
          symbol: string
          time_in_force?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          broker?: string
          broker_order_id?: string | null
          created_at?: string
          decision_id?: string | null
          fees?: number
          filled_avg_price?: number | null
          filled_qty?: number
          id?: string
          limit_price?: number | null
          mode?: string
          qty?: number
          recommendation_id?: string | null
          side?: string
          source?: string
          status?: string
          submitted_at?: string | null
          symbol?: string
          time_in_force?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_snapshots: {
        Row: {
          cash: number | null
          created_at: string
          equity: number | null
          id: string
          mode: string
          positions: Json
          user_id: string
        }
        Insert: {
          cash?: number | null
          created_at?: string
          equity?: number | null
          id?: string
          mode: string
          positions?: Json
          user_id: string
        }
        Update: {
          cash?: number | null
          created_at?: string
          equity?: number | null
          id?: string
          mode?: string
          positions?: Json
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_entry_price: number
          id: string
          mode: string
          qty: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_entry_price?: number
          id?: string
          mode: string
          qty?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_entry_price?: number
          id?: string
          mode?: string
          qty?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_mode: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active_mode?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active_mode?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          action: string
          confidence: number | null
          created_at: string
          decision_id: string
          id: string
          order_id: string | null
          rationale: string | null
          status: string
          supporting_signals: Json
          symbol: string
          target_qty: number | null
          user_id: string
        }
        Insert: {
          action: string
          confidence?: number | null
          created_at?: string
          decision_id: string
          id?: string
          order_id?: string | null
          rationale?: string | null
          status?: string
          supporting_signals?: Json
          symbol: string
          target_qty?: number | null
          user_id: string
        }
        Update: {
          action?: string
          confidence?: number | null
          created_at?: string
          decision_id?: string
          id?: string
          order_id?: string | null
          rationale?: string | null
          status?: string
          supporting_signals?: Json
          symbol?: string
          target_qty?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_snapshots: {
        Row: {
          created_at: string
          id: string
          meta: Json
          mode: string
          prices: Json
          signals: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta?: Json
          mode?: string
          prices?: Json
          signals?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meta?: Json
          mode?: string
          prices?: Json
          signals?: Json
          user_id?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          confidence: number | null
          created_at: string
          dedupe_key: string | null
          event_type: string | null
          id: string
          installation_id: string | null
          numeric_value: number | null
          observed_at: string | null
          payload: Json
          signal_kind: string
          skill_id: string | null
          skill_slug: string | null
          symbol: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string | null
          id?: string
          installation_id?: string | null
          numeric_value?: number | null
          observed_at?: string | null
          payload?: Json
          signal_kind?: string
          skill_id?: string | null
          skill_slug?: string | null
          symbol?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string | null
          id?: string
          installation_id?: string | null
          numeric_value?: number | null
          observed_at?: string | null
          payload?: Json
          signal_kind?: string
          skill_id?: string | null
          skill_slug?: string | null
          symbol?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "data_source_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "data_source_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          created_at: string
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]

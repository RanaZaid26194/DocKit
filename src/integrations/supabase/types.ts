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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          applicant: Json
          co_applicants: Json
          created_at: string
          decided_at: string | null
          id: string
          language: string
          last_activity_at: string
          manager_note: string | null
          packet_path: string | null
          program_id: string
          session_token: string
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
        }
        Insert: {
          applicant?: Json
          co_applicants?: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          language?: string
          last_activity_at?: string
          manager_note?: string | null
          packet_path?: string | null
          program_id: string
          session_token?: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
        }
        Update: {
          applicant?: Json
          co_applicants?: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          language?: string
          last_activity_at?: string
          manager_note?: string | null
          packet_path?: string | null
          program_id?: string
          session_token?: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          acknowledged: boolean
          applicant_index: number
          application_id: string
          created_at: string
          doc_type: string
          exif_flag: boolean
          exif_reason: string | null
          id: string
          issues: Json
          ocr_text: string | null
          requirement_id: string
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          acknowledged?: boolean
          applicant_index?: number
          application_id: string
          created_at?: string
          doc_type: string
          exif_flag?: boolean
          exif_reason?: string | null
          id?: string
          issues?: Json
          ocr_text?: string | null
          requirement_id: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged?: boolean
          applicant_index?: number
          application_id?: string
          created_at?: string
          doc_type?: string
          exif_flag?: boolean
          exif_reason?: string | null
          id?: string
          issues?: Json
          ocr_text?: string | null
          requirement_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          contact_email: string
          created_at: string
          id: string
          org_name: string
          updated_at: string
        }
        Insert: {
          contact_email?: string
          created_at?: string
          id: string
          org_name?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          id?: string
          org_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string
          id: string
          link_token: string
          name: string
          owner_id: string
          program_type: Database["public"]["Enums"]["program_type"]
          requirements: Json
          retention_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_token?: string
          name: string
          owner_id: string
          program_type?: Database["public"]["Enums"]["program_type"]
          requirements?: Json
          retention_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          link_token?: string
          name?: string
          owner_id?: string
          program_type?: Database["public"]["Enums"]["program_type"]
          requirements?: Json
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          invited_email: string
          program_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email: string
          program_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string
          program_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_program: { Args: { _program_id: string }; Returns: boolean }
      manager_decide_application: {
        Args: { _app_id: string; _new_status: string }
        Returns: string[]
      }
      renter_get_application: { Args: { _token: string }; Returns: Json }
      renter_get_program: { Args: { _token: string }; Returns: Json }
      renter_save_document: {
        Args: {
          _applicant_index: number
          _doc_type: string
          _exif_flag: boolean
          _exif_reason: string
          _issues: Json
          _ocr_text: string
          _requirement_id: string
          _status: string
          _storage_path: string
          _token: string
        }
        Returns: string
      }
      renter_start_application: {
        Args: { _program_token: string }
        Returns: string
      }
      renter_start_over: { Args: { _token: string }; Returns: string[] }
      renter_submit: {
        Args: { _packet_path: string; _token: string }
        Returns: undefined
      }
      renter_update_applicant: {
        Args: { _applicant: Json; _co: Json; _lang: string; _token: string }
        Returns: undefined
      }
      storage_path_token_is_valid: { Args: { _name: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "member"
      application_status:
        | "in_progress"
        | "submitted"
        | "approved"
        | "rejected"
        | "withdrawn"
      doc_status: "pending" | "pass" | "needs_fixing" | "flagged"
      program_type: "section8" | "lihtc" | "public_housing" | "custom"
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
    Enums: {
      app_role: ["owner", "member"],
      application_status: [
        "in_progress",
        "submitted",
        "approved",
        "rejected",
        "withdrawn",
      ],
      doc_status: ["pending", "pass", "needs_fixing", "flagged"],
      program_type: ["section8", "lihtc", "public_housing", "custom"],
    },
  },
} as const

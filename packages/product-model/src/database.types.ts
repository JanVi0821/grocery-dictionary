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
      collection_translations: {
        Row: {
          collection_id: number
          id: number
          language_code: string
          name: string
        }
        Insert: {
          collection_id: number
          id?: number
          language_code: string
          name: string
        }
        Update: {
          collection_id?: number
          id?: number
          language_code?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_translations_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          id: number
          name: string
          parent_id: number | null
        }
        Insert: {
          id: number
          name: string
          parent_id?: number | null
        }
        Update: {
          id?: number
          name?: string
          parent_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      product_comments: {
        Row: {
          content: string
          created_at: string
          id: number
          is_deleted: boolean
          product_id: number
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          is_deleted?: boolean
          product_id: number
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          is_deleted?: boolean
          product_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_comments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_translations: {
        Row: {
          detail: Json
          id: number
          lang: string
          name: string
          product_id: number
        }
        Insert: {
          detail: Json
          id?: never
          lang: string
          name: string
          product_id: number
        }
        Update: {
          detail?: Json
          id?: never
          lang?: string
          name?: string
          product_id?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          barcodes: string[]
          brand: string | null
          collection_ids: number[]
          deleted_from_grocer: boolean
          detail: Json | null
          grocer_id: number
          id: number
          name: string
          size: string | null
          unit: string
          update_at_from_grocer: string | null
        }
        Insert: {
          barcodes: string[]
          brand?: string | null
          collection_ids?: number[]
          deleted_from_grocer?: boolean
          detail?: Json | null
          grocer_id: number
          id?: never
          name: string
          size?: string | null
          unit: string
          update_at_from_grocer?: string | null
        }
        Update: {
          barcodes?: string[]
          brand?: string | null
          collection_ids?: number[]
          deleted_from_grocer?: boolean
          detail?: Json | null
          grocer_id?: number
          id?: never
          name?: string
          size?: string | null
          unit?: string
          update_at_from_grocer?: string | null
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          content: string
          created_at: string
          id: number
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          user_id?: string | null
        }
        Relationships: []
      }
      user_product_search_history: {
        Row: {
          barcode: string
          created_at: string
          id: number
          product_id: number
          user_id: string
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: number
          product_id: number
          user_id: string
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: number
          product_id?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      product_comment_entries: {
        Row: {
          author_avatar_url: string | null
          author_name: string | null
          content: string
          created_at: string
          id: number
          is_deleted: boolean
          product_id: number
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      set_product_translation_field: {
        Args: {
          target_product_id: number
          target_lang: string
          field_path: string[]
          field_value: string
        }
        Returns: boolean
      }
      migrate_grocer_products_batch: { Args: { p_rows: Json }; Returns: Json }
      normalize_barcodes_array: {
        Args: { p_codes: string[] }
        Returns: string[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

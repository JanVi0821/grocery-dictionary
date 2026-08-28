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
    PostgrestVersion: "14.15"
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
      product_translations: {
        Row: {
          features: Json
          generic_name: string | null
          ingredients: Json | null
          language_code: string
          metadata: Json
          origin: string | null
          product_id: number
          product_name: string | null
        }
        Insert: {
          features?: Json
          generic_name?: string | null
          ingredients?: Json | null
          language_code: string
          metadata?: Json
          origin?: string | null
          product_id: number
          product_name?: string | null
        }
        Update: {
          features?: Json
          generic_name?: string | null
          ingredients?: Json | null
          language_code?: string
          metadata?: Json
          origin?: string | null
          product_id?: number
          product_name?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          additives_tags: string[] | null
          allergens_tags: string[] | null
          barcodes: string[]
          brands: string[] | null
          collection_id: number | null
          exist_in_grocer: boolean
          features: Json
          generic_name: string | null
          id: number
          image: Json | null
          ingredients: Json | null
          last_modified_t: string | null
          marked_tags: string[] | null
          metadata: Json
          nova_group: number | null
          nutriments: Json
          nutrition_grades: string | null
          origin: string | null
          product_name: string | null
          product_quantity_unit: string | null
          quantity: string | null
          serving_size: string | null
          source: string
          stores: string[] | null
        }
        Insert: {
          additives_tags?: string[] | null
          allergens_tags?: string[] | null
          barcodes: string[]
          brands?: string[] | null
          collection_id?: number | null
          exist_in_grocer?: boolean
          features?: Json
          generic_name?: string | null
          id?: number
          image?: Json | null
          ingredients?: Json | null
          last_modified_t?: string | null
          marked_tags?: string[] | null
          metadata?: Json
          nova_group?: number | null
          nutriments?: Json
          nutrition_grades?: string | null
          origin?: string | null
          product_name?: string | null
          product_quantity_unit?: string | null
          quantity?: string | null
          serving_size?: string | null
          source: string
          stores?: string[] | null
        }
        Update: {
          additives_tags?: string[] | null
          allergens_tags?: string[] | null
          barcodes?: string[]
          brands?: string[] | null
          collection_id?: number | null
          exist_in_grocer?: boolean
          features?: Json
          generic_name?: string | null
          id?: number
          image?: Json | null
          ingredients?: Json | null
          last_modified_t?: string | null
          marked_tags?: string[] | null
          metadata?: Json
          nova_group?: number | null
          nutriments?: Json
          nutrition_grades?: string | null
          origin?: string | null
          product_name?: string | null
          product_quantity_unit?: string | null
          quantity?: string | null
          serving_size?: string | null
          source?: string
          stores?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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

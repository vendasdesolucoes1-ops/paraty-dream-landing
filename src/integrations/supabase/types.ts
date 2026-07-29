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
      ai_agent_conversations: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          session_id: string
          status: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          session_id: string
          status?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_human_takeover: {
        Row: {
          conversation_id: string | null
          created_at: string
          human_takeover_at: string
          id: string
          resolved_at: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          human_takeover_at?: string
          id?: string
          resolved_at?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          human_takeover_at?: string
          id?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_human_takeover_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          created_at: string
          id: string
          instance_id: string | null
          is_active: boolean
          mensagem_boas_vindas: string | null
          modelo: string
          name: string
          ser_breve: boolean
          system_prompt: string | null
          tom_voz: string
          transfer_keywords: string[] | null
          transfer_to_human_enabled: boolean
          usar_emojis: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id?: string | null
          is_active?: boolean
          mensagem_boas_vindas?: string | null
          modelo?: string
          name: string
          ser_breve?: boolean
          system_prompt?: string | null
          tom_voz?: string
          transfer_keywords?: string[] | null
          transfer_to_human_enabled?: boolean
          usar_emojis?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string | null
          is_active?: boolean
          mensagem_boas_vindas?: string | null
          modelo?: string
          name?: string
          ser_breve?: boolean
          system_prompt?: string | null
          tom_voz?: string
          transfer_keywords?: string[] | null
          transfer_to_human_enabled?: boolean
          usar_emojis?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          content: string | null
          created_at: string
          file_url: string | null
          id: string
          is_active: boolean
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          is_active?: boolean
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          is_active?: boolean
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave: string
          created_at: string
          id: string
          valor: string | null
        }
        Insert: {
          chave: string
          created_at?: string
          id?: string
          valor?: string | null
        }
        Update: {
          chave?: string
          created_at?: string
          id?: string
          valor?: string | null
        }
        Relationships: []
      }
      documentos: {
        Row: {
          categoria: string
          created_at: string | null
          id: string
          lead_id: string | null
          observacoes: string | null
          processo_id: string | null
          storage_path: string
          tags: string[] | null
          tamanho_bytes: number | null
          tipo_arquivo: string
          titulo: string
          uploaded_by: string | null
        }
        Insert: {
          categoria: string
          created_at?: string | null
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          processo_id?: string | null
          storage_path: string
          tags?: string[] | null
          tamanho_bytes?: number | null
          tipo_arquivo: string
          titulo: string
          uploaded_by?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string | null
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          processo_id?: string | null
          storage_path?: string
          tags?: string[] | null
          tamanho_bytes?: number | null
          tipo_arquivo?: string
          titulo?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imagery_acervo: {
        Row: {
          ativo: boolean
          brand_slug: string
          contem_pessoas: boolean
          created_at: string
          file_path: string
          file_url: string
          id: string
          last_used_at: string | null
          origem: string
          slide_id: string | null
          tag_tipo: string
          titulo: string | null
          updated_at: string
          uso_count: number
          validation_media: number | null
        }
        Insert: {
          ativo?: boolean
          brand_slug?: string
          contem_pessoas?: boolean
          created_at?: string
          file_path: string
          file_url: string
          id?: string
          last_used_at?: string | null
          origem: string
          slide_id?: string | null
          tag_tipo: string
          titulo?: string | null
          updated_at?: string
          uso_count?: number
          validation_media?: number | null
        }
        Update: {
          ativo?: boolean
          brand_slug?: string
          contem_pessoas?: boolean
          created_at?: string
          file_path?: string
          file_url?: string
          id?: string
          last_used_at?: string | null
          origem?: string
          slide_id?: string | null
          tag_tipo?: string
          titulo?: string | null
          updated_at?: string
          uso_count?: number
          validation_media?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imagery_acervo_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "imagery_slides"
            referencedColumns: ["id"]
          },
        ]
      }
      imagery_logs: {
        Row: {
          created_at: string
          custo_usd: number
          duracao_ms: number | null
          error_message: string | null
          id: string
          model: string | null
          post_id: string | null
          prompt_excerpt: string | null
          provider: string | null
          response_summary: Json | null
          slide_id: string | null
          step: string
          success: boolean
        }
        Insert: {
          created_at?: string
          custo_usd?: number
          duracao_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string | null
          post_id?: string | null
          prompt_excerpt?: string | null
          provider?: string | null
          response_summary?: Json | null
          slide_id?: string | null
          step: string
          success?: boolean
        }
        Update: {
          created_at?: string
          custo_usd?: number
          duracao_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string | null
          post_id?: string | null
          prompt_excerpt?: string | null
          provider?: string | null
          response_summary?: Json | null
          slide_id?: string | null
          step?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "imagery_logs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "imagery_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagery_logs_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "imagery_slides"
            referencedColumns: ["id"]
          },
        ]
      }
      imagery_posts: {
        Row: {
          copy_data: Json | null
          created_at: string
          custo_total_usd: number
          error_message: string | null
          id: string
          ig_caption: string | null
          ig_error: string | null
          ig_media_id: string | null
          ig_permalink: string | null
          ig_published_at: string | null
          ig_status: string | null
          n_slides: number
          nicho: string | null
          objetivo: string | null
          status: string
          tema: string
          tipo: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          copy_data?: Json | null
          created_at?: string
          custo_total_usd?: number
          error_message?: string | null
          id?: string
          ig_caption?: string | null
          ig_error?: string | null
          ig_media_id?: string | null
          ig_permalink?: string | null
          ig_published_at?: string | null
          ig_status?: string | null
          n_slides?: number
          nicho?: string | null
          objetivo?: string | null
          status?: string
          tema: string
          tipo?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          copy_data?: Json | null
          created_at?: string
          custo_total_usd?: number
          error_message?: string | null
          id?: string
          ig_caption?: string | null
          ig_error?: string | null
          ig_media_id?: string | null
          ig_permalink?: string | null
          ig_published_at?: string | null
          ig_status?: string | null
          n_slides?: number
          nicho?: string | null
          objetivo?: string | null
          status?: string
          tema?: string
          tipo?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      imagery_slides: {
        Row: {
          acervo_id: string | null
          copy_data: Json | null
          created_at: string
          error_message: string | null
          final_png_url: string | null
          id: string
          image_brief: string | null
          image_source: string | null
          image_type: string | null
          needs_image: boolean
          post_id: string
          raw_image_url: string | null
          retry_count: number
          slide_n: number
          status: string
          template_id: string
          treated_image_url: string | null
          updated_at: string
          validation_score: Json | null
        }
        Insert: {
          acervo_id?: string | null
          copy_data?: Json | null
          created_at?: string
          error_message?: string | null
          final_png_url?: string | null
          id?: string
          image_brief?: string | null
          image_source?: string | null
          image_type?: string | null
          needs_image?: boolean
          post_id: string
          raw_image_url?: string | null
          retry_count?: number
          slide_n: number
          status?: string
          template_id: string
          treated_image_url?: string | null
          updated_at?: string
          validation_score?: Json | null
        }
        Update: {
          acervo_id?: string | null
          copy_data?: Json | null
          created_at?: string
          error_message?: string | null
          final_png_url?: string | null
          id?: string
          image_brief?: string | null
          image_source?: string | null
          image_type?: string | null
          needs_image?: boolean
          post_id?: string
          raw_image_url?: string | null
          retry_count?: number
          slide_n?: number
          status?: string
          template_id?: string
          treated_image_url?: string | null
          updated_at?: string
          validation_score?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "imagery_slides_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "imagery_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes: {
        Row: {
          canal: string | null
          conteudo: string | null
          created_at: string
          id: string
          lead_id: string | null
          tipo: string | null
        }
        Insert: {
          canal?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          tipo?: string | null
        }
        Update: {
          canal?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cidade: string | null
          created_at: string
          deletado_em: string | null
          email: string | null
          id: string
          lote_interesse_id: string | null
          metragem_interesse: number | null
          nome: string
          origem: string | null
          score: number
          status_crm: string
          telefone: string | null
          tipo_lote_interesse: string | null
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          deletado_em?: string | null
          email?: string | null
          id?: string
          lote_interesse_id?: string | null
          metragem_interesse?: number | null
          nome: string
          origem?: string | null
          score?: number
          status_crm?: string
          telefone?: string | null
          tipo_lote_interesse?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string
          deletado_em?: string | null
          email?: string | null
          id?: string
          lote_interesse_id?: string | null
          metragem_interesse?: number | null
          nome?: string
          origem?: string | null
          score?: number
          status_crm?: string
          telefone?: string | null
          tipo_lote_interesse?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_lote_interesse_id_fkey"
            columns: ["lote_interesse_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          created_at: string
          id: string
          metragem: number | null
          numero_lote: string
          observacoes: string | null
          posicao_x: number | null
          posicao_y: number | null
          quadra: string | null
          status: string
          tipo: string | null
          valor: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          metragem?: number | null
          numero_lote: string
          observacoes?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          quadra?: string | null
          status?: string
          tipo?: string | null
          valor?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          metragem?: number | null
          numero_lote?: string
          observacoes?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          quadra?: string | null
          status?: string
          tipo?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      posts_marketing: {
        Row: {
          copy_texto: string
          created_at: string | null
          hashtags: string | null
          id: string
          imagem_url: string | null
          instagram_post_id: string | null
          publicado_em: string | null
          status: string | null
          titulo: string | null
        }
        Insert: {
          copy_texto: string
          created_at?: string | null
          hashtags?: string | null
          id?: string
          imagem_url?: string | null
          instagram_post_id?: string | null
          publicado_em?: string | null
          status?: string | null
          titulo?: string | null
        }
        Update: {
          copy_texto?: string
          created_at?: string | null
          hashtags?: string | null
          id?: string
          imagem_url?: string | null
          instagram_post_id?: string | null
          publicado_em?: string | null
          status?: string | null
          titulo?: string | null
        }
        Relationships: []
      }
      processos: {
        Row: {
          categoria: string
          created_at: string | null
          id: string
          lead_id: string | null
          observacoes: string | null
          titulo: string
        }
        Insert: {
          categoria?: string
          created_at?: string | null
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          titulo: string
        }
        Update: {
          categoria?: string
          created_at?: string | null
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string | null
          deletado_em: string | null
          email: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          deletado_em?: string | null
          email: string
          id: string
          nome: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          deletado_em?: string | null
          email?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores: {
        Row: {
          ativo: boolean
          created_at: string
          email: string | null
          id: string
          nome: string
          posicao_round_robin: number
          profile_id: string | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          posicao_round_robin?: number
          profile_id?: string | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          posicao_round_robin?: number
          profile_id?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          created_at: string | null
          data_hora: string
          id: string
          lead_id: string | null
          observacoes: string | null
          origem: string
          status: string
          updated_at: string | null
          vendedor_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_hora: string
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          origem?: string
          status?: string
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_hora?: string
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          origem?: string
          status?: string
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          lead_id: string | null
          name: string | null
          phone: string
          remote_jid: string | null
          unread_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          name?: string | null
          phone: string
          remote_jid?: string | null
          unread_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          name?: string | null
          phone?: string
          remote_jid?: string | null
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          id: string
          instance_name: string
          qr_code: string | null
          qr_code_expires_at: string | null
          status: string
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string
          id?: string
          instance_name: string
          qr_code?: string | null
          qr_code_expires_at?: string | null
          status?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          instance_name?: string
          qr_code?: string | null
          qr_code_expires_at?: string | null
          status?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string
          from_me: boolean
          id: string
          instance_id: string | null
          lead_id: string | null
          message_id: string | null
          message_type: string | null
          remote_jid: string | null
          status: string | null
        }
        Insert: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          from_me?: boolean
          id?: string
          instance_id?: string | null
          lead_id?: string | null
          message_id?: string | null
          message_type?: string | null
          remote_jid?: string | null
          status?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          from_me?: boolean
          id?: string
          instance_id?: string | null
          lead_id?: string | null
          message_id?: string | null
          message_type?: string | null
          remote_jid?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_my_vendedor_id: { Args: never; Returns: string }
      get_next_round_robin_salesperson: { Args: never; Returns: string }
    }
    Enums: {
      user_role: "admin" | "gestor" | "vendedor"
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
      user_role: ["admin", "gestor", "vendedor"],
    },
  },
} as const

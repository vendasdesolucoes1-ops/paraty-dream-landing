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
          expira_em: string | null
          human_takeover_at: string
          id: string
          origem: string | null
          resolved_at: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          expira_em?: string | null
          human_takeover_at?: string
          id?: string
          origem?: string | null
          resolved_at?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          expira_em?: string | null
          human_takeover_at?: string
          id?: string
          origem?: string | null
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
          autonomia: string
          created_at: string
          id: string
          instance_id: string | null
          instrucoes_extras: string | null
          is_active: boolean
          mensagem_boas_vindas: string | null
          mensagem_transferencia: string | null
          modelo: string
          name: string
          ser_breve: boolean
          system_prompt: string | null
          temperatura: number | null
          tom_voz: string
          transfer_keywords: string[] | null
          transfer_to_human_enabled: boolean
          usar_emojis: boolean
        }
        Insert: {
          autonomia?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instrucoes_extras?: string | null
          is_active?: boolean
          mensagem_boas_vindas?: string | null
          mensagem_transferencia?: string | null
          modelo?: string
          name: string
          ser_breve?: boolean
          system_prompt?: string | null
          temperatura?: number | null
          tom_voz?: string
          transfer_keywords?: string[] | null
          transfer_to_human_enabled?: boolean
          usar_emojis?: boolean
        }
        Update: {
          autonomia?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instrucoes_extras?: string | null
          is_active?: boolean
          mensagem_boas_vindas?: string | null
          mensagem_transferencia?: string | null
          modelo?: string
          name?: string
          ser_breve?: boolean
          system_prompt?: string | null
          temperatura?: number | null
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
      ai_chamadas: {
        Row: {
          canal: string | null
          criado_em: string
          custo_usd: number | null
          erro: string | null
          ferramentas: Json | null
          funcao: string
          id: number
          latencia_ms: number | null
          lead_id: string | null
          mensagens: Json | null
          modelo: string
          prompt: string | null
          resposta: string | null
          session_id: string | null
          temperatura: number | null
          tokens_entrada: number | null
          tokens_saida: number | null
          versao_prompt: string | null
        }
        Insert: {
          canal?: string | null
          criado_em?: string
          custo_usd?: number | null
          erro?: string | null
          ferramentas?: Json | null
          funcao: string
          id?: never
          latencia_ms?: number | null
          lead_id?: string | null
          mensagens?: Json | null
          modelo: string
          prompt?: string | null
          resposta?: string | null
          session_id?: string | null
          temperatura?: number | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          versao_prompt?: string | null
        }
        Update: {
          canal?: string | null
          criado_em?: string
          custo_usd?: number | null
          erro?: string | null
          ferramentas?: Json | null
          funcao?: string
          id?: never
          latencia_ms?: number | null
          lead_id?: string | null
          mensagens?: Json | null
          modelo?: string
          prompt?: string | null
          resposta?: string | null
          session_id?: string | null
          temperatura?: number | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          versao_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chamadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_enviados: {
        Row: {
          detalhe: string | null
          enviado_em: string
          tipo: string
        }
        Insert: {
          detalhe?: string | null
          enviado_em: string
          tipo: string
        }
        Update: {
          detalhe?: string | null
          enviado_em?: string
          tipo?: string
        }
        Relationships: []
      }
      auditoria: {
        Row: {
          antes: Json | null
          autor_id: string | null
          depois: Json | null
          id: number
          mudancas: Json | null
          operacao: string
          origem: string
          quando: string
          registro_id: string | null
          tabela: string
        }
        Insert: {
          antes?: Json | null
          autor_id?: string | null
          depois?: Json | null
          id?: never
          mudancas?: Json | null
          operacao: string
          origem: string
          quando?: string
          registro_id?: string | null
          tabela: string
        }
        Update: {
          antes?: Json | null
          autor_id?: string | null
          depois?: Json | null
          id?: never
          mudancas?: Json | null
          operacao?: string
          origem?: string
          quando?: string
          registro_id?: string | null
          tabela?: string
        }
        Relationships: []
      }
      avisos_vendedor: {
        Row: {
          agendado_para: string
          atualizado_em: string
          criado_em: string
          enviado_em: string | null
          erro: string | null
          id: string
          lead_id: string
          origem: string
          status: string
          tentativas: number
          vendedor_id: string
        }
        Insert: {
          agendado_para?: string
          atualizado_em?: string
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          lead_id: string
          origem?: string
          status?: string
          tentativas?: number
          vendedor_id: string
        }
        Update: {
          agendado_para?: string
          atualizado_em?: string
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          lead_id?: string
          origem?: string
          status?: string
          tentativas?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_vendedor_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_vendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
      cadencia_etapas: {
        Row: {
          ativa: boolean
          cadencia_id: string
          deslocamento: string
          hora_fixa: string | null
          id: string
          midia: Json | null
          modo: string
          ordem: number
          referencia: string
          template: string
        }
        Insert: {
          ativa?: boolean
          cadencia_id: string
          deslocamento?: string
          hora_fixa?: string | null
          id?: string
          midia?: Json | null
          modo?: string
          ordem: number
          referencia?: string
          template: string
        }
        Update: {
          ativa?: boolean
          cadencia_id?: string
          deslocamento?: string
          hora_fixa?: string | null
          id?: string
          midia?: Json | null
          modo?: string
          ordem?: number
          referencia?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_etapas_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_etapas_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "vw_followup_metricas"
            referencedColumns: ["cadencia_id"]
          },
        ]
      }
      cadencias: {
        Row: {
          ativa: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          envio_automatico: boolean
          gatilho: string
          id: string
          instance_id: string | null
          motivo_pausa: string | null
          nome: string
          pausa_ao_responder: boolean
          pausada_em: string | null
          status_crm_validos: string[] | null
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          envio_automatico?: boolean
          gatilho?: string
          id?: string
          instance_id?: string | null
          motivo_pausa?: string | null
          nome: string
          pausa_ao_responder?: boolean
          pausada_em?: string | null
          status_crm_validos?: string[] | null
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          envio_automatico?: boolean
          gatilho?: string
          id?: string
          instance_id?: string | null
          motivo_pausa?: string | null
          nome?: string
          pausa_ao_responder?: boolean
          pausada_em?: string | null
          status_crm_validos?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "cadencias_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          estado_civil: string | null
          id: string
          lead_id: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          profissao: string | null
          rg: string | null
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          id?: string
          lead_id?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          profissao?: string | null
          rg?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          id?: string
          lead_id?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          profissao?: string | null
          rg?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          cliente_id: string
          created_at: string
          data_compra: string | null
          data_primeira_parcela: string | null
          dia_vencimento: number | null
          escritura_emitida: boolean
          id: string
          lote_id: string | null
          num_parcelas: number | null
          numero_contrato: string | null
          observacoes: string | null
          status: string
          updated_at: string
          valor_entrada: number | null
          valor_parcela: number | null
          valor_total: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_compra?: string | null
          data_primeira_parcela?: string | null
          dia_vencimento?: number | null
          escritura_emitida?: boolean
          id?: string
          lote_id?: string | null
          num_parcelas?: number | null
          numero_contrato?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor_entrada?: number | null
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_compra?: string | null
          data_primeira_parcela?: string | null
          dia_vencimento?: number | null
          escritura_emitida?: boolean
          id?: string
          lote_id?: string | null
          num_parcelas?: number | null
          numero_contrato?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor_entrada?: number | null
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_painel"
            referencedColumns: ["id"]
          },
        ]
      }
      condicoes_comerciais: {
        Row: {
          aprovado_por: string | null
          arquivada: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          entrada_percentual: number
          id: string
          nome: string
          observacao: string | null
          parcelas_max: number
          vigente: boolean
          vigente_desde: string | null
        }
        Insert: {
          aprovado_por?: string | null
          arquivada?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          entrada_percentual: number
          id?: string
          nome: string
          observacao?: string | null
          parcelas_max: number
          vigente?: boolean
          vigente_desde?: string | null
        }
        Update: {
          aprovado_por?: string | null
          arquivada?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          entrada_percentual?: number
          id?: string
          nome?: string
          observacao?: string | null
          parcelas_max?: number
          vigente?: boolean
          vigente_desde?: string | null
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
      consentimentos: {
        Row: {
          criado_em: string
          finalidade: string
          id: string
          lead_id: string
          origem: string
          texto_versao: string
        }
        Insert: {
          criado_em?: string
          finalidade: string
          id?: string
          lead_id: string
          origem?: string
          texto_versao: string
        }
        Update: {
          criado_em?: string
          finalidade?: string
          id?: string
          lead_id?: string
          origem?: string
          texto_versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_campanha: {
        Row: {
          disparado_por: string | null
          filtro_status: string | null
          finalizado_em: string | null
          fonte_contatos: string
          id: string
          iniciado_em: string
          instancia_id: string | null
          instancia_nome: string
          intervalo_max_segundos: number | null
          intervalo_min_segundos: number | null
          intervalo_segundos: number
          mensagem_template: string
          midia_nome: string | null
          midia_tipo: string | null
          midia_url: string | null
          status: string
          total_contatos: number
          total_enviado: number
          total_falhou: number
          total_pulado: number
        }
        Insert: {
          disparado_por?: string | null
          filtro_status?: string | null
          finalizado_em?: string | null
          fonte_contatos: string
          id?: string
          iniciado_em?: string
          instancia_id?: string | null
          instancia_nome: string
          intervalo_max_segundos?: number | null
          intervalo_min_segundos?: number | null
          intervalo_segundos: number
          mensagem_template: string
          midia_nome?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          status?: string
          total_contatos: number
          total_enviado?: number
          total_falhou?: number
          total_pulado?: number
        }
        Update: {
          disparado_por?: string | null
          filtro_status?: string | null
          finalizado_em?: string | null
          fonte_contatos?: string
          id?: string
          iniciado_em?: string
          instancia_id?: string | null
          instancia_nome?: string
          intervalo_max_segundos?: number | null
          intervalo_min_segundos?: number | null
          intervalo_segundos?: number
          mensagem_template?: string
          midia_nome?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          status?: string
          total_contatos?: number
          total_enviado?: number
          total_falhou?: number
          total_pulado?: number
        }
        Relationships: [
          {
            foreignKeyName: "disparos_campanha_disparado_por_fkey"
            columns: ["disparado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_campanha_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_itens: {
        Row: {
          campanha_id: string
          created_at: string
          enviado_em: string | null
          erro: string | null
          id: string
          lead_id: string | null
          nome: string | null
          status: string
          telefone: string
        }
        Insert: {
          campanha_id: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          lead_id?: string | null
          nome?: string | null
          status?: string
          telefone: string
        }
        Update: {
          campanha_id?: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          lead_id?: string | null
          nome?: string | null
          status?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_itens_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "disparos_campanha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_itens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          categoria: string
          compra_id: string | null
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
          compra_id?: string | null
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
          compra_id?: string | null
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
            foreignKeyName: "documentos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
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
      envios_eventos: {
        Row: {
          cadencia_id: string | null
          criado_em: string
          etapa_ordem: number | null
          evento: string
          id: number
          inscricao_id: string | null
          lead_id: string | null
          mensagem_id: string | null
          motivo: string | null
        }
        Insert: {
          cadencia_id?: string | null
          criado_em?: string
          etapa_ordem?: number | null
          evento: string
          id?: number
          inscricao_id?: string | null
          lead_id?: string | null
          mensagem_id?: string | null
          motivo?: string | null
        }
        Update: {
          cadencia_id?: string | null
          criado_em?: string
          etapa_ordem?: number | null
          evento?: string
          id?: number
          inscricao_id?: string | null
          lead_id?: string | null
          mensagem_id?: string | null
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envios_eventos_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_eventos_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "vw_followup_metricas"
            referencedColumns: ["cadencia_id"]
          },
          {
            foreignKeyName: "envios_eventos_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: false
            referencedRelation: "inscricoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      exportacoes: {
        Row: {
          created_at: string
          filtros: Json
          id: string
          tipo: string
          total_registros: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          filtros?: Json
          id?: string
          tipo?: string
          total_registros?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          filtros?: Json
          id?: string
          tipo?: string
          total_registros?: number
          user_id?: string | null
        }
        Relationships: []
      }
      fatos_comerciais: {
        Row: {
          aprovado_em: string | null
          atualizado_em: string
          chave: string
          descricao: string | null
          responsavel_id: string | null
          status: string
          valor: string
        }
        Insert: {
          aprovado_em?: string | null
          atualizado_em?: string
          chave: string
          descricao?: string | null
          responsavel_id?: string | null
          status?: string
          valor: string
        }
        Update: {
          aprovado_em?: string | null
          atualizado_em?: string
          chave?: string
          descricao?: string | null
          responsavel_id?: string | null
          status?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "fatos_comerciais_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          data: string
          descricao: string
        }
        Insert: {
          data: string
          descricao: string
        }
        Update: {
          data?: string
          descricao?: string
        }
        Relationships: []
      }
      funil_probabilidades: {
        Row: {
          atualizado_em: string
          etapa: string
          probabilidade: number
        }
        Insert: {
          atualizado_em?: string
          etapa: string
          probabilidade: number
        }
        Update: {
          atualizado_em?: string
          etapa?: string
          probabilidade?: number
        }
        Relationships: []
      }
      ig_conta_diaria: {
        Row: {
          capturado_em: string
          data: string
          followers_count: number | null
          follows_count: number | null
          ig_user_id: string
          media_count: number | null
          username: string | null
        }
        Insert: {
          capturado_em?: string
          data: string
          followers_count?: number | null
          follows_count?: number | null
          ig_user_id: string
          media_count?: number | null
          username?: string | null
        }
        Update: {
          capturado_em?: string
          data?: string
          followers_count?: number | null
          follows_count?: number | null
          ig_user_id?: string
          media_count?: number | null
          username?: string | null
        }
        Relationships: []
      }
      ig_demografia: {
        Row: {
          chave: string
          data: string
          ig_user_id: string
          tipo: string
          valor: number
        }
        Insert: {
          chave: string
          data: string
          ig_user_id: string
          tipo: string
          valor: number
        }
        Update: {
          chave?: string
          data?: string
          ig_user_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      ig_insights_conta_diario: {
        Row: {
          atualizado_em: string
          data: string
          ig_user_id: string
          metrica: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          data: string
          ig_user_id: string
          metrica: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          data?: string
          ig_user_id?: string
          metrica?: string
          valor?: number
        }
        Relationships: []
      }
      ig_midia_insights: {
        Row: {
          capturado_em: string
          metrica: string
          midia_id: string
          valor: number
        }
        Insert: {
          capturado_em?: string
          metrica: string
          midia_id: string
          valor: number
        }
        Update: {
          capturado_em?: string
          metrica?: string
          midia_id?: string
          valor?: number
        }
        Relationships: []
      }
      ig_midias: {
        Row: {
          caption: string | null
          comments_count: number | null
          id: string
          ig_user_id: string
          like_count: number | null
          media_product_type: string | null
          media_type: string | null
          media_url: string | null
          permalink: string | null
          sincronizado_em: string
          thumbnail_url: string | null
          timestamp: string | null
        }
        Insert: {
          caption?: string | null
          comments_count?: number | null
          id: string
          ig_user_id: string
          like_count?: number | null
          media_product_type?: string | null
          media_type?: string | null
          media_url?: string | null
          permalink?: string | null
          sincronizado_em?: string
          thumbnail_url?: string | null
          timestamp?: string | null
        }
        Update: {
          caption?: string | null
          comments_count?: number | null
          id?: string
          ig_user_id?: string
          like_count?: number | null
          media_product_type?: string | null
          media_type?: string | null
          media_url?: string | null
          permalink?: string | null
          sincronizado_em?: string
          thumbnail_url?: string | null
          timestamp?: string | null
        }
        Relationships: []
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
            foreignKeyName: "imagery_slides_acervo_id_fkey"
            columns: ["acervo_id"]
            isOneToOne: false
            referencedRelation: "imagery_acervo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagery_slides_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "imagery_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      inscricoes: {
        Row: {
          atualizado_em: string
          cadencia_id: string
          criado_em: string
          criado_por: string | null
          encerrada_em: string | null
          etapa_atual: number
          id: string
          lead_id: string
          motivo_saida: string | null
          proxima_em: string | null
          status: string
          tentativas_sem_resposta: number
          ultimo_envio_em: string | null
          visita_id: string | null
        }
        Insert: {
          atualizado_em?: string
          cadencia_id: string
          criado_em?: string
          criado_por?: string | null
          encerrada_em?: string | null
          etapa_atual?: number
          id?: string
          lead_id: string
          motivo_saida?: string | null
          proxima_em?: string | null
          status?: string
          tentativas_sem_resposta?: number
          ultimo_envio_em?: string | null
          visita_id?: string | null
        }
        Update: {
          atualizado_em?: string
          cadencia_id?: string
          criado_em?: string
          criado_por?: string | null
          encerrada_em?: string | null
          etapa_atual?: number
          id?: string
          lead_id?: string
          motivo_saida?: string | null
          proxima_em?: string | null
          status?: string
          tentativas_sem_resposta?: number
          ultimo_envio_em?: string | null
          visita_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inscricoes_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscricoes_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "vw_followup_metricas"
            referencedColumns: ["cadencia_id"]
          },
          {
            foreignKeyName: "inscricoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscricoes_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes: {
        Row: {
          autor_id: string | null
          canal: string | null
          conteudo: string | null
          created_at: string
          id: string
          lead_id: string | null
          tipo: string | null
        }
        Insert: {
          autor_id?: string | null
          canal?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          tipo?: string | null
        }
        Update: {
          autor_id?: string | null
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
      lead_entradas: {
        Row: {
          anuncio_nome: string | null
          campanha_nome: string | null
          canal: string
          criado_em: string
          formulario_nome: string | null
          id: number
          lead_id: string
          ocorrido_em: string
          referencia: string | null
        }
        Insert: {
          anuncio_nome?: string | null
          campanha_nome?: string | null
          canal: string
          criado_em?: string
          formulario_nome?: string | null
          id?: number
          lead_id: string
          ocorrido_em?: string
          referencia?: string | null
        }
        Update: {
          anuncio_nome?: string | null
          campanha_nome?: string | null
          canal?: string
          criado_em?: string
          formulario_nome?: string | null
          id?: number
          lead_id?: string
          ocorrido_em?: string
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_entradas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sinais: {
        Row: {
          confianca: number
          criado_em: string
          id: number
          inscricao_id: string | null
          intencao: string
          intencao_correta: string | null
          lead_id: string
          modelo: string | null
          motivo: string | null
          origem: string
          revisado_por: string | null
          versao_prompt: string
        }
        Insert: {
          confianca: number
          criado_em?: string
          id?: number
          inscricao_id?: string | null
          intencao: string
          intencao_correta?: string | null
          lead_id: string
          modelo?: string | null
          motivo?: string | null
          origem: string
          revisado_por?: string | null
          versao_prompt: string
        }
        Update: {
          confianca?: number
          criado_em?: string
          id?: number
          inscricao_id?: string | null
          intencao?: string
          intencao_correta?: string | null
          lead_id?: string
          modelo?: string | null
          motivo?: string | null
          origem?: string
          revisado_por?: string | null
          versao_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sinais_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: false
            referencedRelation: "inscricoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sinais_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          anuncio_id: string | null
          anuncio_nome: string | null
          anuncio_titulo: string | null
          busca: string | null
          campanha_id: string | null
          campanha_nome: string | null
          canais_entrada: string[]
          canal_origem: string | null
          cidade: string | null
          conjunto_nome: string | null
          contato_bloqueado: boolean
          created_at: string
          ctwa_clid: string | null
          deletado_em: string | null
          email: string | null
          encaminhado_em: string | null
          entrada_em: string | null
          finalidade: string | null
          forma_pagamento: string | null
          formulario_id: string | null
          formulario_nome: string | null
          id: string
          interno: boolean
          is_teste: boolean
          leadgen_id: string | null
          lote_interesse_id: string | null
          metragem_interesse: number | null
          nome: string
          objetivo: string | null
          origem: string | null
          origem_anuncio_em: string | null
          origem_primeira: string | null
          origem_ultima: string | null
          prazo_compra: string | null
          quer_visitar: string | null
          recusas_visita: number
          recusou_visita_em: string | null
          score: number
          sem_interesse_em: string | null
          status_crm: string
          telefone: string | null
          telefone_chave: string | null
          tipo_lote_interesse: string | null
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          anuncio_id?: string | null
          anuncio_nome?: string | null
          anuncio_titulo?: string | null
          busca?: string | null
          campanha_id?: string | null
          campanha_nome?: string | null
          canais_entrada?: string[]
          canal_origem?: string | null
          cidade?: string | null
          conjunto_nome?: string | null
          contato_bloqueado?: boolean
          created_at?: string
          ctwa_clid?: string | null
          deletado_em?: string | null
          email?: string | null
          encaminhado_em?: string | null
          entrada_em?: string | null
          finalidade?: string | null
          forma_pagamento?: string | null
          formulario_id?: string | null
          formulario_nome?: string | null
          id?: string
          interno?: boolean
          is_teste?: boolean
          leadgen_id?: string | null
          lote_interesse_id?: string | null
          metragem_interesse?: number | null
          nome: string
          objetivo?: string | null
          origem?: string | null
          origem_anuncio_em?: string | null
          origem_primeira?: string | null
          origem_ultima?: string | null
          prazo_compra?: string | null
          quer_visitar?: string | null
          recusas_visita?: number
          recusou_visita_em?: string | null
          score?: number
          sem_interesse_em?: string | null
          status_crm?: string
          telefone?: string | null
          telefone_chave?: string | null
          tipo_lote_interesse?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          anuncio_id?: string | null
          anuncio_nome?: string | null
          anuncio_titulo?: string | null
          busca?: string | null
          campanha_id?: string | null
          campanha_nome?: string | null
          canais_entrada?: string[]
          canal_origem?: string | null
          cidade?: string | null
          conjunto_nome?: string | null
          contato_bloqueado?: boolean
          created_at?: string
          ctwa_clid?: string | null
          deletado_em?: string | null
          email?: string | null
          encaminhado_em?: string | null
          entrada_em?: string | null
          finalidade?: string | null
          forma_pagamento?: string | null
          formulario_id?: string | null
          formulario_nome?: string | null
          id?: string
          interno?: boolean
          is_teste?: boolean
          leadgen_id?: string | null
          lote_interesse_id?: string | null
          metragem_interesse?: number | null
          nome?: string
          objetivo?: string | null
          origem?: string | null
          origem_anuncio_em?: string | null
          origem_primeira?: string | null
          origem_ultima?: string | null
          prazo_compra?: string | null
          quer_visitar?: string | null
          recusas_visita?: number
          recusou_visita_em?: string | null
          score?: number
          sem_interesse_em?: string | null
          status_crm?: string
          telefone?: string | null
          telefone_chave?: string | null
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
            foreignKeyName: "leads_lote_interesse_id_fkey"
            columns: ["lote_interesse_id"]
            isOneToOne: false
            referencedRelation: "lotes_painel"
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
      leads_etapas_historico: {
        Row: {
          alterado_por: string | null
          id: number
          lead_id: string
          mudou_em: string
          origem_registro: string
          status_anterior: string | null
          status_novo: string
        }
        Insert: {
          alterado_por?: string | null
          id?: number
          lead_id: string
          mudou_em?: string
          origem_registro?: string
          status_anterior?: string | null
          status_novo: string
        }
        Update: {
          alterado_por?: string | null
          id?: number
          lead_id?: string
          mudou_em?: string
          origem_registro?: string
          status_anterior?: string | null
          status_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_etapas_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      limites_taxa: {
        Row: {
          chave: string
          contagem: number
          janela: string
        }
        Insert: {
          chave: string
          contagem?: number
          janela: string
        }
        Update: {
          chave?: string
          contagem?: number
          janela?: string
        }
        Relationships: []
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
      materiais_agente: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          endereco: string | null
          id: string
          latitude: number | null
          longitude: number | null
          mime_type: string | null
          ordem: number
          tipo: string
          titulo: string
          url: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mime_type?: string | null
          ordem?: number
          tipo: string
          titulo: string
          url?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mime_type?: string | null
          ordem?: number
          tipo?: string
          titulo?: string
          url?: string | null
        }
        Relationships: []
      }
      mensagens_agendadas: {
        Row: {
          agendado_para: string
          aprovado_por: string | null
          atualizado_em: string
          chave_idempotencia: string | null
          criado_em: string
          enviado_em: string | null
          erro: string | null
          etapa_ordem: number | null
          ia_motivo: string | null
          ia_prompt_versao: string | null
          id: string
          inscricao_id: string | null
          instance_id: string | null
          lead_id: string
          midia: Json | null
          partes: Json
          partes_enviadas: number
          status: string
          telefone: string
          tentativas: number
          tipo: string
        }
        Insert: {
          agendado_para?: string
          aprovado_por?: string | null
          atualizado_em?: string
          chave_idempotencia?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          etapa_ordem?: number | null
          ia_motivo?: string | null
          ia_prompt_versao?: string | null
          id?: string
          inscricao_id?: string | null
          instance_id?: string | null
          lead_id: string
          midia?: Json | null
          partes: Json
          partes_enviadas?: number
          status?: string
          telefone: string
          tentativas?: number
          tipo?: string
        }
        Update: {
          agendado_para?: string
          aprovado_por?: string | null
          atualizado_em?: string
          chave_idempotencia?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          etapa_ordem?: number | null
          ia_motivo?: string | null
          ia_prompt_versao?: string | null
          id?: string
          inscricao_id?: string | null
          instance_id?: string | null
          lead_id?: string
          midia?: Json | null
          partes?: Json
          partes_enviadas?: number
          status?: string
          telefone?: string
          tentativas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_agendadas_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: false
            referencedRelation: "inscricoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_agendadas_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_agendadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_anuncios: {
        Row: {
          ad_review_feedback: Json | null
          adset_id: string
          campaign_id: string
          conta_id: string
          created_time: string | null
          creative_body: string | null
          creative_id: string | null
          creative_ig_media_id: string | null
          creative_object_story_spec: Json | null
          creative_thumbnail_url: string | null
          creative_title: string | null
          effective_status: string | null
          id: string
          issues_info: Json | null
          name: string | null
          recommendations: Json | null
          sincronizado_em: string
          status: string | null
          updated_time: string | null
        }
        Insert: {
          ad_review_feedback?: Json | null
          adset_id: string
          campaign_id: string
          conta_id: string
          created_time?: string | null
          creative_body?: string | null
          creative_id?: string | null
          creative_ig_media_id?: string | null
          creative_object_story_spec?: Json | null
          creative_thumbnail_url?: string | null
          creative_title?: string | null
          effective_status?: string | null
          id: string
          issues_info?: Json | null
          name?: string | null
          recommendations?: Json | null
          sincronizado_em?: string
          status?: string | null
          updated_time?: string | null
        }
        Update: {
          ad_review_feedback?: Json | null
          adset_id?: string
          campaign_id?: string
          conta_id?: string
          created_time?: string | null
          creative_body?: string | null
          creative_id?: string | null
          creative_ig_media_id?: string | null
          creative_object_story_spec?: Json | null
          creative_thumbnail_url?: string | null
          creative_title?: string | null
          effective_status?: string | null
          id?: string
          issues_info?: Json | null
          name?: string | null
          recommendations?: Json | null
          sincronizado_em?: string
          status?: string | null
          updated_time?: string | null
        }
        Relationships: []
      }
      meta_campanhas: {
        Row: {
          buying_type: string | null
          conta_id: string
          created_time: string | null
          daily_budget: number | null
          effective_status: string | null
          id: string
          issues_info: Json | null
          lifetime_budget: number | null
          name: string | null
          objective: string | null
          recommendations: Json | null
          sincronizado_em: string
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_time: string | null
        }
        Insert: {
          buying_type?: string | null
          conta_id: string
          created_time?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          id: string
          issues_info?: Json | null
          lifetime_budget?: number | null
          name?: string | null
          objective?: string | null
          recommendations?: Json | null
          sincronizado_em?: string
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_time?: string | null
        }
        Update: {
          buying_type?: string | null
          conta_id?: string
          created_time?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          id?: string
          issues_info?: Json | null
          lifetime_budget?: number | null
          name?: string | null
          objective?: string | null
          recommendations?: Json | null
          sincronizado_em?: string
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_time?: string | null
        }
        Relationships: []
      }
      meta_conjuntos: {
        Row: {
          bid_strategy: string | null
          billing_event: string | null
          budget_remaining: number | null
          campaign_id: string
          conta_id: string
          created_time: string | null
          daily_budget: number | null
          destination_type: string | null
          effective_status: string | null
          end_time: string | null
          id: string
          issues_info: Json | null
          learning_stage_info: Json | null
          lifetime_budget: number | null
          name: string | null
          optimization_goal: string | null
          recommendations: Json | null
          sincronizado_em: string
          start_time: string | null
          status: string | null
          targeting: Json | null
          updated_time: string | null
        }
        Insert: {
          bid_strategy?: string | null
          billing_event?: string | null
          budget_remaining?: number | null
          campaign_id: string
          conta_id: string
          created_time?: string | null
          daily_budget?: number | null
          destination_type?: string | null
          effective_status?: string | null
          end_time?: string | null
          id: string
          issues_info?: Json | null
          learning_stage_info?: Json | null
          lifetime_budget?: number | null
          name?: string | null
          optimization_goal?: string | null
          recommendations?: Json | null
          sincronizado_em?: string
          start_time?: string | null
          status?: string | null
          targeting?: Json | null
          updated_time?: string | null
        }
        Update: {
          bid_strategy?: string | null
          billing_event?: string | null
          budget_remaining?: number | null
          campaign_id?: string
          conta_id?: string
          created_time?: string | null
          daily_budget?: number | null
          destination_type?: string | null
          effective_status?: string | null
          end_time?: string | null
          id?: string
          issues_info?: Json | null
          learning_stage_info?: Json | null
          lifetime_budget?: number | null
          name?: string | null
          optimization_goal?: string | null
          recommendations?: Json | null
          sincronizado_em?: string
          start_time?: string | null
          status?: string | null
          targeting?: Json | null
          updated_time?: string | null
        }
        Relationships: []
      }
      meta_conta_anuncios: {
        Row: {
          account_status: number | null
          fuso: string | null
          id: string
          moeda: string | null
          nome: string | null
          sincronizado_em: string
        }
        Insert: {
          account_status?: number | null
          fuso?: string | null
          id: string
          moeda?: string | null
          nome?: string | null
          sincronizado_em?: string
        }
        Update: {
          account_status?: number | null
          fuso?: string | null
          id?: string
          moeda?: string | null
          nome?: string | null
          sincronizado_em?: string
        }
        Relationships: []
      }
      meta_insights_breakdowns: {
        Row: {
          actions: Json | null
          ad_id: string
          adset_id: string | null
          campaign_id: string | null
          clicks: number | null
          conta_id: string
          data: string
          dim1: string
          dim2: string
          impressions: number | null
          inline_link_clicks: number | null
          leads: number | null
          mensagens_iniciadas: number | null
          reach: number | null
          sincronizado_em: string
          spend: number | null
          tipo: string
        }
        Insert: {
          actions?: Json | null
          ad_id: string
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          conta_id: string
          data: string
          dim1?: string
          dim2?: string
          impressions?: number | null
          inline_link_clicks?: number | null
          leads?: number | null
          mensagens_iniciadas?: number | null
          reach?: number | null
          sincronizado_em?: string
          spend?: number | null
          tipo: string
        }
        Update: {
          actions?: Json | null
          ad_id?: string
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          conta_id?: string
          data?: string
          dim1?: string
          dim2?: string
          impressions?: number | null
          inline_link_clicks?: number | null
          leads?: number | null
          mensagens_iniciadas?: number | null
          reach?: number | null
          sincronizado_em?: string
          spend?: number | null
          tipo?: string
        }
        Relationships: []
      }
      meta_insights_diarios: {
        Row: {
          action_values: Json | null
          actions: Json | null
          ad_id: string
          adset_id: string | null
          campaign_id: string | null
          clicks: number | null
          cliques_link: number | null
          compras: number | null
          conta_id: string
          conversions: Json | null
          cost_per_action_type: Json | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          data: string
          frequency: number | null
          impressions: number | null
          inline_link_clicks: number | null
          leads: number | null
          mensagens_iniciadas: number | null
          moeda: string | null
          reach: number | null
          reservas: number | null
          sincronizado_em: string
          spend: number | null
          unique_clicks: number | null
          valor_compras: number | null
          video_p100: number | null
          video_p25: number | null
          video_p50: number | null
          video_p75: number | null
        }
        Insert: {
          action_values?: Json | null
          actions?: Json | null
          ad_id: string
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          cliques_link?: number | null
          compras?: number | null
          conta_id: string
          conversions?: Json | null
          cost_per_action_type?: Json | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          data: string
          frequency?: number | null
          impressions?: number | null
          inline_link_clicks?: number | null
          leads?: number | null
          mensagens_iniciadas?: number | null
          moeda?: string | null
          reach?: number | null
          reservas?: number | null
          sincronizado_em?: string
          spend?: number | null
          unique_clicks?: number | null
          valor_compras?: number | null
          video_p100?: number | null
          video_p25?: number | null
          video_p50?: number | null
          video_p75?: number | null
        }
        Update: {
          action_values?: Json | null
          actions?: Json | null
          ad_id?: string
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          cliques_link?: number | null
          compras?: number | null
          conta_id?: string
          conversions?: Json | null
          cost_per_action_type?: Json | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          data?: string
          frequency?: number | null
          impressions?: number | null
          inline_link_clicks?: number | null
          leads?: number | null
          mensagens_iniciadas?: number | null
          moeda?: string | null
          reach?: number | null
          reservas?: number | null
          sincronizado_em?: string
          spend?: number | null
          unique_clicks?: number | null
          valor_compras?: number | null
          video_p100?: number | null
          video_p25?: number | null
          video_p50?: number | null
          video_p75?: number | null
        }
        Relationships: []
      }
      meta_leads_formulario: {
        Row: {
          ad_id: string | null
          ad_nome: string | null
          bruto: Json | null
          campanha_id: string | null
          campanha_nome: string | null
          conjunto_nome: string | null
          criado_meta_em: string | null
          duplicado: boolean | null
          erro: string | null
          evento: Json | null
          form_id: string | null
          form_nome: string | null
          lead_id: string | null
          leadgen_id: string
          origem: string
          page_id: string | null
          plataforma: string | null
          processado_em: string | null
          recebido_em: string
          status: string
          tentativas: number
        }
        Insert: {
          ad_id?: string | null
          ad_nome?: string | null
          bruto?: Json | null
          campanha_id?: string | null
          campanha_nome?: string | null
          conjunto_nome?: string | null
          criado_meta_em?: string | null
          duplicado?: boolean | null
          erro?: string | null
          evento?: Json | null
          form_id?: string | null
          form_nome?: string | null
          lead_id?: string | null
          leadgen_id: string
          origem?: string
          page_id?: string | null
          plataforma?: string | null
          processado_em?: string | null
          recebido_em?: string
          status?: string
          tentativas?: number
        }
        Update: {
          ad_id?: string | null
          ad_nome?: string | null
          bruto?: Json | null
          campanha_id?: string | null
          campanha_nome?: string | null
          conjunto_nome?: string | null
          criado_meta_em?: string | null
          duplicado?: boolean | null
          erro?: string | null
          evento?: Json | null
          form_id?: string | null
          form_nome?: string | null
          lead_id?: string | null
          leadgen_id?: string
          origem?: string
          page_id?: string | null
          plataforma?: string | null
          processado_em?: string | null
          recebido_em?: string
          status?: string
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_leads_formulario_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_sync_estado: {
        Row: {
          atualizado_em: string
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          chave: string
          valor?: Json
        }
        Update: {
          atualizado_em?: string
          chave?: string
          valor?: Json
        }
        Relationships: []
      }
      meta_sync_execucoes: {
        Row: {
          codigo_erro: number | null
          detalhes: Json
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          job: string
          registros: number
          status: string
        }
        Insert: {
          codigo_erro?: number | null
          detalhes?: Json
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          job: string
          registros?: number
          status?: string
        }
        Update: {
          codigo_erro?: number | null
          detalhes?: Json
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          job?: string
          registros?: number
          status?: string
        }
        Relationships: []
      }
      metas: {
        Row: {
          alvo: number
          criado_em: string
          criado_por: string | null
          id: string
          indicador: string
          periodo_fim: string
          periodo_inicio: string
          vendedor_id: string | null
        }
        Insert: {
          alvo: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          indicador: string
          periodo_fim: string
          periodo_inicio: string
          vendedor_id?: string | null
        }
        Update: {
          alvo?: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          indicador?: string
          periodo_fim?: string
          periodo_inicio?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          lida_em: string | null
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
          lida_em?: string | null
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
          lida_em?: string | null
          link?: string | null
          read?: boolean
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pesquisas_satisfacao: {
        Row: {
          atualizada_em: string
          cadencia_id: string | null
          comentario: string | null
          foi_atendido: boolean | null
          gatilho: string
          id: string
          inscricao_id: string | null
          lead_id: string
          nota: number | null
          respondida_em: string
          tem_duvida: boolean
          vendedor_id: string | null
        }
        Insert: {
          atualizada_em?: string
          cadencia_id?: string | null
          comentario?: string | null
          foi_atendido?: boolean | null
          gatilho: string
          id?: string
          inscricao_id?: string | null
          lead_id: string
          nota?: number | null
          respondida_em?: string
          tem_duvida?: boolean
          vendedor_id?: string | null
        }
        Update: {
          atualizada_em?: string
          cadencia_id?: string | null
          comentario?: string | null
          foi_atendido?: boolean | null
          gatilho?: string
          id?: string
          inscricao_id?: string | null
          lead_id?: string
          nota?: number | null
          respondida_em?: string
          tem_duvida?: boolean
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pesquisas_satisfacao_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesquisas_satisfacao_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "vw_followup_metricas"
            referencedColumns: ["cadencia_id"]
          },
          {
            foreignKeyName: "pesquisas_satisfacao_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: false
            referencedRelation: "inscricoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesquisas_satisfacao_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesquisas_satisfacao_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
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
          compra_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          observacoes: string | null
          titulo: string
        }
        Insert: {
          categoria?: string
          compra_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          titulo: string
        }
        Update: {
          categoria?: string
          compra_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
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
          acessos: string[]
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
          acessos?: string[]
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
          acessos?: string[]
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
      propostas: {
        Row: {
          aceite_em: string | null
          atualizado_em: string
          condicoes: string | null
          criado_em: string
          criado_por: string | null
          entrada: number | null
          id: string
          lead_id: string
          lote_id: string | null
          parcelas: number | null
          status: string
          valida_ate: string | null
          valor_total: number
          versao: number
        }
        Insert: {
          aceite_em?: string | null
          atualizado_em?: string
          condicoes?: string | null
          criado_em?: string
          criado_por?: string | null
          entrada?: number | null
          id?: string
          lead_id: string
          lote_id?: string | null
          parcelas?: number | null
          status?: string
          valida_ate?: string | null
          valor_total: number
          versao?: number
        }
        Update: {
          aceite_em?: string | null
          atualizado_em?: string
          condicoes?: string | null
          criado_em?: string
          criado_por?: string | null
          entrada?: number | null
          id?: string
          lead_id?: string
          lote_id?: string | null
          parcelas?: number | null
          status?: string
          valida_ate?: string | null
          valor_total?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_painel"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          conteudo: string
          criado_em: string
          documento_chave: string
          embedding: string
          fts: unknown
          hash: string
          id: string
          modelo: string
          ordem: number
          secao: string
        }
        Insert: {
          conteudo: string
          criado_em?: string
          documento_chave: string
          embedding: string
          fts?: unknown
          hash: string
          id?: string
          modelo: string
          ordem: number
          secao: string
        }
        Update: {
          conteudo?: string
          criado_em?: string
          documento_chave?: string
          embedding?: string
          fts?: unknown
          hash?: string
          id?: string
          modelo?: string
          ordem?: number
          secao?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_chunks_documento_chave_fkey"
            columns: ["documento_chave"]
            isOneToOne: false
            referencedRelation: "rag_documentos"
            referencedColumns: ["chave"]
          },
        ]
      }
      rag_consultas: {
        Row: {
          chunk_ids: string[]
          consulta: string
          criado_em: string
          id: string
          latencia_ms: number | null
          lead_id: string | null
          melhor_similaridade: number | null
          modo: string
          motivo_recuo: string | null
          similaridades: number[]
        }
        Insert: {
          chunk_ids?: string[]
          consulta: string
          criado_em?: string
          id?: string
          latencia_ms?: number | null
          lead_id?: string | null
          melhor_similaridade?: number | null
          modo: string
          motivo_recuo?: string | null
          similaridades?: number[]
        }
        Update: {
          chunk_ids?: string[]
          consulta?: string
          criado_em?: string
          id?: string
          latencia_ms?: number | null
          lead_id?: string | null
          melhor_similaridade?: number | null
          modo?: string
          motivo_recuo?: string | null
          similaridades?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "rag_consultas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_documentos: {
        Row: {
          ativo: boolean
          chave: string
          conteudo_hash: string | null
          criado_em: string
          erro: string | null
          escopo: string
          indexado_em: string | null
          modelo_embedding: string | null
          n_trechos: number
          status: string
          titulo: string | null
        }
        Insert: {
          ativo?: boolean
          chave: string
          conteudo_hash?: string | null
          criado_em?: string
          erro?: string | null
          escopo: string
          indexado_em?: string | null
          modelo_embedding?: string | null
          n_trechos?: number
          status?: string
          titulo?: string | null
        }
        Update: {
          ativo?: boolean
          chave?: string
          conteudo_hash?: string | null
          criado_em?: string
          erro?: string | null
          escopo?: string
          indexado_em?: string | null
          modelo_embedding?: string | null
          n_trechos?: number
          status?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_documentos_chave_fkey"
            columns: ["chave"]
            isOneToOne: true
            referencedRelation: "configuracoes"
            referencedColumns: ["chave"]
          },
        ]
      }
      regras_envio: {
        Row: {
          aquecimento_dias: number
          aquecimento_inicial: number
          atualizado_em: string
          atualizado_por: string | null
          campanha_exige_base_legal: boolean
          id: boolean
          limite_diario: number
          limite_opt_out_pct: number
          max_tentativas_sem_resposta: number
          minimo_envios_para_pausa: number
        }
        Insert: {
          aquecimento_dias?: number
          aquecimento_inicial?: number
          atualizado_em?: string
          atualizado_por?: string | null
          campanha_exige_base_legal?: boolean
          id?: boolean
          limite_diario?: number
          limite_opt_out_pct?: number
          max_tentativas_sem_resposta?: number
          minimo_envios_para_pausa?: number
        }
        Update: {
          aquecimento_dias?: number
          aquecimento_inicial?: number
          atualizado_em?: string
          atualizado_por?: string | null
          campanha_exige_base_legal?: boolean
          id?: boolean
          limite_diario?: number
          limite_opt_out_pct?: number
          max_tentativas_sem_resposta?: number
          minimo_envios_para_pausa?: number
        }
        Relationships: []
      }
      rodizio_atribuicoes: {
        Row: {
          autor_id: string | null
          criado_em: string
          id: number
          lead_id: string | null
          origem: string
          vendedor_id: string
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          id?: never
          lead_id?: string | null
          origem: string
          vendedor_id: string
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          id?: never
          lead_id?: string | null
          origem?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rodizio_atribuicoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rodizio_atribuicoes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_titular: {
        Row: {
          concluido_em: string | null
          descricao: string | null
          id: string
          lead_id: string | null
          responsavel_id: string | null
          resposta: string | null
          solicitado_em: string
          status: string
          telefone_chave: string | null
          tipo: string
        }
        Insert: {
          concluido_em?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          responsavel_id?: string | null
          resposta?: string | null
          solicitado_em?: string
          status?: string
          telefone_chave?: string | null
          tipo: string
        }
        Update: {
          concluido_em?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          responsavel_id?: string | null
          resposta?: string | null
          solicitado_em?: string
          status?: string
          telefone_chave?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_titular_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_titular_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          concluida_em: string | null
          criado_em: string
          criado_por: string | null
          id: string
          lead_id: string
          origem: string
          responsavel_id: string | null
          tipo: string
          titulo: string
          vence_em: string
        }
        Insert: {
          concluida_em?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          lead_id: string
          origem?: string
          responsavel_id?: string | null
          tipo?: string
          titulo: string
          vence_em: string
        }
        Update: {
          concluida_em?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          lead_id?: string
          origem?: string
          responsavel_id?: string | null
          tipo?: string
          titulo?: string
          vence_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_instancia: {
        Row: {
          dia: string
          enviados: number
          instance_id: string
        }
        Insert: {
          dia: string
          enviados?: number
          instance_id: string
        }
        Update: {
          dia?: string
          enviados?: number
          instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uso_instancia_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
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
          limite_diario: number | null
          no_rodizio: boolean
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
          limite_diario?: number | null
          no_rodizio?: boolean
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
          limite_diario?: number | null
          no_rodizio?: boolean
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
          aquecimento_inicio: string | null
          created_at: string
          id: string
          instance_name: string
          limite_diario: number | null
          qr_code: string | null
          qr_code_expires_at: string | null
          status: string
        }
        Insert: {
          api_key: string
          api_url: string
          aquecimento_inicio?: string | null
          created_at?: string
          id?: string
          instance_name: string
          limite_diario?: number | null
          qr_code?: string | null
          qr_code_expires_at?: string | null
          status?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          aquecimento_inicio?: string | null
          created_at?: string
          id?: string
          instance_name?: string
          limite_diario?: number | null
          qr_code?: string | null
          qr_code_expires_at?: string | null
          status?: string
        }
        Relationships: []
      }
      whatsapp_lid_map: {
        Row: {
          atualizado_em: string
          lid: string
          telefone: string
        }
        Insert: {
          atualizado_em?: string
          lid: string
          telefone: string
        }
        Update: {
          atualizado_em?: string
          lid?: string
          telefone?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          autor: string | null
          contact_id: string | null
          content: string | null
          created_at: string
          duration_seconds: number | null
          from_me: boolean
          id: string
          instance_id: string | null
          lead_id: string | null
          media_url: string | null
          mensagem_agendada_id: string | null
          message_id: string | null
          message_type: string | null
          mime_type: string | null
          remote_jid: string | null
          status: string | null
        }
        Insert: {
          autor?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string
          duration_seconds?: number | null
          from_me?: boolean
          id?: string
          instance_id?: string | null
          lead_id?: string | null
          media_url?: string | null
          mensagem_agendada_id?: string | null
          message_id?: string | null
          message_type?: string | null
          mime_type?: string | null
          remote_jid?: string | null
          status?: string | null
        }
        Update: {
          autor?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string
          duration_seconds?: number | null
          from_me?: boolean
          id?: string
          instance_id?: string | null
          lead_id?: string | null
          media_url?: string | null
          mensagem_agendada_id?: string | null
          message_id?: string | null
          message_type?: string | null
          mime_type?: string | null
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
      leads_telefone_duplicado: {
        Row: {
          lead_ids: string[] | null
          quantidade: number | null
          telefone_chave: string | null
          vendedores: string[] | null
        }
        Relationships: []
      }
      lotes_painel: {
        Row: {
          created_at: string | null
          id: string | null
          metragem: number | null
          numero_lote: string | null
          observacoes: string | null
          posicao_x: number | null
          posicao_y: number | null
          quadra: string | null
          status: string | null
          tipo: string | null
          valor: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          metragem?: number | null
          numero_lote?: string | null
          observacoes?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          quadra?: string | null
          status?: string | null
          tipo?: string | null
          valor?: never
        }
        Update: {
          created_at?: string | null
          id?: string | null
          metragem?: number | null
          numero_lote?: string | null
          observacoes?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          quadra?: string | null
          status?: string | null
          tipo?: string | null
          valor?: never
        }
        Relationships: []
      }
      meta_campanha_resultado: {
        Row: {
          campaign_id: string | null
          tipo_resultado: string | null
        }
        Insert: {
          campaign_id?: string | null
          tipo_resultado?: never
        }
        Update: {
          campaign_id?: string | null
          tipo_resultado?: never
        }
        Relationships: []
      }
      vw_followup_metricas: {
        Row: {
          cadencia: string | null
          cadencia_id: string | null
          entregues: number | null
          enviados: number | null
          etapa_ordem: number | null
          gatilho: string | null
          lidos: number | null
          opt_outs: number | null
          respondidos_72h: number | null
        }
        Relationships: []
      }
      vw_saude_fila: {
        Row: {
          aguardando_aprovacao: number | null
          enviadas_24h: number | null
          erros_24h: number | null
          inscricoes_atrasadas: number | null
          mais_antiga_min: number | null
          pendentes_vencidas: number | null
          ultima_execucao_cadencias: string | null
          ultima_execucao_cadencias_ok: boolean | null
          ultima_execucao_fila: string | null
          ultima_execucao_fila_ok: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      _inscrever: {
        Args: { p_cadencia_id: string; p_lead_id: string; p_visita_id?: string }
        Returns: string
      }
      acerto_classificador: {
        Args: never
        Returns: {
          acerto_pct: number
          acertos: number
          revisados: number
          versao_prompt: string
        }[]
      }
      agendar_etapas: { Args: { p_limite?: number }; Returns: number }
      ai_custo_diario: {
        Args: { p_dias?: number }
        Returns: {
          chamadas: number
          custo_usd: number
          dia: string
          erros: number
          funcao: string
          latencia_p50_ms: number
        }[]
      }
      alertar_saldo_meta: {
        Args: { p_detalhe: string; p_titulo: string }
        Returns: boolean
      }
      alertar_token_meta: { Args: { p_detalhe?: string }; Returns: boolean }
      aplicar_retencao: { Args: never; Returns: Json }
      aprovar_envio: {
        Args: { p_id: string; p_partes?: Json }
        Returns: undefined
      }
      atribuir_vendedor: {
        Args: { p_lead_id: string; p_vendedor_id: string }
        Returns: undefined
      }
      atualizar_score: { Args: { p_lead_id: string }; Returns: undefined }
      avisar_vendedor_formulario: {
        Args: { p_quantidade: number; p_vendedor_id: string }
        Returns: undefined
      }
      calcular_score: { Args: { p_lead_id: string }; Returns: number }
      cancelar_campanha: { Args: { p_cadencia_id: string }; Returns: undefined }
      cancelar_inscricao: {
        Args: { p_inscricao_id: string }
        Returns: undefined
      }
      chave_configuracao_sensivel: {
        Args: { p_chave: string }
        Returns: boolean
      }
      chave_telefone_br: { Args: { p: string }; Returns: string }
      checar_opt_out_cadencia: {
        Args: { p_cadencia_id: string; p_ordem: number }
        Returns: undefined
      }
      completar_anuncio_dos_leads: { Args: never; Returns: number }
      condicao_vigente_publica: {
        Args: never
        Returns: {
          entrada_percentual: number
          parcelas_max: number
        }[]
      }
      consumir_limite: {
        Args: { p_chave: string; p_janela_segundos: number; p_maximo: number }
        Returns: boolean
      }
      contagem_inscricoes: {
        Args: { p_cadencia_id: string }
        Returns: {
          status: string
          total: number
        }[]
      }
      criar_campanha: {
        Args: {
          p_instance_id?: string
          p_lead_ids: string[]
          p_midia?: Json
          p_nome: string
          p_template: string
        }
        Returns: string
      }
      definir_acessos: {
        Args: { p_acessos: string[]; p_profile_id: string }
        Returns: string[]
      }
      definir_condicao_vigente: { Args: { p_id: string }; Returns: undefined }
      definir_rodizio: { Args: { p_ativo: boolean }; Returns: number }
      definir_rodizio_formulario: {
        Args: { p_ativo: boolean }
        Returns: number
      }
      dentro_da_janela: { Args: { p_agora?: string }; Returns: boolean }
      desbloquear_contato: {
        Args: { p_justificativa: string; p_lead_id: string }
        Returns: undefined
      }
      devolver_carteira: {
        Args: { p_motivo: string; p_vendedor_id: string }
        Returns: number
      }
      enfileirar_aviso_vendedor: {
        Args: { p_lead_id: string; p_origem?: string; p_vendedor_id: string }
        Returns: undefined
      }
      enfileirar_resposta_ia: {
        Args: { p_instance_id: string; p_lead_id: string; p_telefone: string }
        Returns: undefined
      }
      envios_para_aprovar: {
        Args: never
        Returns: {
          cadencia: string
          criado_em: string
          etapa_ordem: number
          ia_motivo: string
          id: string
          lead_id: string
          lead_nome: string
          partes: Json
        }[]
      }
      etapa_ordem: { Args: { p_status: string }; Returns: number }
      excluir_lead_definitivo: { Args: { p_lead_id: string }; Returns: Json }
      excluir_lead_definitivo_impl: {
        Args: { p_lead_id: string }
        Returns: Json
      }
      followup_metricas: {
        Args: never
        Returns: {
          cadencia: string | null
          cadencia_id: string | null
          entregues: number | null
          enviados: number | null
          etapa_ordem: number | null
          gatilho: string | null
          lidos: number | null
          opt_outs: number | null
          respondidos_72h: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "vw_followup_metricas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      followup_respostas: {
        Args: { p_dias?: number }
        Returns: {
          intencao: string
          lead: string
          lead_id: string
          origem: string
          respondida_em: string
          resposta: string
          telefone: string
          vendedor: string
        }[]
      }
      forecast_mensal: {
        Args: { p_inicio: string; p_meses: number }
        Returns: {
          compras: number
          em_aberto: number
          mes: string
          ponderado: number
          propostas_abertas: number
          realizado: number
        }[]
      }
      gatilho_de_pesquisa: { Args: { p_gatilho: string }; Returns: boolean }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_my_vendedor_id: { Args: never; Returns: string }
      get_next_round_robin_salesperson: { Args: never; Returns: string }
      humano_ja_atendeu: { Args: { p_lead_id: string }; Returns: boolean }
      imagery_watchdog: { Args: never; Returns: Json }
      inicio_do_dia_brt: { Args: { p_dia: string }; Returns: string }
      inscrever_lead: {
        Args: { p_cadencia_id: string; p_lead_id: string }
        Returns: string
      }
      ler_atendimento_pesquisa: { Args: { p_texto: string }; Returns: boolean }
      ler_nota_pesquisa: { Args: { p_texto: string }; Returns: number }
      limite_diario_instancia: {
        Args: { p_agora?: string; p_instance_id: string }
        Returns: number
      }
      limpar_ai_chamadas: { Args: never; Returns: undefined }
      marketing_ads_resumo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          alcance_soma: number
          anuncios_com_gasto: number
          cliques: number
          cliques_link: number
          compras: number
          contatos: number
          conversas: number
          fim: string
          impressoes: number
          inicio: string
          investimento: number
          investimento_conversas: number
          investimento_leads: number
          leads: number
          leads_formulario: number
          leads_que_chamaram: number
          mensagens: number
          moeda: string
          periodo: string
          reservas: number
          valor_compras: number
        }[]
      }
      marketing_ads_serie: {
        Args: {
          p_fim: string
          p_id?: string
          p_inicio: string
          p_nivel?: string
        }
        Returns: {
          cliques_link: number
          data: string
          impressoes: number
          investimento: number
          leads: number
          mensagens: number
        }[]
      }
      marketing_ads_serie_campanhas: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          campanha_id: string
          campanha_nome: string
          data: string
          effective_status: string
          investimento: number
          leads: number
          mensagens: number
          tipo_resultado: string
        }[]
      }
      marketing_anuncios: {
        Args: { p_fim: string; p_inicio: string; p_nivel: string }
        Returns: {
          alcance_soma: number
          avisos: Json
          campanha_id: string
          campanha_nome: string
          cliques: number
          cliques_link: number
          compras: number
          conjunto_id: string
          conjunto_nome: string
          corpo: string
          criado_em: string
          destino: string
          effective_status: string
          id: string
          impressoes: number
          investimento: number
          leads: number
          mensagens: number
          nome: string
          objetivo: string
          orcamento_diario: number
          orcamento_total: number
          reservas: number
          status: string
          thumbnail_url: string
          tipo_resultado: string
          titulo: string
        }[]
      }
      marketing_breakdown: {
        Args: {
          p_fim: string
          p_id?: string
          p_inicio: string
          p_nivel?: string
          p_tipo: string
        }
        Returns: {
          cliques_link: number
          dim1: string
          dim2: string
          impressoes: number
          investimento: number
          leads: number
          mensagens: number
        }[]
      }
      marketing_funil_campanhas: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          agendados: number
          campanha_id: string
          campanha_nome: string
          contatos_meta: number
          effective_status: string
          investimento: number
          leads_crm: number
          propostas: number
          qualificados: number
          tipo_resultado: string
          vendas: number
          visitas: number
        }[]
      }
      marketing_ig_demografia: {
        Args: never
        Returns: {
          chave: string
          data: string
          tipo: string
          valor: number
        }[]
      }
      marketing_ig_midias: {
        Args: { p_fim: string; p_inicio: string; p_tipo?: string }
        Returns: {
          alcance: number
          caption: string
          comentarios: number
          compartilhamentos: number
          curtidas: number
          id: string
          imagem_url: string
          interacoes: number
          media_product_type: string
          media_type: string
          metricas_em: string
          permalink: string
          publicado_em: string
          respostas: number
          salvos: number
          tempo_medio_ms: number
          views: number
        }[]
      }
      marketing_ig_resumo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          metrica: string
          valor: number
          valor_anterior: number
        }[]
      }
      marketing_ig_serie: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          data: string
          metrica: string
          valor: number
        }[]
      }
      marketing_progresso_carga: {
        Args: never
        Returns: {
          atualizado_em: string
          carga: string
          concluido: boolean
          feitas: number
          limite: string
          proximo_ate: string
          total: number
          unidade: string
        }[]
      }
      marketing_status_integracao: {
        Args: never
        Returns: {
          codigo_erro: number
          detalhes: Json
          job: string
          registros: number
          ultima_em: string
          ultimo_erro: string
          ultimo_status: string
          ultimo_sucesso_em: string
        }[]
      }
      metas_x_realizado: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          alvo: number
          indicador: string
          meta_id: string
          percentual: number
          periodo_decorrido: number
          periodo_fim: string
          periodo_inicio: string
          realizado: number
          vendedor_id: string
          vendedor_nome: string
        }[]
      }
      meu_vendedor_id: { Args: never; Returns: string }
      minutos_uteis: {
        Args: { p_fim: string; p_inicio: string }
        Returns: number
      }
      motivos_cadencia: {
        Args: { p_cadencia_id: string }
        Returns: {
          motivo: string
          quantidade: number
        }[]
      }
      mudar_inscricao: {
        Args: { p_inscricao_id: string; p_motivo: string; p_status: string }
        Returns: undefined
      }
      notificar_gestao: {
        Args: {
          p_corpo: string
          p_link?: string
          p_tipo: string
          p_titulo: string
        }
        Returns: undefined
      }
      origem_automatica: { Args: { p: string }; Returns: boolean }
      pausar_inscricao: { Args: { p_inscricao_id: string }; Returns: undefined }
      pendencias_ativar_ia: { Args: never; Returns: string[] }
      pesquisa_pode_inscrever: { Args: { p_lead_id: string }; Returns: boolean }
      pesquisas_resumo: { Args: { p_dias?: number }; Returns: Json }
      pick_acervo_image: {
        Args: { p_brand_slug?: string; p_tag: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "imagery_acervo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pode_enviar: {
        Args: {
          p_agora?: string
          p_instance_id?: string
          p_lead_id: string
          p_tipo?: string
        }
        Returns: {
          motivo: string
          ok: boolean
        }[]
      }
      pode_ver_lead: { Args: { p_lead_id: string }; Returns: boolean }
      prazo_util: {
        Args: { p_agora?: string; p_minutos: number }
        Returns: string
      }
      progresso_cadencia: {
        Args: { p_cadencia_id: string }
        Returns: {
          aguardando: number
          concluidos: number
          enviados: number
          erros: number
          na_fila: number
          pulados: number
          total: number
        }[]
      }
      proxima_etapa: {
        Args: { p_depois_de: number; p_inscricao_id: string }
        Returns: {
          ordem: number
          vence_em: string
        }[]
      }
      proximo_horario_util: { Args: { p_agora?: string }; Returns: string }
      proximo_vendedor_da_fila: { Args: never; Returns: string }
      rag_buscar: {
        Args: {
          p_candidatos?: number
          p_consulta: string
          p_embedding: string
          p_escopo?: string
          p_limite?: number
        }
        Returns: {
          chunk_id: string
          conteudo: string
          documento: string
          ordem: number
          rank_texto: number
          rank_vetor: number
          score: number
          secao: string
          similaridade: number
        }[]
      }
      rag_buscar_hibrido: {
        Args: {
          p_candidatos: number
          p_consulta: string
          p_embedding: string
          p_escopo: string
          p_limite: number
          p_peso_texto: number
          p_peso_vetor: number
          p_rrf_k: number
        }
        Returns: {
          chunk_id: string
          conteudo: string
          documento: string
          ordem: number
          rank_texto: number
          rank_vetor: number
          score: number
          secao: string
          similaridade: number
        }[]
      }
      rag_segredo_valido: { Args: { p_segredo: string }; Returns: boolean }
      rag_substituir_chunks: {
        Args: {
          p_conteudo_hash: string
          p_documento: string
          p_modelo: string
          p_titulo: string
          p_trechos: Json
        }
        Returns: Json
      }
      realizado_do_indicador: {
        Args: {
          p_fim: string
          p_indicador: string
          p_inicio: string
          p_vendedor: string
        }
        Returns: number
      }
      recalcular_entradas: { Args: { p_lead_id: string }; Returns: undefined }
      registrar_evento_envio: {
        Args: {
          p_etapa?: number
          p_evento: string
          p_inscricao_id: string
          p_mensagem_id?: string
          p_motivo?: string
        }
        Returns: undefined
      }
      registrar_lead_formulario: { Args: { p: Json }; Returns: Json }
      registrar_origem_anuncio: {
        Args: {
          p_anuncio_id: string
          p_ctwa_clid?: string
          p_lead_id: string
          p_titulo?: string
          p_url?: string
        }
        Returns: boolean
      }
      reivindicar_avisos_vendedor: {
        Args: { p_limite?: number }
        Returns: {
          agendado_para: string
          atualizado_em: string
          criado_em: string
          enviado_em: string | null
          erro: string | null
          id: string
          lead_id: string
          origem: string
          status: string
          tentativas: number
          vendedor_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "avisos_vendedor"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reivindicar_mensagens_agendadas: {
        Args: { p_limite?: number }
        Returns: {
          agendado_para: string
          aprovado_por: string | null
          atualizado_em: string
          chave_idempotencia: string | null
          criado_em: string
          enviado_em: string | null
          erro: string | null
          etapa_ordem: number | null
          ia_motivo: string | null
          ia_prompt_versao: string | null
          id: string
          inscricao_id: string | null
          instance_id: string | null
          lead_id: string
          midia: Json | null
          partes: Json
          partes_enviadas: number
          status: string
          telefone: string
          tentativas: number
          tipo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mensagens_agendadas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rejeitar_envio: { Args: { p_id: string }; Returns: undefined }
      relatorio_conversao: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          agendados: number
          chave: string
          dimensao: string
          entraram: number
          fechados: number
          perdidos: number
          propostas: number
          qualificados: number
          rotulo: string
          taxa_agendamento: number
          taxa_fechamento: number
          taxa_geral: number
          taxa_proposta: number
          taxa_qualificacao: number
          taxa_visita: number
          visitaram: number
        }[]
      }
      relatorio_tempo_por_etapa: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          em_andamento: number
          etapa: string
          media_horas: number
          media_horas_em_andamento: number
          mediana_horas: number
          ordem: number
          passagens: number
        }[]
      }
      renderizar_template: {
        Args: { p_lead_id: string; p_template: string; p_visita_id?: string }
        Returns: Json
      }
      retomar_cadencia: { Args: { p_cadencia_id: string }; Returns: undefined }
      retomar_inscricao: {
        Args: { p_inscricao_id: string }
        Returns: undefined
      }
      rodizio_ativo: { Args: never; Returns: boolean }
      rodizio_carteira_aberta: {
        Args: { p_vendedor_id: string }
        Returns: number
      }
      rodizio_distribuir_automatico: { Args: never; Returns: number }
      rodizio_distribuir_espera: {
        Args: { p_confirmar?: boolean }
        Returns: Json
      }
      rodizio_exigir_gestao: { Args: never; Returns: undefined }
      rodizio_formulario_ativo: { Args: never; Returns: boolean }
      rodizio_historico: {
        Args: { p_limite?: number }
        Returns: {
          autor_nome: string
          criado_em: string
          id: number
          lead_id: string
          lead_nome: string
          origem: string
          vendedor_id: string
          vendedor_nome: string
          whatsapp_em: string
          whatsapp_motivo: string
          whatsapp_situacao: string
        }[]
      }
      rodizio_inicio_do_dia: { Args: never; Returns: string }
      rodizio_leads_em_espera: { Args: never; Returns: string[] }
      rodizio_ligar: { Args: { p_ativo: boolean }; Returns: boolean }
      rodizio_lote: { Args: never; Returns: number }
      rodizio_modo: { Args: never; Returns: string }
      rodizio_mover: {
        Args: { p_direcao: number; p_vendedor_id: string }
        Returns: undefined
      }
      rodizio_painel: { Args: never; Returns: Json }
      rodizio_recebidos_hoje: {
        Args: { p_vendedor_id: string }
        Returns: number
      }
      salvar_cadencia: {
        Args: { p_cadencia: Json; p_etapas: Json }
        Returns: string
      }
      saude_fila: {
        Args: never
        Returns: {
          enviadas_24h: number
          erros_24h: number
          mais_antiga_min: number
          pendentes_vencidas: number
          ultima_execucao: string
          ultima_execucao_ok: boolean
        }[]
      }
      saude_fila_completa: {
        Args: never
        Returns: {
          aguardando_aprovacao: number | null
          enviadas_24h: number | null
          erros_24h: number | null
          inscricoes_atrasadas: number | null
          mais_antiga_min: number | null
          pendentes_vencidas: number | null
          ultima_execucao_cadencias: string | null
          ultima_execucao_cadencias_ok: boolean | null
          ultima_execucao_fila: string | null
          ultima_execucao_fila_ok: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "vw_saude_fila"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      segredo_interno_valido: {
        Args: { p_nome: string; p_segredo: string }
        Returns: boolean
      }
      segredo_webhook_evolution: { Args: never; Returns: string }
      sem_acento: { Args: { p: string }; Returns: string }
      sincronizar_fatos_condicao: { Args: never; Returns: undefined }
      sla_leads: {
        Args: { p_dias?: number; p_lead_id?: string }
        Returns: {
          aguardando_desde: string
          aguardando_estourado: boolean
          aguardando_min: number
          lead_id: string
          lead_nome: string
          primeira_entrada_em: string
          primeira_resposta_em: string
          primeira_resposta_estourada: boolean
          primeira_resposta_min: number
          ultima_entrada_em: string
          vendedor_id: string
          vendedor_nome: string
        }[]
      }
      sla_metas: {
        Args: never
        Returns: {
          primeira_resposta_min: number
          retorno_handoff_min: number
          sem_resposta_min: number
        }[]
      }
      sla_por_vendedor: {
        Args: { p_dias?: number }
        Returns: {
          aguardando: number
          aguardando_estourado: number
          leads_medidos: number
          mediana_primeira_resposta_min: number
          primeira_resposta_estourada: number
          vendedor_id: string
          vendedor_nome: string
        }[]
      }
      sou_gestao: { Args: never; Returns: boolean }
      sync_lote_status: { Args: { p_lote_id: string }; Returns: undefined }
      takeovers_abertos: {
        Args: never
        Returns: {
          desde: string
          session_id: string
        }[]
      }
      telefone_chave: { Args: { p_telefone: string }; Returns: string }
      upsert_lead_from_form:
        | {
            Args: {
              p_cidade: string
              p_email: string
              p_metragem_interesse: number
              p_nome: string
              p_telefone: string
              p_tipo_lote_interesse: string
            }
            Returns: string
          }
        | {
            Args: {
              p_cidade: string
              p_consentimento_versao: string
              p_email: string
              p_metragem_interesse: number
              p_nome: string
              p_telefone: string
              p_tipo_lote_interesse: string
            }
            Returns: string
          }
      url_webhook_evolution: { Args: never; Returns: string }
      vencimento_etapa: {
        Args: { p_inscricao_id: string; p_ordem: number }
        Returns: string
      }
      vigiar_fila: { Args: never; Returns: string[] }
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
    Enums: {
      user_role: ["admin", "gestor", "vendedor"],
    },
  },
} as const

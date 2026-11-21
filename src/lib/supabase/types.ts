export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          role: string;
          telegram_id: number | null;
          updated_at: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          role?: string;
          telegram_id?: number | null;
          updated_at?: string;
          username: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          role?: string;
          telegram_id?: number | null;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          bot_mode: string;
          bot_token_encrypted: string | null;
          bot_username: string | null;
          id: number;
          low_balance_threshold: number;
          max_deposit_amount: number;
          owner_telegram_id: number | null;
          owner_username: string | null;
          ppob_enabled: boolean;
          ppob_markup_large_pct: number;
          ppob_markup_small_pct: number;
          ppob_markup_threshold: number;
          ppob_proxy_url: string | null;
          updated_at: string;
          webhook_secret: string | null;
        };
        Insert: {
          bot_mode?: string;
          bot_token_encrypted?: string | null;
          bot_username?: string | null;
          id?: number;
          low_balance_threshold?: number;
          max_deposit_amount?: number;
          owner_telegram_id?: number | null;
          owner_username?: string | null;
          ppob_enabled?: boolean;
          ppob_markup_large_pct?: number;
          ppob_markup_small_pct?: number;
          ppob_markup_threshold?: number;
          ppob_proxy_url?: string | null;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Update: {
          bot_mode?: string;
          bot_token_encrypted?: string | null;
          bot_username?: string | null;
          id?: number;
          low_balance_threshold?: number;
          max_deposit_amount?: number;
          owner_telegram_id?: number | null;
          owner_username?: string | null;
          ppob_enabled?: boolean;
          ppob_markup_large_pct?: number;
          ppob_markup_small_pct?: number;
          ppob_markup_threshold?: number;
          ppob_proxy_url?: string | null;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Relationships: [];
      };
      auth_audit_logs: {
        Row: {
          created_at: string;
          id: number;
          ip_address: string | null;
          status: string;
          user_agent: string | null;
          user_id: string | null;
          username_attempted: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          ip_address?: string | null;
          status: string;
          user_agent?: string | null;
          user_id?: string | null;
          username_attempted?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          ip_address?: string | null;
          status?: string;
          user_agent?: string | null;
          user_id?: string | null;
          username_attempted?: string | null;
        };
        Relationships: [];
      };
      bot_message_templates: {
        Row: {
          content: string;
          key: string;
          label: string;
          updated_at: string;
        };
        Insert: {
          content: string;
          key: string;
          label: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          key?: string;
          label?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bot_user_states: {
        Row: {
          expires_at: string;
          payload: Json;
          step: string;
          telegram_id: number;
          updated_at: string;
        };
        Insert: {
          expires_at?: string;
          payload?: Json;
          step: string;
          telegram_id: number;
          updated_at?: string;
        };
        Update: {
          expires_at?: string;
          payload?: Json;
          step?: string;
          telegram_id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      broadcast_logs: {
        Row: {
          content: string | null;
          created_at: string;
          created_by: string | null;
          failed_count: number;
          id: string;
          media_path: string | null;
          message_type: string;
          success_count: number;
          target_scope: string;
          total_targets: number;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          media_path?: string | null;
          message_type: string;
          success_count?: number;
          target_scope: string;
          total_targets?: number;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          media_path?: string | null;
          message_type?: string;
          success_count?: number;
          target_scope?: string;
          total_targets?: number;
        };
        Relationships: [];
      };
      deposit_requests: {
        Row: {
          amount: number;
          approved_amount: number | null;
          created_at: string;
          id: string;
          processed_at: string | null;
          processed_by: string | null;
          proof_file_path: string | null;
          reseller_id: string;
          status: string;
        };
        Insert: {
          amount: number;
          approved_amount?: number | null;
          created_at?: string;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          proof_file_path?: string | null;
          reseller_id: string;
          status?: string;
        };
        Update: {
          amount?: number;
          approved_amount?: number | null;
          created_at?: string;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          proof_file_path?: string | null;
          reseller_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deposit_requests_reseller_id_fkey";
            columns: ["reseller_id"];
            isOneToOne: false;
            referencedRelation: "resellers";
            referencedColumns: ["id"];
          },
        ];
      };
      password_reset_otps: {
        Row: {
          attempts: number;
          created_at: string;
          expires_at: string;
          id: number;
          otp_hash: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          expires_at: string;
          id?: never;
          otp_hash: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          expires_at?: string;
          id?: never;
          otp_hash?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      ppob_daily_counters: {
        Row: {
          product_code: string;
          target_number: string;
          telegram_id: number;
          tx_count: number;
          tx_date: string;
          updated_at: string;
        };
        Insert: {
          product_code: string;
          target_number: string;
          telegram_id: number;
          tx_count?: number;
          tx_date: string;
          updated_at?: string;
        };
        Update: {
          product_code?: string;
          target_number?: string;
          telegram_id?: number;
          tx_count?: number;
          tx_date?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ppob_transactions: {
        Row: {
          cost_price: number;
          created_at: string;
          customer_id: string | null;
          description: string | null;
          id: number;
          legacy_id: number | null;
          product_code: string;
          profit: number;
          raw_response: Json | null;
          reseller_id: string | null;
          sell_price: number;
          serial_number: string | null;
          source: string;
          status: string;
          target_number: string;
          telegram_id: number;
          trx_id: string;
          updated_at: string;
        };
        Insert: {
          cost_price?: number;
          created_at?: string;
          customer_id?: string | null;
          description?: string | null;
          id?: never;
          legacy_id?: number | null;
          product_code: string;
          profit?: number;
          raw_response?: Json | null;
          reseller_id?: string | null;
          sell_price?: number;
          serial_number?: string | null;
          source?: string;
          status?: string;
          target_number: string;
          telegram_id: number;
          trx_id: string;
          updated_at?: string;
        };
        Update: {
          cost_price?: number;
          created_at?: string;
          customer_id?: string | null;
          description?: string | null;
          id?: never;
          legacy_id?: number | null;
          product_code?: string;
          profit?: number;
          raw_response?: Json | null;
          reseller_id?: string | null;
          sell_price?: number;
          serial_number?: string | null;
          source?: string;
          status?: string;
          target_number?: string;
          telegram_id?: number;
          trx_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ppob_transactions_reseller_id_fkey";
            columns: ["reseller_id"];
            isOneToOne: false;
            referencedRelation: "resellers";
            referencedColumns: ["id"];
          },
        ];
      };
      resellers: {
        Row: {
          balance: number;
          id: string;
          joined_at: string;
          notes: string | null;
          phone: string | null;
          reseller_type: string | null;
          status: string;
          telegram_id: number;
          updated_at: string;
          username: string;
          vouchers_sold: number;
        };
        Insert: {
          balance?: number;
          id?: string;
          joined_at?: string;
          notes?: string | null;
          phone?: string | null;
          reseller_type?: string | null;
          status?: string;
          telegram_id: number;
          updated_at?: string;
          username: string;
          vouchers_sold?: number;
        };
        Update: {
          balance?: number;
          id?: string;
          joined_at?: string;
          notes?: string | null;
          phone?: string | null;
          reseller_type?: string | null;
          status?: string;
          telegram_id?: number;
          updated_at?: string;
          username?: string;
          vouchers_sold?: number;
        };
        Relationships: [];
      };
      routers: {
        Row: {
          allow_self_signed_tls: boolean;
          connection_mode: string;
          created_at: string;
          dns_name: string;
          host: string;
          id: string;
          is_active: boolean;
          is_default: boolean;
          name: string;
          password_encrypted: string;
          port: number;
          ros_version: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          allow_self_signed_tls?: boolean;
          connection_mode?: string;
          created_at?: string;
          dns_name: string;
          host: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name: string;
          password_encrypted: string;
          port?: number;
          ros_version?: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          allow_self_signed_tls?: boolean;
          connection_mode?: string;
          created_at?: string;
          dns_name?: string;
          host?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name?: string;
          password_encrypted?: string;
          port?: number;
          ros_version?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      telegram_processed_updates: {
        Row: {
          processed_at: string;
          update_id: number;
        };
        Insert: {
          processed_at?: string;
          update_id: number;
        };
        Update: {
          processed_at?: string;
          update_id?: number;
        };
        Relationships: [];
      };
      voucher_batches: {
        Row: {
          batch_code: string;
          created_at: string;
          created_by: string | null;
          deducted_balance: boolean;
          id: string;
          package_id: string | null;
          package_name: string;
          quantity: number;
          reseller_id: string | null;
          router_id: string | null;
          source: string;
          telegram_error: string | null;
          telegram_sent: boolean;
          unit_price: number;
        };
        Insert: {
          batch_code: string;
          created_at?: string;
          created_by?: string | null;
          deducted_balance?: boolean;
          id?: string;
          package_id?: string | null;
          package_name: string;
          quantity?: number;
          reseller_id?: string | null;
          router_id?: string | null;
          source?: string;
          telegram_error?: string | null;
          telegram_sent?: boolean;
          unit_price?: number;
        };
        Update: {
          batch_code?: string;
          created_at?: string;
          created_by?: string | null;
          deducted_balance?: boolean;
          id?: string;
          package_id?: string | null;
          package_name?: string;
          quantity?: number;
          reseller_id?: string | null;
          router_id?: string | null;
          source?: string;
          telegram_error?: string | null;
          telegram_sent?: boolean;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "voucher_batches_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "voucher_packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voucher_batches_reseller_id_fkey";
            columns: ["reseller_id"];
            isOneToOne: false;
            referencedRelation: "resellers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voucher_batches_router_id_fkey";
            columns: ["router_id"];
            isOneToOne: false;
            referencedRelation: "routers";
            referencedColumns: ["id"];
          },
        ];
      };
      voucher_packages: {
        Row: {
          card_color: string;
          char_type: string;
          code_length: number;
          created_at: string;
          id: string;
          is_active: boolean;
          legacy_slot_id: string | null;
          limit_download_mb: number;
          limit_total_mb: number;
          limit_upload_mb: number;
          limit_uptime: string | null;
          login_type: string;
          markup: number;
          menu_label: string;
          mikrotik_profile: string;
          mikrotik_server: string;
          mode: string;
          name: string;
          price: number;
          router_id: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          card_color?: string;
          char_type?: string;
          code_length?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          legacy_slot_id?: string | null;
          limit_download_mb?: number;
          limit_total_mb?: number;
          limit_upload_mb?: number;
          limit_uptime?: string | null;
          login_type?: string;
          markup?: number;
          menu_label: string;
          mikrotik_profile: string;
          mikrotik_server?: string;
          mode?: string;
          name: string;
          price?: number;
          router_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          card_color?: string;
          char_type?: string;
          code_length?: number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          legacy_slot_id?: string | null;
          limit_download_mb?: number;
          limit_total_mb?: number;
          limit_upload_mb?: number;
          limit_uptime?: string | null;
          login_type?: string;
          markup?: number;
          menu_label?: string;
          mikrotik_profile?: string;
          mikrotik_server?: string;
          mode?: string;
          name?: string;
          price?: number;
          router_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voucher_packages_router_id_fkey";
            columns: ["router_id"];
            isOneToOne: false;
            referencedRelation: "routers";
            referencedColumns: ["id"];
          },
        ];
      };
      vouchers: {
        Row: {
          batch_id: string | null;
          card_color: string | null;
          created_at: string;
          data_limit_label: string | null;
          dns_name: string | null;
          id: number;
          login_type: string;
          markup: number;
          mikrotik_api_id: string | null;
          net_cost: number;
          package_id: string | null;
          password: string;
          price: number;
          profile: string | null;
          reseller_id: string | null;
          status: string;
          time_limit: string | null;
          username: string;
        };
        Insert: {
          batch_id?: string | null;
          card_color?: string | null;
          created_at?: string;
          data_limit_label?: string | null;
          dns_name?: string | null;
          id?: never;
          login_type?: string;
          markup?: number;
          mikrotik_api_id?: string | null;
          net_cost?: number;
          package_id?: string | null;
          password: string;
          price?: number;
          profile?: string | null;
          reseller_id?: string | null;
          status?: string;
          time_limit?: string | null;
          username: string;
        };
        Update: {
          batch_id?: string | null;
          card_color?: string | null;
          created_at?: string;
          data_limit_label?: string | null;
          dns_name?: string | null;
          id?: never;
          login_type?: string;
          markup?: number;
          mikrotik_api_id?: string | null;
          net_cost?: number;
          package_id?: string | null;
          password?: string;
          price?: number;
          profile?: string | null;
          reseller_id?: string | null;
          status?: string;
          time_limit?: string | null;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vouchers_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "voucher_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vouchers_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "voucher_packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vouchers_reseller_id_fkey";
            columns: ["reseller_id"];
            isOneToOne: false;
            referencedRelation: "resellers";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_transactions: {
        Row: {
          amount: number;
          balance_after: number;
          balance_before: number;
          created_at: string;
          id: number;
          legacy_no: number | null;
          markup_amount: number | null;
          notes: string | null;
          reseller_id: string | null;
          router_name: string | null;
          seller_name: string | null;
          status: string;
          telegram_id: number;
          topup_by: string | null;
          tx_type: string;
          voucher_password: string | null;
          voucher_price: number | null;
          voucher_profile: string | null;
          voucher_username: string | null;
        };
        Insert: {
          amount?: number;
          balance_after?: number;
          balance_before?: number;
          created_at?: string;
          id?: never;
          legacy_no?: number | null;
          markup_amount?: number | null;
          notes?: string | null;
          reseller_id?: string | null;
          router_name?: string | null;
          seller_name?: string | null;
          status?: string;
          telegram_id: number;
          topup_by?: string | null;
          tx_type: string;
          voucher_password?: string | null;
          voucher_price?: number | null;
          voucher_profile?: string | null;
          voucher_username?: string | null;
        };
        Update: {
          amount?: number;
          balance_after?: number;
          balance_before?: number;
          created_at?: string;
          id?: never;
          legacy_no?: number | null;
          markup_amount?: number | null;
          notes?: string | null;
          reseller_id?: string | null;
          router_name?: string | null;
          seller_name?: string | null;
          status?: string;
          telegram_id?: number;
          topup_by?: string | null;
          tx_type?: string;
          voucher_password?: string | null;
          voucher_price?: number | null;
          voucher_profile?: string | null;
          voucher_username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_reseller_id_fkey";
            columns: ["reseller_id"];
            isOneToOne: false;
            referencedRelation: "resellers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      rpc_adjust_balance: {
        Args: {
          p_actor?: string;
          p_delta: number;
          p_notes?: string;
          p_telegram_id: number;
          p_tx_type: string;
        };
        Returns: {
          balance_after: number;
          balance_before: number;
          reseller_id: string;
          transaction_id: number;
        }[];
      };
      rpc_next_ppob_counter: {
        Args: {
          p_product_code: string;
          p_target_number: string;
          p_telegram_id: number;
          p_tx_date: string;
        };
        Returns: number;
      };
      rpc_refund_balance: {
        Args: { p_reason?: string; p_tx_id: number };
        Returns: {
          balance_after: number;
          refund_tx_id: number;
          refunded_amount: number;
          reseller_id: string;
        }[];
      };
      rpc_reserve_balance: {
        Args: {
          p_amount: number;
          p_meta?: Json;
          p_telegram_id: number;
          p_tx_type: string;
        };
        Returns: {
          balance_after: number;
          balance_before: number;
          reseller_id: string;
          transaction_id: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

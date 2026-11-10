// Schema reference for the shared `orders` table. The app no longer queries it
// directly with the typed client — all access goes through the anon-key RPCs in
// `orders.rpc.ts` — but this documents the real column layout (kept in sync with
// the unified Supabase schema).
export type OrderStatus =
    | "pending"
    | "awaiting_payment"
    | "processing"
    | "cancelled"
    | "completed";

export interface OrderRow {
    id: string;
    order_number: number;
    site_name: string | null;          // brand/site the order belongs to (multi-tenant)
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    customer_country: string | null;
    plan_id: string;
    plan_name: string;
    plan_duration: string;
    plan_price: number;
    connections: number;               // 1–5 simultaneous device connections
    device_type: string | null;
    has_iptv_player: boolean | null;
    panel_type: string | null;         // provisioning panel (dino/kemo/trex/…)
    payment_method: string | null;
    payment_reference: Record<string, unknown> | null; // jsonb: provider refs
    paypal_email: string | null;       // PayPal account assigned (round-robin)
    paypal_txn_id: string | null;      // customer-supplied PayPal transaction ID
    session_expires_at: string | null; // checkout session deadline (auto-cancel after)
    status: OrderStatus;
    processed_client_id: string | null; // dashboard client that fulfilled the order
    created_at: string;
    updated_at: string;
}

export interface Database {
    public: {
        Tables: {
            orders: {
                Row: OrderRow;
                Insert: Omit<OrderRow, "id" | "order_number" | "created_at" | "updated_at"> & {
                    id?: string;
                    order_number?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: Partial<Omit<OrderRow, "id" | "order_number" | "created_at">>;
            };
        };
        Enums: {
            order_status: OrderStatus;
        };
    };
}

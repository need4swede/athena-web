export interface StudentFee {
    id: number;
    student_id: number;
    maintenance_id?: number;
    amount: number;
    description: string;
    created_at: string;
    created_by_user_id: number;
    payments: FeePayment[];
    balance: number;
    device_asset_tag?: string;
}

export interface FeePayment {
    id: number;
    student_fee_id: number;
    amount: number;
    payment_method?: string;
    notes?: string;
    processed_by_user_id: number;
    created_at: string;
    transaction_id?: string;
}

export interface DeviceHistoryEvent {
    id: number;
    event_type: 'Check-In' | 'Check-Out' | 'Repair' | 'Retired';
    event_date: string;
    details: {
        admin_name?: string;
        admin_email?: string;
        student_name?: string;
        student_email?: string;
    };
    notes?: string;
    admin_name: string;
    admin_email: string;
    student_first_name: string;
    student_last_name: string;
    student_email: string;
    signature?: string;
    checkout_id?: number;
}

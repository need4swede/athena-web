-- Migration 014: Add archived_fee_payments table for insurance payment carryover

CREATE TABLE IF NOT EXISTS archived_fee_payments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    original_fee_id INTEGER,
    original_payment_id INTEGER,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    notes TEXT,
    processed_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    transaction_id VARCHAR(12) NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_student_id ON archived_fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_transaction_id ON archived_fee_payments(transaction_id);

COMMENT ON TABLE archived_fee_payments IS 'Stores insurance payments from replaced/deleted fees for future credit/carryover.';

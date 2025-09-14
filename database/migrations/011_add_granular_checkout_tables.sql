-- Migration 011: Add Granular Checkout System Tables
-- Ensures all tables and columns needed for the granular checkout system are present
-- This migration is idempotent and can be run multiple times safely

-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. Operation idempotency table for preventing duplicate operations
CREATE TABLE IF NOT EXISTS operation_idempotency (
    id SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    operation_type VARCHAR(100) NOT NULL,
    operation_result JSONB,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_operation_idempotency_key ON operation_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_operation_idempotency_expires ON operation_idempotency(expires_at);

-- 2. Checkout sessions table for tracking overall checkout progress
CREATE TABLE IF NOT EXISTS checkout_sessions (
    id VARCHAR(255) PRIMARY KEY,
    chromebook_id INTEGER REFERENCES chromebooks(id),
    student_id VARCHAR(50) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    checkout_data JSONB,
    overall_status VARCHAR(50) DEFAULT 'in_progress' CHECK (overall_status IN ('in_progress', 'completed', 'failed', 'cancelled', 'rollback_completed', 'rollback_failed')),
    current_step VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_chromebook_id ON checkout_sessions(chromebook_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_student_id ON checkout_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_overall_status ON checkout_sessions(overall_status);

-- 3. Checkout step tracking table for granular step monitoring
CREATE TABLE IF NOT EXISTS checkout_step_tracking (
    id SERIAL PRIMARY KEY,
    checkout_session_id VARCHAR(255) NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
    step_name VARCHAR(100) NOT NULL,
    step_idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rolled_back')),
    step_data JSONB,
    result_data JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_checkout_session_id ON checkout_step_tracking(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_step_idempotency_key ON checkout_step_tracking(step_idempotency_key);
CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_status ON checkout_step_tracking(status);
CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_step_name ON checkout_step_tracking(step_name);

-- 4. Checkout outbox table for reliable event processing
CREATE TABLE IF NOT EXISTS checkout_outbox (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkout_outbox_session_id ON checkout_outbox(session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_status ON checkout_outbox(status);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_next_retry_at ON checkout_outbox(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_event_type ON checkout_outbox(event_type);

-- 5. Add granular checkout columns to checkout_history if they don't exist
ALTER TABLE checkout_history
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS checkout_state VARCHAR(50) DEFAULT 'pending' CHECK (checkout_state IN ('pending', 'core_transaction_completed', 'pdf_generating', 'google_notes_updating', 'completed', 'failed', 'compensating', 'cancelled')),
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS compensation_data JSONB;

-- Add missing timestamp columns to checkout_history if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checkout_history' AND column_name='created_at') THEN
        ALTER TABLE checkout_history ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checkout_history' AND column_name='updated_at') THEN
        ALTER TABLE checkout_history ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Add missing timestamp columns to device_history if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='device_history' AND column_name='created_at') THEN
        ALTER TABLE device_history ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='device_history' AND column_name='updated_at') THEN
        ALTER TABLE device_history ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Add missing timestamp columns to other tables if they don't exist
DO $$
BEGIN
    -- Check users table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Check students table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='created_at') THEN
        ALTER TABLE students ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='updated_at') THEN
        ALTER TABLE students ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Check chromebooks table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chromebooks' AND column_name='created_at') THEN
        ALTER TABLE chromebooks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chromebooks' AND column_name='updated_at') THEN
        ALTER TABLE chromebooks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Create indexes for checkout_history granular checkout columns
CREATE INDEX IF NOT EXISTS idx_checkout_history_idempotency_key ON checkout_history(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_checkout_history_checkout_state ON checkout_history(checkout_state);

-- 6. Ensure student_fees table exists with granular checkout columns
CREATE TABLE IF NOT EXISTS student_fees (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    maintenance_id INTEGER UNIQUE REFERENCES maintenance_records(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id),
    -- Granular checkout support
    idempotency_key VARCHAR(255) UNIQUE,
    checkout_id INTEGER
);

-- Add granular checkout columns to student_fees if they don't exist
ALTER TABLE student_fees
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS checkout_id INTEGER;

-- Create indexes for student_fees
CREATE INDEX IF NOT EXISTS idx_student_fees_student_id ON student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_idempotency_key ON student_fees(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_student_fees_checkout_id ON student_fees(checkout_id);

-- Add unique constraint on idempotency_key if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'student_fees_idempotency_key_key'
    ) THEN
        ALTER TABLE student_fees ADD CONSTRAINT student_fees_idempotency_key_key UNIQUE (idempotency_key);
    END IF;
END $$;

-- 7. Ensure fee_payments table exists with granular checkout columns
CREATE TABLE IF NOT EXISTS fee_payments (
    id SERIAL PRIMARY KEY,
    student_fee_id INTEGER NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    notes TEXT,
    processed_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Granular checkout support
    idempotency_key VARCHAR(255) UNIQUE
);

-- Add granular checkout columns to fee_payments if they don't exist
ALTER TABLE fee_payments
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Create indexes for fee_payments
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_fee_id ON fee_payments(student_fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_idempotency_key ON fee_payments(idempotency_key);

-- Add unique constraint on idempotency_key if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fee_payments_idempotency_key_key'
    ) THEN
        ALTER TABLE fee_payments ADD CONSTRAINT fee_payments_idempotency_key_key UNIQUE (idempotency_key);
    END IF;
END $$;

-- 8. Create triggers for updating timestamps
-- Drop existing triggers if they exist to avoid conflicts
DROP TRIGGER IF EXISTS update_checkout_history_updated_at ON checkout_history;
DROP TRIGGER IF EXISTS update_checkout_sessions_updated_at ON checkout_sessions;
DROP TRIGGER IF EXISTS update_checkout_step_tracking_updated_at ON checkout_step_tracking;
DROP TRIGGER IF EXISTS update_checkout_outbox_updated_at ON checkout_outbox;
DROP TRIGGER IF EXISTS update_device_history_updated_at ON device_history;

-- Create new triggers
CREATE TRIGGER update_checkout_history_updated_at
    BEFORE UPDATE ON checkout_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checkout_sessions_updated_at
    BEFORE UPDATE ON checkout_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checkout_step_tracking_updated_at
    BEFORE UPDATE ON checkout_step_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checkout_outbox_updated_at
    BEFORE UPDATE ON checkout_outbox
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_history_updated_at
    BEFORE UPDATE ON device_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Create cleanup function for expired idempotency records
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM operation_idempotency WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 10. Add comments to describe the purpose of the new tables
COMMENT ON TABLE operation_idempotency IS 'Prevents duplicate operations by tracking idempotency keys for checkout processes.';
COMMENT ON TABLE checkout_sessions IS 'Tracks overall checkout sessions with granular step monitoring and rollback capabilities.';
COMMENT ON TABLE checkout_step_tracking IS 'Monitors individual steps within a checkout session for detailed progress tracking.';
COMMENT ON TABLE checkout_outbox IS 'Handles reliable event processing for checkout-related operations like PDF generation and Google Notes updates.';
COMMENT ON TABLE student_fees IS 'Tracks outstanding fees for students, often linked to device maintenance.';
COMMENT ON TABLE fee_payments IS 'Logs payments made by students towards their outstanding fees.';

-- 11. Ensure proper check constraints exist
-- Update checkout_history status constraint to include new values if needed
DO $$
BEGIN
    -- Drop old constraint if it exists
    ALTER TABLE checkout_history DROP CONSTRAINT IF EXISTS checkout_history_status_check;

    -- Add updated constraint
    ALTER TABLE checkout_history ADD CONSTRAINT checkout_history_status_check
        CHECK (status IN ('pending', 'completed'));

    -- Drop old insurance constraint if it exists
    ALTER TABLE checkout_history DROP CONSTRAINT IF EXISTS checkout_history_insurance_check;

    -- Add updated constraint
    ALTER TABLE checkout_history ADD CONSTRAINT checkout_history_insurance_check
        CHECK (insurance IN ('uninsured', 'pending', 'insured'));

EXCEPTION
    WHEN OTHERS THEN
        -- Ignore constraint errors if they already exist with different definitions
        NULL;
END $$;

-- Migration completed successfully
SELECT 'Migration 011: Granular Checkout System tables created/updated successfully' AS result;

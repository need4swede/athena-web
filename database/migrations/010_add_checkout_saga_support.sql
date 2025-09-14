-- Migration: Add checkout saga support with idempotency keys and state tracking
-- This enables resilient checkout processing with retry logic and prevents double operations

-- Add idempotency and state tracking to checkout_history
ALTER TABLE checkout_history
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS checkout_state VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS compensation_data JSONB;

-- Create index on idempotency_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_checkout_history_idempotency_key ON checkout_history(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_checkout_history_state ON checkout_history(checkout_state);

-- Create outbox table for async operations
CREATE TABLE IF NOT EXISTS checkout_outbox (
    id SERIAL PRIMARY KEY,
    checkout_id INTEGER REFERENCES checkout_history(id) ON DELETE CASCADE,
    operation_type VARCHAR(100) NOT NULL, -- 'generate_pdf', 'update_google_notes', etc.
    operation_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    idempotency_key VARCHAR(255) NOT NULL
);

-- Indexes for outbox table
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_status ON checkout_outbox(status);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_operation_type ON checkout_outbox(operation_type);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_checkout_id ON checkout_outbox(checkout_id);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_idempotency_key ON checkout_outbox(idempotency_key);

-- Create table for tracking operation idempotency
CREATE TABLE IF NOT EXISTS operation_idempotency (
    id SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    operation_type VARCHAR(100) NOT NULL,
    operation_result JSONB,
    status VARCHAR(50) NOT NULL, -- 'completed', 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

-- Index for fast idempotency checks
CREATE INDEX IF NOT EXISTS idx_operation_idempotency_key ON operation_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_operation_idempotency_expires ON operation_idempotency(expires_at);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_checkout_history_updated_at ON checkout_history;
CREATE TRIGGER update_checkout_history_updated_at
    BEFORE UPDATE ON checkout_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_checkout_outbox_updated_at ON checkout_outbox;
CREATE TRIGGER update_checkout_outbox_updated_at
    BEFORE UPDATE ON checkout_outbox
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add fee idempotency tracking to prevent double charges
ALTER TABLE student_fees
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS checkout_id INTEGER REFERENCES checkout_history(id);

-- Index for fee idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_fees_idempotency_key ON student_fees(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Add payment idempotency tracking
ALTER TABLE fee_payments
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Index for payment idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_payments_idempotency_key ON fee_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Add cleanup function for expired idempotency records
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

-- Create table for tracking individual checkout steps
CREATE TABLE IF NOT EXISTS checkout_step_tracking (
    id SERIAL PRIMARY KEY,
    checkout_session_id VARCHAR(255) NOT NULL, -- Overall checkout session ID
    step_name VARCHAR(100) NOT NULL,
    step_idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    step_data JSONB,
    result_data JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for step tracking
CREATE INDEX IF NOT EXISTS idx_checkout_step_session_id ON checkout_step_tracking(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_step_name ON checkout_step_tracking(step_name);
CREATE INDEX IF NOT EXISTS idx_checkout_step_status ON checkout_step_tracking(status);
CREATE INDEX IF NOT EXISTS idx_checkout_step_idempotency_key ON checkout_step_tracking(step_idempotency_key);

-- Create table for checkout sessions (overall checkout attempt)
CREATE TABLE IF NOT EXISTS checkout_sessions (
    id VARCHAR(255) PRIMARY KEY,
    chromebook_id INTEGER NOT NULL,
    student_id VARCHAR(255) NOT NULL,
    user_id INTEGER NOT NULL,
    checkout_data JSONB NOT NULL,
    overall_status VARCHAR(50) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed', 'cancelled'
    current_step VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Indexes for checkout sessions
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_chromebook_id ON checkout_sessions(chromebook_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_student_id ON checkout_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(overall_status);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_created_at ON checkout_sessions(created_at);

-- Add trigger for checkout_step_tracking updated_at
DROP TRIGGER IF EXISTS update_checkout_step_tracking_updated_at ON checkout_step_tracking;
CREATE TRIGGER update_checkout_step_tracking_updated_at
    BEFORE UPDATE ON checkout_step_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for checkout_sessions updated_at
DROP TRIGGER IF EXISTS update_checkout_sessions_updated_at ON checkout_sessions;
CREATE TRIGGER update_checkout_sessions_updated_at
    BEFORE UPDATE ON checkout_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create enum for checkout states if not exists
DO $$ BEGIN
    CREATE TYPE checkout_state_enum AS ENUM (
        'pending',
        'core_transaction_completed',
        'pdf_generating',
        'google_notes_updating',
        'completed',
        'failed',
        'compensating',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update checkout_state column to use enum (optional, can keep as varchar for flexibility)
-- ALTER TABLE checkout_history ALTER COLUMN checkout_state TYPE checkout_state_enum USING checkout_state::checkout_state_enum;

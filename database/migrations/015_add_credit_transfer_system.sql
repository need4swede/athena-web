-- Migration 015: Add Device Insurance Credit Transfer System
-- This migration adds columns to track original device asset tags and credit invalidation

-- Add new columns to archived_fee_payments table
ALTER TABLE archived_fee_payments
ADD COLUMN IF NOT EXISTS original_asset_tag VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_invalidated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS invalidated_reason TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_original_asset_tag ON archived_fee_payments(original_asset_tag);
CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_is_invalidated ON archived_fee_payments(is_invalidated);

-- Update table and column comments
COMMENT ON TABLE archived_fee_payments IS 'Stores insurance payments from replaced/deleted fees for future credit/carryover with original device tracking.';
COMMENT ON COLUMN archived_fee_payments.original_asset_tag IS 'Asset tag of the device the original insurance payment was made for.';
COMMENT ON COLUMN archived_fee_payments.is_invalidated IS 'Whether this credit has been invalidated (cannot be used anymore).';
COMMENT ON COLUMN archived_fee_payments.invalidated_at IS 'When this credit was invalidated.';
COMMENT ON COLUMN archived_fee_payments.invalidated_reason IS 'Reason why this credit was invalidated (e.g., new payment made instead of using credit).';

-- Function to invalidate unused credits when new payments are made
CREATE OR REPLACE FUNCTION invalidate_unused_credits(
    p_student_id INTEGER,
    p_reason TEXT DEFAULT 'New payment made instead of using available credit'
) RETURNS INTEGER AS $$
DECLARE
    invalidated_count INTEGER := 0;
BEGIN
    -- Mark all non-invalidated credits for this student as invalidated
    UPDATE archived_fee_payments
    SET
        is_invalidated = TRUE,
        invalidated_at = CURRENT_TIMESTAMP,
        invalidated_reason = p_reason
    WHERE
        student_id = p_student_id
        AND is_invalidated = FALSE;

    GET DIAGNOSTICS invalidated_count = ROW_COUNT;

    RETURN invalidated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get available credits for a student (non-invalidated only)
CREATE OR REPLACE FUNCTION get_available_credits(p_student_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    amount NUMERIC(10,2),
    payment_method VARCHAR(50),
    notes TEXT,
    transaction_id VARCHAR(12),
    original_asset_tag VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        afp.id,
        afp.amount,
        afp.payment_method,
        afp.notes,
        afp.transaction_id,
        afp.original_asset_tag,
        afp.created_at,
        afp.archived_at
    FROM archived_fee_payments afp
    WHERE
        afp.student_id = p_student_id
        AND afp.is_invalidated = FALSE
    ORDER BY afp.archived_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to transfer credit to a new fee (preserve transaction ID)
CREATE OR REPLACE FUNCTION transfer_credit_to_fee(
    p_credit_id INTEGER,
    p_target_fee_id INTEGER,
    p_processed_by_user_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
    credit_record RECORD;
    new_payment_id INTEGER;
BEGIN
    -- Get the credit details
    SELECT * INTO credit_record
    FROM archived_fee_payments
    WHERE id = p_credit_id AND is_invalidated = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Credit not found or already invalidated';
    END IF;

    -- Apply the credit to the target fee with original transaction ID
    INSERT INTO fee_payments (
        student_fee_id,
        amount,
        payment_method,
        notes,
        processed_by_user_id,
        transaction_id,
        created_at
    ) VALUES (
        p_target_fee_id,
        credit_record.amount,
        credit_record.payment_method,
        COALESCE('Applied credit from device ' || credit_record.original_asset_tag || ': ' || credit_record.notes, 'Applied credit from previous payment'),
        p_processed_by_user_id,
        credit_record.transaction_id, -- Preserve original transaction ID
        CURRENT_TIMESTAMP
    ) RETURNING id INTO new_payment_id;

    -- Mark the credit as used (invalidated)
    UPDATE archived_fee_payments
    SET
        is_invalidated = TRUE,
        invalidated_at = CURRENT_TIMESTAMP,
        invalidated_reason = 'Credit applied to fee ID ' || p_target_fee_id
    WHERE id = p_credit_id;

    RETURN new_payment_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to automatically capture asset tag when archiving payments
CREATE OR REPLACE FUNCTION capture_asset_tag_on_archive() RETURNS TRIGGER AS $$
DECLARE
    asset_tag_from_checkout VARCHAR(255);
BEGIN
    -- Try to find the asset tag from the most recent checkout for this student around the payment time
    SELECT c.asset_tag INTO asset_tag_from_checkout
    FROM checkout_history ch
    JOIN chromebooks c ON c.id = ch.chromebook_id
    JOIN students s ON s.id = ch.student_id
    WHERE
        s.id = NEW.student_id
        AND ch.action = 'checkout'
        AND ch.insurance IN ('pending', 'insured')
        AND ch.action_date <= NEW.created_at
        AND ch.action_date >= (NEW.created_at - INTERVAL '30 days') -- Within 30 days
    ORDER BY ch.action_date DESC
    LIMIT 1;

    -- If no direct match, try to find from currently checked out device
    IF asset_tag_from_checkout IS NULL THEN
        SELECT c.asset_tag INTO asset_tag_from_checkout
        FROM chromebooks c
        WHERE c.current_user_id = NEW.student_id
        LIMIT 1;
    END IF;

    -- Set the asset tag if found
    NEW.original_asset_tag := asset_tag_from_checkout;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically capture asset tag when payments are archived
CREATE TRIGGER capture_asset_tag_before_insert
    BEFORE INSERT ON archived_fee_payments
    FOR EACH ROW
    EXECUTE FUNCTION capture_asset_tag_on_archive();

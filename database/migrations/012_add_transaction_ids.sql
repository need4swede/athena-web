-- Migration: Add transaction ID system for payment tracking
-- This migration adds transaction IDs to all payments for better traceability

-- Add transaction_id column to fee_payments table
ALTER TABLE fee_payments
ADD COLUMN transaction_id VARCHAR(12) UNIQUE;

-- Create index for fast transaction lookups
CREATE INDEX IF NOT EXISTS idx_fee_payments_transaction_id ON fee_payments(transaction_id);

-- Function to generate transaction ID
CREATE OR REPLACE FUNCTION generate_transaction_id(fee_type CHAR(1), payment_date TIMESTAMP WITH TIME ZONE) RETURNS VARCHAR(12) AS $$
DECLARE
    date_part VARCHAR(6);
    random_part VARCHAR(4);
    candidate_id VARCHAR(12);
    counter INTEGER := 0;
BEGIN
    -- Format date as YYMMDD
    date_part := TO_CHAR(payment_date AT TIME ZONE 'America/Los_Angeles', 'YYMMDD');

    -- Try up to 100 times to generate a unique ID
    WHILE counter < 100 LOOP
        -- Generate 4-digit random number with leading zeros
        random_part := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

        -- Construct transaction ID
        candidate_id := 'T' || fee_type || date_part || random_part;

        -- Check if this ID already exists
        IF NOT EXISTS (SELECT 1 FROM fee_payments WHERE transaction_id = candidate_id) THEN
            RETURN candidate_id;
        END IF;

        counter := counter + 1;
    END LOOP;

    -- If we couldn't generate a unique ID in 100 attempts, raise an error
    RAISE EXCEPTION 'Could not generate unique transaction ID after 100 attempts';
END;
$$ LANGUAGE plpgsql;

-- Temporary function to determine fee type from description
CREATE OR REPLACE FUNCTION determine_fee_type(description TEXT) RETURNS CHAR(1) AS $$
BEGIN
    IF LOWER(description) LIKE '%insurance%' THEN
        RETURN 'I';
    ELSE
        RETURN 'D';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update existing payments with transaction IDs
DO $$
DECLARE
    payment_record RECORD;
    fee_type CHAR(1);
    new_transaction_id VARCHAR(12);
BEGIN
    -- Process all existing payments that don't have a transaction ID
    FOR payment_record IN
        SELECT fp.id, fp.created_at, sf.description
        FROM fee_payments fp
        JOIN student_fees sf ON fp.student_fee_id = sf.id
        WHERE fp.transaction_id IS NULL
        ORDER BY fp.created_at ASC
    LOOP
        -- Determine fee type based on description
        fee_type := determine_fee_type(payment_record.description);

        -- Generate transaction ID using the payment's created_at date
        new_transaction_id := generate_transaction_id(fee_type, payment_record.created_at);

        -- Update the payment record
        UPDATE fee_payments
        SET transaction_id = new_transaction_id
        WHERE id = payment_record.id;

        -- Log the update
        RAISE NOTICE 'Generated transaction ID % for payment ID %', new_transaction_id, payment_record.id;
    END LOOP;
END $$;

-- Now make the column NOT NULL after all existing records have been updated
ALTER TABLE fee_payments
ALTER COLUMN transaction_id SET NOT NULL;

-- Drop the temporary function
DROP FUNCTION IF EXISTS determine_fee_type(TEXT);

-- Add comment to document the transaction ID format
COMMENT ON COLUMN fee_payments.transaction_id IS 'Transaction ID format: T[I/D]YYMMDD####, where I=Insurance, D=Device/Other fees, YYMMDD=transaction date, ####=4-digit random';

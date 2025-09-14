-- Migration script to backfill transaction IDs for all existing fee payments
-- This script can be run on production databases to add transaction IDs to historical payments

-- Create a temporary function to generate transaction IDs
CREATE OR REPLACE FUNCTION generate_historical_transaction_id(
    payment_date TIMESTAMP WITH TIME ZONE,
    payment_id INTEGER,
    fee_type CHAR(1)
) RETURNS VARCHAR(12) AS $$
DECLARE
    date_part VARCHAR(6);
    random_part VARCHAR(4);
    full_id VARCHAR(12);
    attempts INTEGER := 0;
    max_attempts INTEGER := 100;
BEGIN
    -- Format date as YYMMDD
    date_part := TO_CHAR(payment_date AT TIME ZONE 'America/Los_Angeles', 'YY') || 
                 TO_CHAR(payment_date AT TIME ZONE 'America/Los_Angeles', 'MM') || 
                 TO_CHAR(payment_date AT TIME ZONE 'America/Los_Angeles', 'DD');
    
    -- Try to generate a unique ID
    WHILE attempts < max_attempts LOOP
        -- Use payment_id as seed for consistent random generation
        random_part := LPAD(((payment_id * 7919 + attempts * 997) % 10000)::TEXT, 4, '0');
        full_id := 'T' || fee_type || date_part || random_part;
        
        -- Check if this ID already exists
        IF NOT EXISTS (SELECT 1 FROM fee_payments WHERE transaction_id = full_id) THEN
            RETURN full_id;
        END IF;
        
        attempts := attempts + 1;
    END LOOP;
    
    -- If we couldn't generate a unique ID, use a fallback with payment_id
    RETURN 'T' || fee_type || date_part || LPAD(payment_id::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Backfill transaction IDs for existing payments
DO $$
DECLARE
    payment_record RECORD;
    new_transaction_id VARCHAR(12);
    fee_type CHAR(1);
    processed_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting transaction ID backfill process...';
    
    -- Process all payments without transaction IDs
    FOR payment_record IN 
        SELECT 
            fp.id,
            fp.created_at,
            sf.description
        FROM fee_payments fp
        JOIN student_fees sf ON fp.student_fee_id = sf.id
        WHERE fp.transaction_id IS NULL
        ORDER BY fp.created_at, fp.id
    LOOP
        BEGIN
            -- Determine fee type based on description
            IF payment_record.description ILIKE '%insurance%' THEN
                fee_type := 'I';
            ELSE
                fee_type := 'D'; -- Default to Device fee for all other types
            END IF;
            
            -- Generate transaction ID
            new_transaction_id := generate_historical_transaction_id(
                payment_record.created_at,
                payment_record.id,
                fee_type
            );
            
            -- Update the payment record
            UPDATE fee_payments 
            SET transaction_id = new_transaction_id
            WHERE id = payment_record.id;
            
            processed_count := processed_count + 1;
            
            -- Log progress every 100 records
            IF processed_count % 100 = 0 THEN
                RAISE NOTICE 'Processed % payments...', processed_count;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error processing payment %: %', payment_record.id, SQLERRM;
            error_count := error_count + 1;
        END;
    END LOOP;
    
    RAISE NOTICE 'Transaction ID backfill completed. Processed: %, Errors: %', processed_count, error_count;
    
    -- Verify results
    RAISE NOTICE 'Payments with transaction IDs: %', 
        (SELECT COUNT(*) FROM fee_payments WHERE transaction_id IS NOT NULL);
    RAISE NOTICE 'Payments without transaction IDs: %', 
        (SELECT COUNT(*) FROM fee_payments WHERE transaction_id IS NULL);
END $$;

-- Clean up the temporary function
DROP FUNCTION IF EXISTS generate_historical_transaction_id(TIMESTAMP WITH TIME ZONE, INTEGER, CHAR);

-- Add a check constraint to ensure all new payments have transaction IDs
ALTER TABLE fee_payments
ADD CONSTRAINT check_transaction_id_format 
CHECK (transaction_id ~ '^T[ID]\d{10}$');

-- Create index if not exists for transaction_id lookups
CREATE INDEX IF NOT EXISTS idx_fee_payments_transaction_id_lookup 
ON fee_payments(transaction_id) 
WHERE transaction_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN fee_payments.transaction_id IS 'Unique transaction identifier: T + FeeType(I/D) + YYMMDD + 4-digit random';

-- Display summary
DO $$
DECLARE
    total_payments INTEGER;
    payments_with_ids INTEGER;
    payments_without_ids INTEGER;
    insurance_payments INTEGER;
    device_payments INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_payments FROM fee_payments;
    SELECT COUNT(*) INTO payments_with_ids FROM fee_payments WHERE transaction_id IS NOT NULL;
    SELECT COUNT(*) INTO payments_without_ids FROM fee_payments WHERE transaction_id IS NULL;
    SELECT COUNT(*) INTO insurance_payments FROM fee_payments WHERE transaction_id LIKE 'TI%';
    SELECT COUNT(*) INTO device_payments FROM fee_payments WHERE transaction_id LIKE 'TD%';
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Transaction ID Backfill Summary ===';
    RAISE NOTICE 'Total payments: %', total_payments;
    RAISE NOTICE 'Payments with transaction IDs: %', payments_with_ids;
    RAISE NOTICE 'Payments without transaction IDs: %', payments_without_ids;
    RAISE NOTICE 'Insurance payments (TI): %', insurance_payments;
    RAISE NOTICE 'Device payments (TD): %', device_payments;
    RAISE NOTICE '=====================================';
END $$;

-- Migration 00: Clear Adam Johnson's Data for Testing
-- This script clears all transaction history for Adam Johnson (Student ID: 156798)
-- Can be run repeatedly for fresh testing scenarios

-- Adam Johnson's identifiers
-- Student ID: 156798
-- Database ID: 70

DO $$
DECLARE
    adam_db_id INTEGER := 70;
    adam_student_id VARCHAR := '156798';
    records_cleared INTEGER := 0;
BEGIN
    -- Start transaction
    RAISE NOTICE 'Starting cleanup for Adam Johnson (Student ID: %, DB ID: %)', adam_student_id, adam_db_id;

    -- Clear archived fee payments (credits from previous insurance payments)
    DELETE FROM archived_fee_payments WHERE student_id = adam_db_id;
    GET DIAGNOSTICS records_cleared = ROW_COUNT;
    RAISE NOTICE 'Cleared % archived fee payment records', records_cleared;

    -- Clear fee payments first (due to foreign key constraints)
    DELETE FROM fee_payments
    WHERE student_fee_id IN (
        SELECT id FROM student_fees WHERE student_id = adam_db_id
    );
    GET DIAGNOSTICS records_cleared = ROW_COUNT;
    RAISE NOTICE 'Cleared % fee payment records', records_cleared;

    -- Clear student fees
    DELETE FROM student_fees WHERE student_id = adam_db_id;
    GET DIAGNOSTICS records_cleared = ROW_COUNT;
    RAISE NOTICE 'Cleared % student fee records', records_cleared;

    -- Clear checkout history
    DELETE FROM checkout_history WHERE student_id = adam_db_id;
    GET DIAGNOSTICS records_cleared = ROW_COUNT;
    RAISE NOTICE 'Cleared % checkout history records', records_cleared;

    -- Clear device history
    DELETE FROM device_history WHERE student_id = adam_db_id;
    GET DIAGNOSTICS records_cleared = ROW_COUNT;
    RAISE NOTICE 'Cleared % device history records', records_cleared;

    -- Clear maintenance records
    DELETE FROM maintenance_records WHERE student_id = adam_db_id;
    GET DIAGNOSTICS records_cleared = ROW_COUNT;
    RAISE NOTICE 'Cleared % maintenance records', records_cleared;

    -- Clear any chromebooks currently assigned to Adam
    UPDATE chromebooks
    SET current_user_id = NULL,
        checked_out_date = NULL,
        status = 'available',
        is_insured = FALSE,
        insurance_status = 'none'
    WHERE current_user_id = adam_db_id;
    GET DIAGNOSTICS records_cleared = ROW_COUNT;
    RAISE NOTICE 'Cleared % chromebook assignments', records_cleared;

    -- Optional: Clear any checkout saga events if table exists
    -- (This table may not exist in all environments)
    BEGIN
        DELETE FROM checkout_saga_events WHERE student_id = adam_db_id;
        GET DIAGNOSTICS records_cleared = ROW_COUNT;
        RAISE NOTICE 'Cleared % checkout saga event records', records_cleared;
    EXCEPTION
        WHEN undefined_table THEN
            RAISE NOTICE 'Checkout saga events table not found - skipping';
    END;

    RAISE NOTICE 'Adam Johnson data cleanup completed successfully!';
    RAISE NOTICE 'Student record preserved: ID %, Student ID %', adam_db_id, adam_student_id;
    RAISE NOTICE 'Ready for fresh testing scenarios.';

END $$;

-- Verification query to confirm cleanup
SELECT
    'Verification Results' as status,
    'Adam Johnson (ID: 70) Data Summary' as description;

SELECT
    'archived_fee_payments' as table_name,
    COUNT(*) as remaining_records
FROM archived_fee_payments WHERE student_id = 70
UNION ALL
SELECT 'student_fees', COUNT(*) FROM student_fees WHERE student_id = 70
UNION ALL
SELECT 'checkout_history', COUNT(*) FROM checkout_history WHERE student_id = 70
UNION ALL
SELECT 'device_history', COUNT(*) FROM device_history WHERE student_id = 70
UNION ALL
SELECT 'maintenance_records', COUNT(*) FROM maintenance_records WHERE student_id = 70
UNION ALL
SELECT 'chromebooks_assigned', COUNT(*) FROM chromebooks WHERE current_user_id = 70
UNION ALL
SELECT 'fee_payments_via_fees', COUNT(*)
FROM fee_payments fp
JOIN student_fees sf ON fp.student_fee_id = sf.id
WHERE sf.student_id = 70;

-- Show student record still exists
SELECT
    'Student Record Status' as verification,
    id as db_id,
    student_id,
    first_name,
    last_name,
    'PRESERVED' as status
FROM students
WHERE id = 70;

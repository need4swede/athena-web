-- Run the granular checkout migration
-- This script applies the migration to add granular checkout support with step tracking and idempotency

\echo 'Starting migration: Add granular checkout support with step tracking'

-- Source the migration file
\i migrations/010_add_checkout_saga_support.sql

\echo 'Migration completed successfully!'

-- Verify the new tables were created
\echo 'Verifying new tables and columns...'

-- Check checkout_step_tracking table
SELECT 'checkout_step_tracking' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'checkout_step_tracking'
ORDER BY ordinal_position;

-- Check checkout_sessions table
SELECT 'checkout_sessions' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'checkout_sessions'
ORDER BY ordinal_position;

-- Check operation_idempotency table
SELECT 'operation_idempotency' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'operation_idempotency'
ORDER BY ordinal_position;

-- Check new columns in existing tables
SELECT 'student_fees (new columns)' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'student_fees'
AND column_name IN ('idempotency_key', 'checkout_id')
ORDER BY column_name;

SELECT 'fee_payments (new columns)' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'fee_payments'
AND column_name = 'idempotency_key'
ORDER BY column_name;

SELECT 'checkout_history (new columns)' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'checkout_history'
AND column_name IN ('idempotency_key', 'checkout_state', 'retry_count', 'last_error', 'compensation_data')
ORDER BY column_name;

\echo 'Tables and columns verification complete!'
\echo 'Granular checkout system is now ready to use!'

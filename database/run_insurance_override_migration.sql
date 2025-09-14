-- Run the insurance override migration
-- This script applies the migration to add insurance override functionality

\echo 'Starting migration: Add insurance override functionality'

-- Source the migration file
\i migrations/016_add_insurance_override.sql

\echo 'Migration completed successfully!'

-- Verify the new table was added
\echo 'Verifying new table...'
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'insurance_overrides'
ORDER BY ordinal_position;

\echo 'Insurance override table verification complete!'

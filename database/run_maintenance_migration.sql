-- Run the maintenance schema enhancement migration
-- This script applies the migration to enhance maintenance_records and add maintenance_comments table

\echo 'Starting migration: Enhance maintenance schema'

-- Source the migration file
\i migrations/004_enhance_maintenance_schema.sql

\echo 'Migration completed successfully!'

-- Verify the new columns and table were added
\echo 'Verifying maintenance_records enhancements...'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'maintenance_records'
AND column_name IN (
    'priority', 'damage_locations', 'repair_recommendations',
    'total_cost', 'cost_waived', 'photos'
)
ORDER BY column_name;

\echo 'Verifying maintenance_comments table...'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'maintenance_comments'
ORDER BY column_name;

\echo 'Migration verification complete!'

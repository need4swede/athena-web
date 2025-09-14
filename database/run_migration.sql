-- Run the Google API fields migration
-- This script applies the migration to add new Google API fields to the chromebooks table

\echo 'Starting migration: Add Google API fields to chromebooks table'

-- Source the migration file
\i migrations/001_add_google_api_fields.sql

\echo 'Migration completed successfully!'

-- Verify the new columns were added
\echo 'Verifying new columns...'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'chromebooks'
AND column_name IN (
    'notes', 'boot_mode', 'last_enrollment_time', 'support_end_date',
    'order_number', 'will_auto_renew', 'meid', 'etag',
    'active_time_ranges', 'cpu_status_reports', 'disk_volume_reports',
    'system_ram_total', 'system_ram_free_reports'
)
ORDER BY column_name;

\echo 'New columns verification complete!'

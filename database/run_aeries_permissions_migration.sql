-- Run the Aeries permissions migration
-- Applies the migration to add per-user Aeries access and granular flags
\echo 'Starting migration: Add Aeries permissions'

-- Source the migration file
\i migrations/017_add_aeries_permissions.sql

\echo 'Migration completed successfully!'

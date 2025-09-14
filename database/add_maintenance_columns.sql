-- Add missing columns to existing maintenance_records table
-- Run this if you have an existing database that needs the enhanced maintenance schema

-- Add priority column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'maintenance_records'
                   AND column_name = 'priority') THEN
        ALTER TABLE maintenance_records
        ADD COLUMN priority VARCHAR(10) DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high'));
    END IF;
END $$;

-- Add damage_locations column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'maintenance_records'
                   AND column_name = 'damage_locations') THEN
        ALTER TABLE maintenance_records
        ADD COLUMN damage_locations JSONB DEFAULT '[]';
    END IF;
END $$;

-- Add repair_recommendations column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'maintenance_records'
                   AND column_name = 'repair_recommendations') THEN
        ALTER TABLE maintenance_records
        ADD COLUMN repair_recommendations JSONB DEFAULT '[]';
    END IF;
END $$;

-- Add total_cost column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'maintenance_records'
                   AND column_name = 'total_cost') THEN
        ALTER TABLE maintenance_records
        ADD COLUMN total_cost NUMERIC(10,2) DEFAULT 0;
    END IF;
END $$;

-- Add cost_waived column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'maintenance_records'
                   AND column_name = 'cost_waived') THEN
        ALTER TABLE maintenance_records
        ADD COLUMN cost_waived BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add photos column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'maintenance_records'
                   AND column_name = 'photos') THEN
        ALTER TABLE maintenance_records
        ADD COLUMN photos JSONB DEFAULT '[]';
    END IF;
END $$;

-- Create maintenance_comments table if it doesn't exist
CREATE TABLE IF NOT EXISTS maintenance_comments (
    id SERIAL PRIMARY KEY,
    maintenance_id INTEGER REFERENCES maintenance_records(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_maintenance_records_priority ON maintenance_records(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_comments_maintenance_id ON maintenance_comments(maintenance_id);

-- Show the updated schema
\echo 'Enhanced maintenance schema applied successfully!'
\echo 'Updated maintenance_records columns:'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'maintenance_records'
ORDER BY ordinal_position;

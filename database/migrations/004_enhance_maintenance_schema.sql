-- Migration 004: Enhance maintenance schema
-- Add missing fields to maintenance_records and create maintenance_comments table

-- Add missing columns to maintenance_records table
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'));
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS damage_locations JSONB DEFAULT '[]';
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS repair_recommendations JSONB DEFAULT '[]';
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10,2) DEFAULT 0;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS cost_waived BOOLEAN DEFAULT FALSE;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';

-- Create maintenance_comments table
CREATE TABLE IF NOT EXISTS maintenance_comments (
    id SERIAL PRIMARY KEY,
    maintenance_id INTEGER REFERENCES maintenance_records(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_maintenance_comments_maintenance_id ON maintenance_comments(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_priority ON maintenance_records(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_status ON maintenance_records(status);

-- Update existing maintenance records to have default priority if null
UPDATE maintenance_records SET priority = 'medium' WHERE priority IS NULL;

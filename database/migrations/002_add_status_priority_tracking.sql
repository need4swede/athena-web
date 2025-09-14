-- Migration to add status priority tracking
-- This ensures that locally set statuses (like 'checked-out') take priority over Google sync

-- Add a field to track when status was locally overridden
ALTER TABLE chromebooks
ADD COLUMN IF NOT EXISTS status_override_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS status_source VARCHAR(20) DEFAULT 'google' CHECK (status_source IN ('google', 'local'));

-- Update existing checked-out devices to have local status source
UPDATE chromebooks
SET status_source = 'local',
    status_override_date = CURRENT_TIMESTAMP
WHERE status = 'checked-out';

-- Update existing maintenance devices to have local status source
UPDATE chromebooks
SET status_source = 'local',
    status_override_date = CURRENT_TIMESTAMP
WHERE status = 'maintenance';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_chromebooks_status_source ON chromebooks(status_source);
CREATE INDEX IF NOT EXISTS idx_chromebooks_status_override_date ON chromebooks(status_override_date);

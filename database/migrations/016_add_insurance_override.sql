-- Migration 016: Add Insurance Override Support
-- This migration adds support for super admin insurance status overrides

-- Create insurance_overrides table to track all override actions
CREATE TABLE IF NOT EXISTS insurance_overrides (
    id SERIAL PRIMARY KEY,
    chromebook_id INTEGER NOT NULL REFERENCES chromebooks(id) ON DELETE CASCADE,
    original_status VARCHAR(20) NOT NULL,
    new_status VARCHAR(20) NOT NULL,
    override_reason TEXT,
    admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_insurance_overrides_chromebook_id ON insurance_overrides(chromebook_id);
CREATE INDEX IF NOT EXISTS idx_insurance_overrides_admin_user_id ON insurance_overrides(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_overrides_created_at ON insurance_overrides(created_at);

-- Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_insurance_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_insurance_overrides_updated_at'
    ) THEN
        CREATE TRIGGER update_insurance_overrides_updated_at
            BEFORE UPDATE ON insurance_overrides
            FOR EACH ROW
            EXECUTE FUNCTION update_insurance_overrides_updated_at();
    END IF;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE insurance_overrides IS 'Tracks insurance status overrides performed by super admins';
COMMENT ON COLUMN insurance_overrides.chromebook_id IS 'Reference to the chromebook whose insurance status was overridden';
COMMENT ON COLUMN insurance_overrides.original_status IS 'Original insurance status before override';
COMMENT ON COLUMN insurance_overrides.new_status IS 'New insurance status after override';
COMMENT ON COLUMN insurance_overrides.override_reason IS 'Optional reason provided by admin for the override';
COMMENT ON COLUMN insurance_overrides.admin_user_id IS 'User ID of the super admin who performed the override';

-- Update device_history.event_type constraint to allow "Insurance Override"
-- First, update any rows with invalid event_type values to a valid default before applying the new constraint
UPDATE device_history
SET event_type = 'Repair'
WHERE event_type NOT IN (
    'Checkout',
    'Checkin',
    'Maintenance',
    'Transfer',
    'Repair',
    'Replacement',
    'Retire',
    'Insurance Override',
    'Check-In',
    'Check-Out',
    'Retired',
    'Maintenance Completed'
);

ALTER TABLE device_history DROP CONSTRAINT IF EXISTS device_history_event_type_check;
ALTER TABLE device_history
    ADD CONSTRAINT device_history_event_type_check
    CHECK (event_type IN (
        'Checkout',
        'Checkin',
        'Maintenance',
        'Transfer',
        'Repair',
        'Replacement',
        'Retire',
        'Check-In',
        'Check-Out',
        'Retired',
        'Maintenance Completed',
        'Insurance Override'
    ));

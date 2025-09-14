-- Migration to add 'Maintenance Completed' event type to device_history table
-- This migration updates the CHECK constraint to include the new event type

-- Drop the existing constraint
ALTER TABLE device_history DROP CONSTRAINT IF EXISTS device_history_event_type_check;

-- Add the new constraint with the additional event type
ALTER TABLE device_history ADD CONSTRAINT device_history_event_type_check
    CHECK (event_type IN ('Check-In', 'Check-Out', 'Repair', 'Retired', 'Maintenance Completed'));

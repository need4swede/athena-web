-- Migration to add new Google API fields to chromebooks table
-- This migration adds all the new fields retrieved from the updated Google API implementation

-- Add new columns to chromebooks table
ALTER TABLE chromebooks
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS boot_mode VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_enrollment_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS support_end_date DATE,
ADD COLUMN IF NOT EXISTS order_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS will_auto_renew BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS meid VARCHAR(255),
ADD COLUMN IF NOT EXISTS etag VARCHAR(255),
ADD COLUMN IF NOT EXISTS active_time_ranges JSONB,
ADD COLUMN IF NOT EXISTS cpu_status_reports JSONB,
ADD COLUMN IF NOT EXISTS disk_volume_reports JSONB,
ADD COLUMN IF NOT EXISTS system_ram_total BIGINT,
ADD COLUMN IF NOT EXISTS system_ram_free_reports JSONB;

-- Create indexes for better performance on new fields
CREATE INDEX IF NOT EXISTS idx_chromebooks_boot_mode ON chromebooks(boot_mode);
CREATE INDEX IF NOT EXISTS idx_chromebooks_support_end_date ON chromebooks(support_end_date);
CREATE INDEX IF NOT EXISTS idx_chromebooks_last_enrollment_time ON chromebooks(last_enrollment_time);
CREATE INDEX IF NOT EXISTS idx_chromebooks_will_auto_renew ON chromebooks(will_auto_renew);

-- Add comments to document the new fields
COMMENT ON COLUMN chromebooks.notes IS 'Device notes from Google Admin Console';
COMMENT ON COLUMN chromebooks.boot_mode IS 'Device boot mode (e.g., VERIFIED, DEV)';
COMMENT ON COLUMN chromebooks.last_enrollment_time IS 'When the device was last enrolled';
COMMENT ON COLUMN chromebooks.support_end_date IS 'End of support date for the device';
COMMENT ON COLUMN chromebooks.order_number IS 'Order number for device procurement';
COMMENT ON COLUMN chromebooks.will_auto_renew IS 'Whether device support will auto-renew';
COMMENT ON COLUMN chromebooks.meid IS 'Mobile Equipment Identifier';
COMMENT ON COLUMN chromebooks.etag IS 'Entity tag for API versioning';
COMMENT ON COLUMN chromebooks.active_time_ranges IS 'Device active time ranges data';
COMMENT ON COLUMN chromebooks.cpu_status_reports IS 'CPU status and utilization reports';
COMMENT ON COLUMN chromebooks.disk_volume_reports IS 'Disk volume usage reports';
COMMENT ON COLUMN chromebooks.system_ram_total IS 'Total system RAM in bytes';
COMMENT ON COLUMN chromebooks.system_ram_free_reports IS 'System RAM free memory reports';

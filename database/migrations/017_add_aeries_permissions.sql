-- Migration 017: Add Aeries granular permissions per user
-- This migration introduces a per-user permissions model for Aeries access, allowing
-- super admins to enable Aeries and toggle specific sub-permissions (school data, student data, etc.)

-- Create table if it does not exist
CREATE TABLE IF NOT EXISTS aeries_permissions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    aeries_enabled BOOLEAN DEFAULT FALSE,
    can_access_school_data BOOLEAN DEFAULT FALSE,
    can_access_student_data BOOLEAN DEFAULT FALSE,
    can_view_emergency_contacts BOOLEAN DEFAULT FALSE,
    can_view_academic_info BOOLEAN DEFAULT FALSE,
    can_view_fines BOOLEAN DEFAULT FALSE,
    can_view_disciplinary_records BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_aeries_permissions_enabled ON aeries_permissions(aeries_enabled);

-- Ensure generic update function exists (defined in earlier migrations and init)
-- If not present in target, you may need to run migration 010/011 first.

-- Create trigger to auto-update updated_at if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_aeries_permissions_updated_at'
    ) THEN
        CREATE TRIGGER update_aeries_permissions_updated_at
            BEFORE UPDATE ON aeries_permissions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- Documentation
COMMENT ON TABLE aeries_permissions IS 'Per-user Aeries access flags (granular permissions)';
COMMENT ON COLUMN aeries_permissions.aeries_enabled IS 'Master switch – user can access Aeries features when true';
COMMENT ON COLUMN aeries_permissions.can_access_school_data IS 'Allow access to school-level data (e.g., schools API)';
COMMENT ON COLUMN aeries_permissions.can_access_student_data IS 'Allow general student data access (e.g., get_student)';
COMMENT ON COLUMN aeries_permissions.can_view_emergency_contacts IS 'Allow access to student emergency contacts';
COMMENT ON COLUMN aeries_permissions.can_view_academic_info IS 'Allow access to academic info (grades, transcripts, schedules, attendance)';
COMMENT ON COLUMN aeries_permissions.can_view_fines IS 'Allow access to student fees/fines';
COMMENT ON COLUMN aeries_permissions.can_view_disciplinary_records IS 'Allow access to student discipline records';

-- End of Migration 017


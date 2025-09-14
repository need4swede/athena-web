-- Expand Aeries permissions with granular student data categories
-- Safe to run multiple times; uses IF NOT EXISTS where possible

ALTER TABLE IF EXISTS aeries_permissions
    ADD COLUMN IF NOT EXISTS can_view_student_overview BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_contact_info BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_address_info BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_test_records BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_programs BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_picture BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_groups BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN aeries_permissions.can_view_student_overview IS 'Allow viewing basic student overview (name, grade, gender, birthdate)';
COMMENT ON COLUMN aeries_permissions.can_view_contact_info IS 'Allow viewing student/parent emails and phone numbers';
COMMENT ON COLUMN aeries_permissions.can_view_address_info IS 'Allow viewing mailing/residence addresses';
COMMENT ON COLUMN aeries_permissions.can_view_test_records IS 'Allow access to standardized test records';
COMMENT ON COLUMN aeries_permissions.can_view_programs IS 'Allow access to student programs';
COMMENT ON COLUMN aeries_permissions.can_view_picture IS 'Allow access to student picture';
COMMENT ON COLUMN aeries_permissions.can_view_groups IS 'Allow access to student groups';


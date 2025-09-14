-- Add can_view_personal_info to aeries_permissions

ALTER TABLE IF EXISTS aeries_permissions
    ADD COLUMN IF NOT EXISTS can_view_personal_info BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN aeries_permissions.can_view_personal_info IS 'Allow access to personal/demographic info (ethnicity, language, parent ed level)';


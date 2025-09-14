-- Migration to add student_id field to google_users table
-- This will store the extracted student ID directly from email addresses

-- Add student_id column to google_users table
ALTER TABLE google_users ADD COLUMN IF NOT EXISTS student_id VARCHAR(50);

-- Create index for faster lookups by student_id
CREATE INDEX IF NOT EXISTS idx_google_users_student_id ON google_users(student_id);

-- Update comment to reflect the new column
COMMENT ON COLUMN google_users.student_id IS 'Student ID extracted from email address (e.g., 156798 from adam.156798@njesd.net)';

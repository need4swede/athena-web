-- Create the chromebook_library database schema

-- Users table for storing user information from SSO
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar VARCHAR(255),
    provider VARCHAR(50),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'user')),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table for tracking student information (must be created before chromebooks)
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    grade_level INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chromebooks table (now students table exists for foreign key reference)
CREATE TABLE IF NOT EXISTS chromebooks (
    id SERIAL PRIMARY KEY,
    asset_tag VARCHAR(100) UNIQUE NOT NULL,
    serial_number VARCHAR(255) UNIQUE NOT NULL,
    model VARCHAR(255) NOT NULL,
    org_unit VARCHAR(255),
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'checked_out', 'maintenance', 'deprovisioned', 'disabled', 'retired', 'lost', 'damaged', 'pending_signature')),
    status_source VARCHAR(20) DEFAULT 'google' CHECK (status_source IN ('google', 'local')),
    status_override_date TIMESTAMP,
    current_user_id INTEGER REFERENCES students(id),
    checked_out_date TIMESTAMP,
    is_insured BOOLEAN DEFAULT NULL,
    insurance_status VARCHAR(20) CHECK (insurance_status IN ('uninsured', 'pending', 'insured')),
    assigned_location VARCHAR(255),
    in_service BOOLEAN DEFAULT FALSE,
    -- Google Admin specific fields
    device_id VARCHAR(255),
    last_sync TIMESTAMP,
    platform_version VARCHAR(255),
    os_version VARCHAR(255),
    firmware_version VARCHAR(255),
    mac_address VARCHAR(255),
    last_known_network JSONB,
    last_known_user VARCHAR(255),
    -- New Google API fields
    annotated_user VARCHAR(255),
    annotated_asset_id VARCHAR(255),
    recent_users JSONB,
    org_unit_path VARCHAR(255),
    -- Additional Google API fields from migration
    notes TEXT,
    boot_mode VARCHAR(50),
    last_enrollment_time TIMESTAMP WITH TIME ZONE,
    support_end_date DATE,
    order_number VARCHAR(255),
    will_auto_renew BOOLEAN DEFAULT FALSE,
    meid VARCHAR(255),
    etag VARCHAR(255),
    active_time_ranges JSONB,
    cpu_status_reports JSONB,
    disk_volume_reports JSONB,
    system_ram_total BIGINT,
    system_ram_free_reports JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Checkout history table
CREATE TABLE IF NOT EXISTS checkout_history (
    id SERIAL PRIMARY KEY,
    chromebook_id INTEGER REFERENCES chromebooks(id),
    student_id INTEGER REFERENCES students(id),
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL CHECK (action IN ('checkout', 'checkin')),
    action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    signature TEXT,
    parent_signature TEXT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
    insurance VARCHAR(20) DEFAULT 'uninsured' CHECK (insurance IN ('uninsured', 'pending', 'insured')),
    insurance_status VARCHAR(20) CHECK (insurance_status IN ('uninsured', 'pending', 'insured')),
    -- Granular checkout support
    idempotency_key VARCHAR(255) UNIQUE,
    checkout_state VARCHAR(50) DEFAULT 'pending' CHECK (checkout_state IN ('pending', 'core_transaction_completed', 'pdf_generating', 'google_notes_updating', 'completed', 'failed', 'compensating', 'cancelled')),
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    compensation_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance records table
CREATE TABLE IF NOT EXISTS maintenance_records (
    id SERIAL PRIMARY KEY,
    chromebook_id INTEGER REFERENCES chromebooks(id),
    user_id INTEGER REFERENCES users(id),
    student_id INTEGER REFERENCES students(id),
    issue_description TEXT NOT NULL,
    resolution_description TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    damage_locations JSONB DEFAULT '[]',
    repair_recommendations JSONB DEFAULT '[]',
    total_cost NUMERIC(10,2) DEFAULT 0,
    cost_waived BOOLEAN DEFAULT FALSE,
    photos JSONB DEFAULT '[]',
    service_type VARCHAR(20) DEFAULT 'return' CHECK (service_type IN ('return', 'service')),
    original_status VARCHAR(50),
    original_checkout_info JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Maintenance comments table
CREATE TABLE IF NOT EXISTS maintenance_comments (
    id SERIAL PRIMARY KEY,
    maintenance_id INTEGER REFERENCES maintenance_records(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tags table for categorizing chromebooks
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for chromebook tags
CREATE TABLE IF NOT EXISTS chromebook_tags (
    chromebook_id INTEGER REFERENCES chromebooks(id),
    tag_id INTEGER REFERENCES tags(id),
    PRIMARY KEY (chromebook_id, tag_id)
);

-- Notes table for chromebook notes
CREATE TABLE IF NOT EXISTS chromebook_notes (
    id SERIAL PRIMARY KEY,
    chromebook_id INTEGER REFERENCES chromebooks(id),
    user_id INTEGER REFERENCES users(id),
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device history table
CREATE TABLE IF NOT EXISTS device_history (
    id SERIAL PRIMARY KEY,
    chromebook_id INTEGER REFERENCES chromebooks(id),
    user_id INTEGER REFERENCES users(id),
    student_id INTEGER REFERENCES students(id),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('Check-In', 'Check-Out', 'Repair', 'Retired', 'Maintenance Completed', 'Insurance Override')),
    event_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSONB,
    cost_waived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Google Users table for storing users from Google Admin API
CREATE TABLE IF NOT EXISTS google_users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) NOT NULL UNIQUE,
    primary_email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    full_name VARCHAR(255),
    org_unit_path VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    is_suspended BOOLEAN DEFAULT FALSE,
    student_id VARCHAR(50),
    creation_time TIMESTAMP WITH TIME ZONE,
    last_login_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Organizational Units table for storing org units from Google Admin API
CREATE TABLE IF NOT EXISTS org_units (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    org_unit_path VARCHAR(255) NOT NULL UNIQUE,
    parent_org_unit_path VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert some sample data (users will be created via SSO)
-- No default users - first SSO user will become admin

INSERT INTO students (student_id, first_name, last_name, email, grade_level) VALUES
    ('12345', 'Alex', 'Smith', 'alex.smith@student.school.edu', 9),
    ('67890', 'Sarah', 'Johnson', 'sarah.johnson@student.school.edu', 10),
    ('54321', 'Mike', 'Chen', 'mike.chen@student.school.edu', 11)
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO tags (name, color) VALUES
    ('Grade 9', '#3B82F6'),
    ('Grade 10', '#10B981'),
    ('Grade 11', '#8B5CF6'),
    ('Math Lab', '#F59E0B'),
    ('Science Lab', '#EF4444'),
    ('Repair', '#6B7280')
ON CONFLICT (name) DO NOTHING;

-- Chromebooks will be populated via Google API sync
-- No mock data inserted here as chromebooks are fetched from Google Admin Console

-- Chromebook tags will be managed through the application
-- No mock chromebook tags inserted here

-- Insert some sample maintenance records (will be populated after users and chromebooks exist)
-- These will be created via a separate script once the tables are populated

-- Update existing status values to align with new Google API mappings
-- Update all devices with 'retired' status to 'deprovisioned'
UPDATE chromebooks SET status = 'deprovisioned' WHERE status = 'retired';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chromebooks_status ON chromebooks(status);
CREATE INDEX IF NOT EXISTS idx_chromebooks_asset_tag ON chromebooks(asset_tag);
CREATE INDEX IF NOT EXISTS idx_checkout_history_chromebook_id ON checkout_history(chromebook_id);
CREATE INDEX IF NOT EXISTS idx_checkout_history_student_id ON checkout_history(student_id);
CREATE INDEX IF NOT EXISTS idx_checkout_history_insurance ON checkout_history(insurance);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_chromebook_id ON maintenance_records(chromebook_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_student_id ON maintenance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_status ON maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_priority ON maintenance_records(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_comments_maintenance_id ON maintenance_comments(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_device_history_chromebook_id ON device_history(chromebook_id);
-- Indexes for new Google API fields
CREATE INDEX IF NOT EXISTS idx_chromebooks_boot_mode ON chromebooks(boot_mode);
CREATE INDEX IF NOT EXISTS idx_chromebooks_support_end_date ON chromebooks(support_end_date);
CREATE INDEX IF NOT EXISTS idx_chromebooks_last_enrollment_time ON chromebooks(last_enrollment_time);
CREATE INDEX IF NOT EXISTS idx_chromebooks_will_auto_renew ON chromebooks(will_auto_renew);
-- Indexes for status priority tracking
CREATE INDEX IF NOT EXISTS idx_chromebooks_status_source ON chromebooks(status_source);
CREATE INDEX IF NOT EXISTS idx_chromebooks_status_override_date ON chromebooks(status_override_date);
-- Index for Google users student_id
CREATE INDEX IF NOT EXISTS idx_google_users_student_id ON google_users(student_id);
-- Indexes for service mode functionality
CREATE INDEX IF NOT EXISTS idx_chromebooks_in_service ON chromebooks(in_service);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_service_type ON maintenance_records(service_type);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the student_fees table to track outstanding charges
CREATE TABLE IF NOT EXISTS student_fees (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    maintenance_id INTEGER UNIQUE REFERENCES maintenance_records(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id),
    replaced_at TIMESTAMP WITH TIME ZONE,
    -- Granular checkout support
    idempotency_key VARCHAR(255) UNIQUE,
    checkout_id INTEGER
);

-- Create an index on student_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_student_fees_student_id ON student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_idempotency_key ON student_fees(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_student_fees_checkout_id ON student_fees(checkout_id);

-- Create the fee_payments table to log payments made against fees
CREATE TABLE IF NOT EXISTS fee_payments (
    id SERIAL PRIMARY KEY,
    student_fee_id INTEGER NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    notes TEXT,
    processed_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Granular checkout support
    idempotency_key VARCHAR(255) UNIQUE,
    -- Transaction ID for tracking payments
    transaction_id VARCHAR(12) UNIQUE NOT NULL
);

-- Create an index on student_fee_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_fee_id ON fee_payments(student_fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_idempotency_key ON fee_payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_fee_payments_transaction_id ON fee_payments(transaction_id);

-- Archive table for deleted insurance payments (for credit carryover)
CREATE TABLE IF NOT EXISTS archived_fee_payments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    original_fee_id INTEGER,
    original_payment_id INTEGER,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    notes TEXT,
    processed_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    transaction_id VARCHAR(12) NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Credit transfer system fields
    original_asset_tag VARCHAR(255),
    is_invalidated BOOLEAN DEFAULT FALSE,
    invalidated_at TIMESTAMP WITH TIME ZONE,
    invalidated_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_student_id ON archived_fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_transaction_id ON archived_fee_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_original_asset_tag ON archived_fee_payments(original_asset_tag);
CREATE INDEX IF NOT EXISTS idx_archived_fee_payments_is_invalidated ON archived_fee_payments(is_invalidated);

COMMENT ON TABLE archived_fee_payments IS 'Stores insurance payments from replaced/deleted fees for future credit/carryover with original device tracking.';
COMMENT ON COLUMN archived_fee_payments.original_asset_tag IS 'Asset tag of the device the original insurance payment was made for.';
COMMENT ON COLUMN archived_fee_payments.is_invalidated IS 'Whether this credit has been invalidated (cannot be used anymore).';
COMMENT ON COLUMN archived_fee_payments.invalidated_at IS 'When this credit was invalidated.';
COMMENT ON COLUMN archived_fee_payments.invalidated_reason IS 'Reason why this credit was invalidated (e.g., new payment made instead of using credit).';

-- Granular Checkout System Tables

-- Operation idempotency table for preventing duplicate operations
CREATE TABLE IF NOT EXISTS operation_idempotency (
    id SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    operation_type VARCHAR(100) NOT NULL,
    operation_result JSONB,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_operation_idempotency_key ON operation_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_operation_idempotency_expires ON operation_idempotency(expires_at);

-- Checkout sessions table for tracking overall checkout progress
CREATE TABLE IF NOT EXISTS checkout_sessions (
    id VARCHAR(255) PRIMARY KEY,
    chromebook_id INTEGER REFERENCES chromebooks(id),
    student_id VARCHAR(50) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    checkout_data JSONB,
    overall_status VARCHAR(50) DEFAULT 'in_progress' CHECK (overall_status IN ('in_progress', 'completed', 'failed', 'cancelled', 'rollback_completed', 'rollback_failed')),
    current_step VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_chromebook_id ON checkout_sessions(chromebook_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_student_id ON checkout_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_overall_status ON checkout_sessions(overall_status);

-- Checkout step tracking table for granular step monitoring
CREATE TABLE IF NOT EXISTS checkout_step_tracking (
    id SERIAL PRIMARY KEY,
    checkout_session_id VARCHAR(255) NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
    step_name VARCHAR(100) NOT NULL,
    step_idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rolled_back')),
    step_data JSONB,
    result_data JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_checkout_session_id ON checkout_step_tracking(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_step_idempotency_key ON checkout_step_tracking(step_idempotency_key);
CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_status ON checkout_step_tracking(status);
CREATE INDEX IF NOT EXISTS idx_checkout_step_tracking_step_name ON checkout_step_tracking(step_name);

-- Checkout outbox table for reliable event processing
CREATE TABLE IF NOT EXISTS checkout_outbox (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkout_outbox_session_id ON checkout_outbox(session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_status ON checkout_outbox(status);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_next_retry_at ON checkout_outbox(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_checkout_outbox_event_type ON checkout_outbox(event_type);

-- Add a comment to describe the purpose of the new tables
COMMENT ON TABLE student_fees IS 'Tracks outstanding fees for students, often linked to device maintenance.';
COMMENT ON TABLE fee_payments IS 'Logs payments made by students towards their outstanding fees.';

-- Insurance overrides table for tracking super admin insurance status changes
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

-- Add comments for documentation
COMMENT ON TABLE insurance_overrides IS 'Tracks insurance status overrides performed by super admins';
COMMENT ON COLUMN insurance_overrides.chromebook_id IS 'Reference to the chromebook whose insurance status was overridden';
COMMENT ON COLUMN insurance_overrides.original_status IS 'Original insurance status before override';
COMMENT ON COLUMN insurance_overrides.new_status IS 'New insurance status after override';
COMMENT ON COLUMN insurance_overrides.override_reason IS 'Optional reason provided by admin for the override';
COMMENT ON COLUMN insurance_overrides.admin_user_id IS 'User ID of the super admin who performed the override';

-- Create triggers to automatically update the updated_at column
-- (Moved to end to ensure all tables exist before creating triggers)
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chromebooks_updated_at BEFORE UPDATE ON chromebooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checkout_history_updated_at BEFORE UPDATE ON checkout_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_device_history_updated_at BEFORE UPDATE ON device_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checkout_sessions_updated_at BEFORE UPDATE ON checkout_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checkout_step_tracking_updated_at BEFORE UPDATE ON checkout_step_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checkout_outbox_updated_at BEFORE UPDATE ON checkout_outbox FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_insurance_overrides_updated_at BEFORE UPDATE ON insurance_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Aeries granular permissions per user
-- Allows super admins to enable/disable specific Aeries access per user
CREATE TABLE IF NOT EXISTS aeries_permissions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    aeries_enabled BOOLEAN DEFAULT FALSE,
    can_access_school_data BOOLEAN DEFAULT FALSE,
    can_access_student_data BOOLEAN DEFAULT FALSE,
    -- Granular visibility flags
    can_view_student_overview BOOLEAN DEFAULT FALSE,
    can_view_contact_info BOOLEAN DEFAULT FALSE,
    can_view_address_info BOOLEAN DEFAULT FALSE,
    can_view_emergency_contacts BOOLEAN DEFAULT FALSE,
    can_view_academic_info BOOLEAN DEFAULT FALSE,
    can_view_personal_info BOOLEAN DEFAULT FALSE,
    can_view_test_records BOOLEAN DEFAULT FALSE,
    can_view_programs BOOLEAN DEFAULT FALSE,
    can_view_picture BOOLEAN DEFAULT FALSE,
    can_view_groups BOOLEAN DEFAULT FALSE,
    can_view_fines BOOLEAN DEFAULT FALSE,
    can_view_disciplinary_records BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_aeries_permissions_enabled ON aeries_permissions(aeries_enabled);

-- Trigger to keep updated_at fresh
CREATE TRIGGER update_aeries_permissions_updated_at BEFORE UPDATE ON aeries_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Documentation
COMMENT ON TABLE aeries_permissions IS 'Per-user Aeries access flags (granular permissions)';
COMMENT ON COLUMN aeries_permissions.aeries_enabled IS 'Master switch – user can access Aeries features when true';
COMMENT ON COLUMN aeries_permissions.can_access_school_data IS 'Allow access to school-level data (e.g., schools API)';
COMMENT ON COLUMN aeries_permissions.can_access_student_data IS 'Allow general student data access (e.g., get_student)';
COMMENT ON COLUMN aeries_permissions.can_view_student_overview IS 'Allow viewing basic student overview (name, grade, gender, birthdate)';
COMMENT ON COLUMN aeries_permissions.can_view_contact_info IS 'Allow viewing student/parent emails and phone numbers';
COMMENT ON COLUMN aeries_permissions.can_view_address_info IS 'Allow viewing mailing/residence addresses';
COMMENT ON COLUMN aeries_permissions.can_view_emergency_contacts IS 'Allow access to student emergency contacts';
COMMENT ON COLUMN aeries_permissions.can_view_academic_info IS 'Allow access to academic info (grades, transcripts, schedules, attendance)';
COMMENT ON COLUMN aeries_permissions.can_view_personal_info IS 'Allow access to personal/demographic info (ethnicity, language, parent ed level)';
COMMENT ON COLUMN aeries_permissions.can_view_test_records IS 'Allow access to standardized test records';
COMMENT ON COLUMN aeries_permissions.can_view_programs IS 'Allow access to student programs';
COMMENT ON COLUMN aeries_permissions.can_view_picture IS 'Allow access to student picture';
COMMENT ON COLUMN aeries_permissions.can_view_groups IS 'Allow access to student groups';
COMMENT ON COLUMN aeries_permissions.can_view_fines IS 'Allow access to student fees/fines';
COMMENT ON COLUMN aeries_permissions.can_view_disciplinary_records IS 'Allow access to student discipline records';

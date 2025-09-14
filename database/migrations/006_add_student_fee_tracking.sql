-- Migration to add student fee and payment tracking tables

-- Create the student_fees table to track outstanding charges
CREATE TABLE IF NOT EXISTS student_fees (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    maintenance_id INTEGER UNIQUE REFERENCES maintenance_records(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id)
);

-- Create an index on student_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_student_fees_student_id ON student_fees(student_id);

-- Create the fee_payments table to log payments made against fees
CREATE TABLE IF NOT EXISTS fee_payments (
    id SERIAL PRIMARY KEY,
    student_fee_id INTEGER NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    notes TEXT,
    processed_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on student_fee_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_fee_id ON fee_payments(student_fee_id);

-- Add a comment to describe the purpose of the new tables
COMMENT ON TABLE student_fees IS 'Tracks outstanding fees for students, often linked to device maintenance.';
COMMENT ON TABLE fee_payments IS 'Logs payments made by students towards their outstanding fees.';

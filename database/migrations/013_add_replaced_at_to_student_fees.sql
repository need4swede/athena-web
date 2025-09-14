-- Migration to add replaced_at column to student_fees table

ALTER TABLE student_fees
ADD COLUMN replaced_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN student_fees.replaced_at IS 'Timestamp for when a fee is replaced by a new one, making its payments available for transfer.';

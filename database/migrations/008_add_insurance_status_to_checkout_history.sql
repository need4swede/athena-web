-- Add insurance status to checkout_history table
ALTER TABLE checkout_history
ADD COLUMN insurance VARCHAR(20) NOT NULL DEFAULT 'uninsured';

-- Add an index on the new insurance column for faster lookups
CREATE INDEX IF NOT EXISTS idx_checkout_history_insurance ON checkout_history(insurance);

-- Add a comment to describe the purpose of the new column
COMMENT ON COLUMN checkout_history.insurance IS 'Tracks the insurance status of the device, can be uninsured, pending, or insured.';

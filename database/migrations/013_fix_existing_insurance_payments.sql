-- Fix existing insurance payments that are trapped due to fees not being marked as replaced
-- This addresses the immediate issue where previous insurance payments can't be used

UPDATE student_fees
SET replaced_at = CURRENT_TIMESTAMP
WHERE description = 'Device Insurance Fee'
  AND replaced_at IS NULL
  AND id IN (
    SELECT DISTINCT sf.id
    FROM student_fees sf
    INNER JOIN fee_payments fp ON sf.id = fp.student_fee_id
    WHERE sf.description = 'Device Insurance Fee'
      AND sf.replaced_at IS NULL
  );

-- Show the results
SELECT
    sf.id as fee_id,
    sf.student_id,
    sf.amount as fee_amount,
    sf.created_at as fee_created,
    sf.replaced_at,
    COUNT(fp.id) as payment_count,
    COALESCE(SUM(fp.amount), 0) as total_paid
FROM student_fees sf
LEFT JOIN fee_payments fp ON sf.id = fp.student_fee_id
WHERE sf.description = 'Device Insurance Fee'
  AND sf.replaced_at IS NOT NULL
GROUP BY sf.id, sf.student_id, sf.amount, sf.created_at, sf.replaced_at
ORDER BY sf.replaced_at DESC;

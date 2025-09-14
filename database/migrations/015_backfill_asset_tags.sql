-- Migration 015b: Backfill Asset Tags for Existing Archived Payments
-- This migration retroactively determines which devices the existing archived insurance payments came from

DO $$
DECLARE
    payment_record RECORD;
    asset_tag_found VARCHAR(255);
    total_records INTEGER := 0;
    updated_records INTEGER := 0;
    failed_records INTEGER := 0;
    strategy_used TEXT;
BEGIN
    RAISE NOTICE 'Starting backfill of asset tags for archived insurance payments...';

    -- Count total records to process
    SELECT COUNT(*) INTO total_records
    FROM archived_fee_payments
    WHERE original_asset_tag IS NULL;

    RAISE NOTICE 'Found % archived payment records without asset tags', total_records;

    -- Process each archived payment without an asset tag
    FOR payment_record IN
        SELECT
            afp.id,
            afp.student_id,
            afp.transaction_id,
            afp.amount,
            afp.created_at,
            afp.archived_at,
            afp.original_fee_id,
            s.student_id as student_external_id,
            s.first_name || ' ' || s.last_name as student_name
        FROM archived_fee_payments afp
        JOIN students s ON s.id = afp.student_id
        WHERE afp.original_asset_tag IS NULL
        ORDER BY afp.archived_at DESC
    LOOP
        asset_tag_found := NULL;
        strategy_used := 'none';

        RAISE NOTICE 'Processing payment ID % for student % (%) - Transaction: %',
            payment_record.id,
            payment_record.student_name,
            payment_record.student_external_id,
            payment_record.transaction_id;

        -- Strategy 1: Find checkout with insurance around the original fee creation time
        -- Look for checkouts within 7 days before the payment was created
        SELECT c.asset_tag INTO asset_tag_found
        FROM checkout_history ch
        JOIN chromebooks c ON c.id = ch.chromebook_id
        WHERE
            ch.student_id = payment_record.student_id
            AND ch.action = 'checkout'
            AND ch.insurance IN ('pending', 'insured')
            AND ch.action_date <= payment_record.created_at
            AND ch.action_date >= (payment_record.created_at - INTERVAL '7 days')
        ORDER BY ch.action_date DESC
        LIMIT 1;

        IF asset_tag_found IS NOT NULL THEN
            strategy_used := 'checkout_history_7days';
        ELSE
            -- Strategy 2: Expand search to 30 days before payment creation
            SELECT c.asset_tag INTO asset_tag_found
            FROM checkout_history ch
            JOIN chromebooks c ON c.id = ch.chromebook_id
            WHERE
                ch.student_id = payment_record.student_id
                AND ch.action = 'checkout'
                AND ch.insurance IN ('pending', 'insured')
                AND ch.action_date <= payment_record.created_at
                AND ch.action_date >= (payment_record.created_at - INTERVAL '30 days')
            ORDER BY ch.action_date DESC
            LIMIT 1;

            IF asset_tag_found IS NOT NULL THEN
                strategy_used := 'checkout_history_30days';
            ELSE
                -- Strategy 3: Look for any checkout around the archived date (±15 days)
                SELECT c.asset_tag INTO asset_tag_found
                FROM checkout_history ch
                JOIN chromebooks c ON c.id = ch.chromebook_id
                WHERE
                    ch.student_id = payment_record.student_id
                    AND ch.action = 'checkout'
                    AND ch.action_date BETWEEN
                        (payment_record.archived_at - INTERVAL '15 days') AND
                        (payment_record.archived_at + INTERVAL '15 days')
                ORDER BY ABS(EXTRACT(EPOCH FROM (ch.action_date - payment_record.archived_at)))
                LIMIT 1;

                IF asset_tag_found IS NOT NULL THEN
                    strategy_used := 'checkout_around_archive';
                ELSE
                    -- Strategy 4: Find student's most recent checkout with insurance
                    SELECT c.asset_tag INTO asset_tag_found
                    FROM checkout_history ch
                    JOIN chromebooks c ON c.id = ch.chromebook_id
                    WHERE
                        ch.student_id = payment_record.student_id
                        AND ch.action = 'checkout'
                        AND ch.insurance IN ('pending', 'insured')
                        AND ch.action_date <= payment_record.archived_at
                    ORDER BY ch.action_date DESC
                    LIMIT 1;

                    IF asset_tag_found IS NOT NULL THEN
                        strategy_used := 'most_recent_insured_checkout';
                    ELSE
                        -- Strategy 5: If original_fee_id exists, try to find related checkout
                        IF payment_record.original_fee_id IS NOT NULL THEN
                            -- Look for student fees around the same time as the original fee
                            SELECT c.asset_tag INTO asset_tag_found
                            FROM student_fees sf
                            JOIN checkout_history ch ON ch.student_id = sf.student_id
                            JOIN chromebooks c ON c.id = ch.chromebook_id
                            WHERE
                                sf.id = payment_record.original_fee_id
                                AND ch.action = 'checkout'
                                AND ABS(EXTRACT(EPOCH FROM (ch.action_date - sf.created_at))) <= 86400 -- Within 1 day
                            ORDER BY ABS(EXTRACT(EPOCH FROM (ch.action_date - sf.created_at)))
                            LIMIT 1;

                            IF asset_tag_found IS NOT NULL THEN
                                strategy_used := 'original_fee_correlation';
                            END IF;
                        END IF;

                        -- Strategy 6: Last resort - any checkout by this student
                        IF asset_tag_found IS NULL THEN
                            SELECT c.asset_tag INTO asset_tag_found
                            FROM checkout_history ch
                            JOIN chromebooks c ON c.id = ch.chromebook_id
                            WHERE
                                ch.student_id = payment_record.student_id
                                AND ch.action = 'checkout'
                                AND ch.action_date <= payment_record.archived_at
                            ORDER BY ch.action_date DESC
                            LIMIT 1;

                            IF asset_tag_found IS NOT NULL THEN
                                strategy_used := 'any_checkout';
                            END IF;
                        END IF;
                    END IF;
                END IF;
            END IF;
        END IF;

        -- Update the record if we found an asset tag
        IF asset_tag_found IS NOT NULL THEN
            UPDATE archived_fee_payments
            SET original_asset_tag = asset_tag_found
            WHERE id = payment_record.id;

            updated_records := updated_records + 1;

            RAISE NOTICE '  ✓ Updated with asset tag % (strategy: %)', asset_tag_found, strategy_used;
        ELSE
            failed_records := failed_records + 1;
            RAISE NOTICE '  ✗ Could not determine asset tag';
        END IF;
    END LOOP;

    -- Final statistics
    RAISE NOTICE '';
    RAISE NOTICE '=== BACKFILL COMPLETE ===';
    RAISE NOTICE 'Total records processed: %', total_records;
    RAISE NOTICE 'Successfully updated: %', updated_records;
    RAISE NOTICE 'Failed to resolve: %', failed_records;
    RAISE NOTICE 'Success rate: %%%', ROUND((updated_records::DECIMAL / NULLIF(total_records, 0)) * 100, 1);

    -- Show strategy breakdown
    RAISE NOTICE '';
    RAISE NOTICE '=== STRATEGY BREAKDOWN ===';

    FOR payment_record IN
        SELECT
            CASE
                WHEN original_asset_tag IS NULL THEN 'unresolved'
                ELSE 'resolved'
            END as resolution_status,
            COUNT(*) as count
        FROM archived_fee_payments
        GROUP BY
            CASE
                WHEN original_asset_tag IS NULL THEN 'unresolved'
                ELSE 'resolved'
            END
    LOOP
        RAISE NOTICE '% records: %', payment_record.resolution_status, payment_record.count;
    END LOOP;

    -- Show sample of unresolved records for manual investigation
    RAISE NOTICE '';
    RAISE NOTICE '=== UNRESOLVED RECORDS (SAMPLE) ===';

    FOR payment_record IN
        SELECT
            afp.id,
            afp.transaction_id,
            afp.amount,
            afp.created_at,
            afp.archived_at,
            s.student_id as student_external_id,
            s.first_name || ' ' || s.last_name as student_name
        FROM archived_fee_payments afp
        JOIN students s ON s.id = afp.student_id
        WHERE afp.original_asset_tag IS NULL
        ORDER BY afp.archived_at DESC
        LIMIT 5
    LOOP
        RAISE NOTICE 'Unresolved: ID=%, Student=% (%), Transaction=%, Amount=$%, Archived=%',
            payment_record.id,
            payment_record.student_name,
            payment_record.student_external_id,
            payment_record.transaction_id,
            payment_record.amount,
            payment_record.archived_at;
    END LOOP;

    IF failed_records > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE 'NOTE: % records could not be resolved automatically.', failed_records;
        RAISE NOTICE 'These may need manual investigation or the original data may be incomplete.';
        RAISE NOTICE 'These records will still function but won''t show original device info in the UI.';
    END IF;

END $$;

-- Create a view to help with manual investigation of unresolved records
CREATE OR REPLACE VIEW unresolved_credit_payments AS
SELECT
    afp.id,
    afp.transaction_id,
    afp.amount,
    afp.payment_method,
    afp.notes,
    afp.created_at,
    afp.archived_at,
    s.student_id as student_external_id,
    s.first_name || ' ' || s.last_name as student_name,
    s.email as student_email,
    -- Show recent checkout history for context
    (
        SELECT json_agg(
            json_build_object(
                'asset_tag', c.asset_tag,
                'action_date', ch.action_date,
                'action', ch.action,
                'insurance', ch.insurance
            ) ORDER BY ch.action_date DESC
        )
        FROM checkout_history ch
        JOIN chromebooks c ON c.id = ch.chromebook_id
        WHERE ch.student_id = afp.student_id
        AND ch.action_date BETWEEN (afp.archived_at - INTERVAL '60 days') AND (afp.archived_at + INTERVAL '60 days')
        LIMIT 10
    ) as nearby_checkout_history
FROM archived_fee_payments afp
JOIN students s ON s.id = afp.student_id
WHERE afp.original_asset_tag IS NULL;

COMMENT ON VIEW unresolved_credit_payments IS 'Shows archived payments that could not be automatically matched to devices, with context for manual resolution.';

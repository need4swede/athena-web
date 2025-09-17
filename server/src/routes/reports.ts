import express from 'express';
import { query } from '../database';
import { authenticateToken } from '../middleware/auth';
import { reportsConfig } from '../config';

const router = express.Router();

router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { school, checkoutBy, includeSubdirectories, includeArchived } = req.query as any;

    let whereClauses = [];
    let queryParams = [];

    if (school && school !== 'all') {
      if (includeSubdirectories === 'true') {
        queryParams.push(`${school}%`);
        whereClauses.push(`gu.org_unit_path LIKE $${queryParams.length}`);
      } else {
        queryParams.push(school);
        whereClauses.push(`gu.org_unit_path = $${queryParams.length}`);
      }
    }

    if (checkoutBy) {
      queryParams.push(`%${checkoutBy}%`);
      whereClauses.push(`u.name ILIKE $${queryParams.length}`);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let queryString = `
      SELECT
        fp.id,
        CONCAT(s.first_name, ' ', s.last_name) as student_name,
        s.student_id,
        sf.description as fee_description,
        fp.amount,
        fp.payment_method,
        fp.transaction_id,
        fp.notes,
        fp.created_at,
        u.name as processed_by
      FROM fee_payments fp
      JOIN student_fees sf ON fp.student_fee_id = sf.id
      JOIN students s ON sf.student_id = s.id
      LEFT JOIN users u ON fp.processed_by_user_id = u.id
      LEFT JOIN google_users gu ON s.email = gu.primary_email
      ${whereClause}
    `;

    if (includeArchived === 'true') {
      queryString = `
        (${queryString})
        UNION ALL
        (
          SELECT
            afp.id,
            CONCAT(s.first_name, ' ', s.last_name) as student_name,
            s.student_id,
            'Device Insurance Fee (Archived)' as fee_description,
            afp.amount,
            afp.payment_method,
            afp.transaction_id,
            afp.notes,
            afp.created_at,
            u.name as processed_by
          FROM archived_fee_payments afp
          JOIN students s ON afp.student_id = s.id
          LEFT JOIN users u ON afp.processed_by_user_id = u.id
          LEFT JOIN google_users gu ON s.email = gu.primary_email
          ${whereClause}
        )
      `;
    }

    // Final ordering by date
    queryString = `
      ${queryString}
      ORDER BY created_at DESC
    `;

    const result = await query(queryString, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transaction report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/current-checkouts', authenticateToken, async (req, res) => {
  try {
    const { school, includeSubdirectories, checkoutBy, includePending } = req.query as Record<string, string | undefined>;

    const whereClauses: string[] = [];
    const queryParams: string[] = [];

    const statusClause = includePending === 'true'
      ? "c.status IN ('checked_out', 'pending_signature')"
      : "c.status = 'checked_out'";

    whereClauses.push(statusClause);

    if (school && school !== 'all') {
      if (includeSubdirectories === 'true') {
        queryParams.push(`${school}%`);
        whereClauses.push(`gu.org_unit_path LIKE $${queryParams.length}`);
      } else {
        queryParams.push(school);
        whereClauses.push(`gu.org_unit_path = $${queryParams.length}`);
      }
    }

    if (checkoutBy) {
      queryParams.push(`%${checkoutBy}%`);
      const paramIndex = queryParams.length;
      whereClauses.push(`(COALESCE(u.name, '') || ' ' || COALESCE(u.email, '')) ILIKE $${paramIndex}`);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const queryString = `
      SELECT
        c.id AS chromebook_id,
        c.asset_tag,
        c.serial_number,
        c.model,
        c.status AS chromebook_status,
        c.checked_out_date,
        c.is_insured,
        c.insurance_status AS chromebook_insurance_status,
        s.student_id,
        s.first_name,
        s.last_name,
        s.email AS student_email,
        gu.org_unit_path,
        ch.checkout_id,
        ch.action_date AS checkout_date,
        ch.notes AS checkout_notes,
        ch.status AS checkout_status,
        ch.insurance AS checkout_insurance,
        NULL::VARCHAR AS checkout_insurance_status,
        u.name AS processed_by_name,
        u.email AS processed_by_email,
        COALESCE(ch.action_date, c.checked_out_date) AS effective_checkout_date,
        DATE_PART('day', NOW() - COALESCE(ch.action_date, c.checked_out_date))::int AS days_out
      FROM chromebooks c
      JOIN students s ON c.current_user_id = s.id
      LEFT JOIN google_users gu ON gu.student_id = s.student_id OR LOWER(gu.primary_email) = LOWER(s.email)
      LEFT JOIN LATERAL (
        SELECT
          ch_inner.id AS checkout_id,
          ch_inner.action_date,
          ch_inner.notes,
          ch_inner.status,
          ch_inner.insurance,
          ch_inner.user_id
        FROM checkout_history ch_inner
        WHERE ch_inner.chromebook_id = c.id AND ch_inner.action = 'checkout'
        ORDER BY ch_inner.action_date DESC
        LIMIT 1
      ) ch ON TRUE
      LEFT JOIN users u ON ch.user_id = u.id
      ${whereClause}
      ORDER BY effective_checkout_date DESC NULLS LAST
    `;

    const result = await query(queryString, queryParams);

    const payload = result.rows.map(row => ({
      chromebook: {
        id: row.chromebook_id,
        assetTag: row.asset_tag,
        serialNumber: row.serial_number,
        model: row.model,
        status: row.chromebook_status,
        checkedOutDate: row.checked_out_date,
        isInsured: row.is_insured,
        insuranceStatus: row.chromebook_insurance_status
      },
      student: {
        studentId: row.student_id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.student_email,
        orgUnitPath: row.org_unit_path
      },
      processedBy: {
        name: row.processed_by_name,
        email: row.processed_by_email
      },
      checkout: {
        id: row.checkout_id,
        date: row.checkout_date,
        status: row.checkout_status,
        insurance: row.checkout_insurance || row.chromebook_insurance_status,
        insuranceStatus: row.checkout_insurance_status || row.chromebook_insurance_status,
        notes: row.checkout_notes
      },
      meta: {
        effectiveCheckoutDate: row.effective_checkout_date,
        daysOut: row.days_out
      }
    }));

    res.json(payload);
  } catch (error) {
    console.error('Error fetching current checkouts report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/schools', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT org_unit_path
      FROM google_users
      WHERE org_unit_path IS NOT NULL AND org_unit_path != ''
      ORDER BY org_unit_path
    `);
    const schools = result.rows.map(row => {
      const orgUnitPath = row.org_unit_path;
      const name = orgUnitPath.startsWith('/') ? orgUnitPath.substring(1) : orgUnitPath;
      return { name, orgUnitPath };
    }).filter(school => !reportsConfig.hiddenOrgs.includes(school.orgUnitPath));
    res.json(schools);
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as reportRoutes };

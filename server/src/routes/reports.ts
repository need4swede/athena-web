import express from 'express';
import { query } from '../database';
import { authenticateToken } from '../middleware/auth';
import { reportsConfig } from '../config';

const router = express.Router();

router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { school, checkoutBy, includeSubdirectories } = req.query;

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

    const queryString = `
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
      ORDER BY fp.created_at DESC
    `;

    const result = await query(queryString, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transaction report:', error);
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

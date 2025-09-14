import express from 'express';
import { body, param, query as queryValidator, validationResult } from 'express-validator';
import { query } from '../database';
import { authenticateToken } from '../middleware/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { userDeviceHistoryRoutes } from './user-device-history';
import { feeRoutes } from './fees';
import { createStudentFee, getStudentFees } from '../services/feeService';
import { SandboxStore } from '../services/sandboxStore';
import { SandboxOverlay } from '../services/sandboxOverlay';

const router = express.Router();
router.use('/history', userDeviceHistoryRoutes);
router.use('/fees', feeRoutes);
const execAsync = promisify(exec);

// In-memory cache for Google API results
interface CacheEntry {
    data: any[];
    timestamp: number;
    searchTerm: string;
}

const googleSearchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds

// Helper function to normalize search terms for caching
const normalizeCacheKey = (searchTerm: string): string => {
    return searchTerm.toLowerCase().trim();
};

// Helper function to check if cache entry is valid
const isCacheValid = (entry: CacheEntry): boolean => {
    return Date.now() - entry.timestamp < CACHE_TTL;
};

// Helper function to run Athena script
const runAthenaScript = async (scriptName: string, args: string[]): Promise<any> => {
    const athenaPath = path.join(process.cwd(), 'athena', 'scripts');
    const scriptPath = path.join(athenaPath, scriptName);
    const command = `cd ${athenaPath} && python3 ${scriptPath} ${args.map(arg => `"${arg}"`).join(' ')}`;

    try {
        const { stdout, stderr } = await execAsync(command);
        if (stderr) {
            console.warn(`⚠️ [Athena Script] ${scriptName} stderr:`, stderr);
        }
        return JSON.parse(stdout);
    } catch (error: any) {
        console.error(`❌ [Athena Script] ${scriptName} error:`, error);
        throw new Error(`Athena script failed: ${error.message}`);
    }
};

// Helper function to auto-populate students from Google API results
const autoPopulateStudents = async (googleStudents: any[]): Promise<number> => {
    let studentsCreated = 0;

    for (const student of googleStudents) {
        try {
            // Insert into google_users table
            await query(
                `INSERT INTO google_users (
                    google_id, primary_email, first_name, last_name, full_name,
                    org_unit_path, is_admin, is_suspended, student_id, creation_time, last_login_time
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (google_id) DO UPDATE SET
                    primary_email = EXCLUDED.primary_email,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    full_name = EXCLUDED.full_name,
                    org_unit_path = EXCLUDED.org_unit_path,
                    is_admin = EXCLUDED.is_admin,
                    is_suspended = EXCLUDED.is_suspended,
                    student_id = EXCLUDED.student_id,
                    creation_time = EXCLUDED.creation_time,
                    last_login_time = EXCLUDED.last_login_time,
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    student.google_id,
                    student.primary_email,
                    student.first_name,
                    student.last_name,
                    student.full_name,
                    student.org_unit_path,
                    student.is_admin,
                    student.is_suspended,
                    student.student_id,
                    student.creation_time,
                    student.last_login_time
                ]
            );

            // Insert into students table if student has valid student_id
            if (student.student_id && student.first_name && student.last_name) {
                const existingStudent = await query(
                    'SELECT id FROM students WHERE student_id = $1',
                    [student.student_id]
                );

                if (existingStudent.rows.length === 0) {
                    await query(
                        `INSERT INTO students (student_id, first_name, last_name, email)
                         VALUES ($1, $2, $3, $4)`,
                        [student.student_id, student.first_name, student.last_name, student.primary_email]
                    );
                    studentsCreated++;
                    console.log(`📚 Auto-created student record: ${student.first_name} ${student.last_name} (ID: ${student.student_id})`);
                } else {
                    // Update existing student record
                    await query(
                        `UPDATE students SET
                            first_name = $2, last_name = $3, email = $4, updated_at = CURRENT_TIMESTAMP
                         WHERE student_id = $1`,
                        [student.student_id, student.first_name, student.last_name, student.primary_email]
                    );
                }
            }
        } catch (error) {
            console.error(`❌ [Auto-populate] Failed to create student record for ${student.primary_email}:`, error);
        }
    }

    return studentsCreated;
};

// Get all students
router.get('/', authenticateToken, async (req: any, res: any) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;
        const search = req.query.search as string;

        let queryText = 'SELECT * FROM students';
        let queryParams: any[] = [];

        if (search) {
            queryText += ` WHERE
                student_id ILIKE $1 OR
                first_name ILIKE $1 OR
                last_name ILIKE $1 OR
                email ILIKE $1`;
            queryParams.push(`%${search}%`);
        }

        queryText += ` ORDER BY last_name, first_name LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(limit, offset);

        const studentsResult = await query(queryText, queryParams);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM students';
        let countParams: any[] = [];

        if (search) {
            countQuery += ` WHERE
                student_id ILIKE $1 OR
                first_name ILIKE $1 OR
                last_name ILIKE $1 OR
                email ILIKE $1`;
            countParams.push(`%${search}%`);
        }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            students: studentsResult.rows,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });

    } catch (error) {
        console.error('❌ [Get Students] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch students'
        });
    }
});

// Search students by query
router.get('/search', [
    queryValidator('q').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const searchQuery = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 20;

        const studentsResult = await query(`
            SELECT
                id,
                student_id,
                first_name,
                last_name,
                email,
                grade_level,
                created_at
            FROM students
            WHERE
                student_id ILIKE $1 OR
                first_name ILIKE $1 OR
                last_name ILIKE $1 OR
                email ILIKE $1 OR
                (first_name || ' ' || last_name) ILIKE $1
            ORDER BY
                CASE
                    WHEN student_id ILIKE $2 THEN 1
                    WHEN first_name ILIKE $2 OR last_name ILIKE $2 THEN 2
                    WHEN email ILIKE $2 THEN 3
                    ELSE 4
                END,
                last_name, first_name
            LIMIT $3
        `, [`%${searchQuery}%`, `${searchQuery}%`, limit]);

        const students = studentsResult.rows.map(row => ({
            id: row.id,
            studentId: row.student_id,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            gradeLevel: row.grade_level,
            fullName: `${row.first_name} ${row.last_name}`,
            createdAt: row.created_at
        }));

        res.json({ students });

    } catch (error) {
        console.error('❌ [Search Students] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to search students'
        });
    }
});

// Note: The hybrid search endpoint has been deprecated in favor of the unified /api/search endpoint
// which provides the same functionality with better performance and consistency across all pages.

// Get student by ID
router.get('/:id', [
    param('id').isInt({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const studentId = parseInt(req.params.id);

        const studentResult = await query(
            'SELECT * FROM students WHERE id = $1',
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const student = studentResult.rows[0];

        // Get checkout history for this student
        const historyResult = await query(`
            SELECT
                ch.id,
                ch.action,
                ch.action_date,
                ch.notes,
                c.asset_tag,
                c.serial_number,
                c.model,
                u.name as performed_by_name
            FROM checkout_history ch
            JOIN chromebooks c ON ch.chromebook_id = c.id
            LEFT JOIN users u ON ch.user_id = u.id
            WHERE ch.student_id = $1
            ORDER BY ch.action_date DESC
            LIMIT 20
        `, [studentId]);

        const checkoutHistory = historyResult.rows.map(row => ({
            id: row.id,
            action: row.action,
            timestamp: row.action_date,
            notes: row.notes,
            chromebook: {
                assetTag: row.asset_tag,
                serialNumber: row.serial_number,
                model: row.model
            },
            performedBy: row.performed_by_name
        }));

        // Check if student currently has any checked out devices
        const currentCheckoutResult = await query(`
            SELECT
                c.id,
                c.asset_tag,
                c.serial_number,
                c.model,
                c.checked_out_date
            FROM chromebooks c
            WHERE c.current_user_id = $1 AND c.status = 'checked-out'
        `, [studentId]);

        const currentCheckouts = currentCheckoutResult.rows.map(row => ({
            id: row.id,
            assetTag: row.asset_tag,
            serialNumber: row.serial_number,
            model: row.model,
            checkedOutDate: row.checked_out_date
        }));

        res.json({
            student: {
                id: student.id,
                studentId: student.student_id,
                firstName: student.first_name,
                lastName: student.last_name,
                email: student.email,
                gradeLevel: student.grade_level,
                createdAt: student.created_at,
                updatedAt: student.updated_at
            },
            currentCheckouts,
            checkoutHistory
        });

    } catch (error) {
        console.error('❌ [Get Student] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch student'
        });
    }
});

// Create new student (admin only)
router.post('/', [
    body('student_id').isString().trim().isLength({ min: 1 }),
    body('first_name').isString().trim().isLength({ min: 1 }),
    body('last_name').isString().trim().isLength({ min: 1 }),
    body('email').optional().isEmail(),
    body('grade_level').optional().isInt({ min: 1, max: 12 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { student_id, first_name, last_name, email, grade_level } = req.body;

        // Check if student ID already exists
        const existingStudentResult = await query(
            'SELECT id FROM students WHERE student_id = $1',
            [student_id]
        );

        if (existingStudentResult.rows.length > 0) {
            return res.status(409).json({
                error: 'Student ID already exists',
                student_id
            });
        }

        const studentResult = await query(
            `INSERT INTO students (student_id, first_name, last_name, email, grade_level)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [student_id, first_name, last_name, email || null, grade_level || null]
        );

        const student = studentResult.rows[0];

        res.status(201).json({
            message: 'Student created successfully',
            student: {
                id: student.id,
                studentId: student.student_id,
                firstName: student.first_name,
                lastName: student.last_name,
                email: student.email,
                gradeLevel: student.grade_level,
                createdAt: student.created_at
            }
        });

    } catch (error) {
        console.error('❌ [Create Student] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to create student'
        });
    }
});

// Get student fees
router.get('/:id/fees', [
    param('id').isInt({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const studentId = parseInt(req.params.id);
        const fees = await getStudentFees(studentId, { sandboxUserId: req.user?.id });
        res.json(fees);

    } catch (error) {
        console.error('❌ [Get Student Fees] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch student fees'
        });
    }
});

// Add a new fee to a student
router.post('/:id/fees', [
    param('id').isInt({ min: 1 }),
    body('amount').isFloat({ gt: 0 }),
    body('description').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const student_id = parseInt(req.params.id);
        const { amount, description } = req.body;
        const created_by_user_id = req.user.id;

        let newFee;
        if (SandboxStore.isActive(req.user.id)) {
            newFee = SandboxOverlay.recordCreatedFee(req.user.id, {
                student_id,
                amount: parseFloat(amount),
                description,
                created_by_user_id
            });
        } else {
            newFee = await createStudentFee({
                student_id,
                amount,
                description,
                created_by_user_id
            });
        }

        res.status(201).json(newFee);

    } catch (error) {
        console.error('❌ [Add Fee] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to add fee'
        });
    }
});

// Update student (admin only)
router.put('/:id', [
    param('id').isInt({ min: 1 }),
    body('first_name').optional().isString().trim().isLength({ min: 1 }),
    body('last_name').optional().isString().trim().isLength({ min: 1 }),
    body('email').optional().isEmail(),
    body('grade_level').optional().isInt({ min: 1, max: 12 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const studentId = parseInt(req.params.id);
        const updates = req.body;

        // Build dynamic update query
        const updateFields = Object.keys(updates).filter(key =>
            ['first_name', 'last_name', 'email', 'grade_level'].includes(key)
        );

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const setClause = updateFields
            .map((field, index) => `${field} = $${index + 2}`)
            .join(', ');

        const values = [studentId, ...updateFields.map(field => updates[field])];

        const studentResult = await query(
            `UPDATE students SET ${setClause}, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            values
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const student = studentResult.rows[0];

        res.json({
            message: 'Student updated successfully',
            student: {
                id: student.id,
                studentId: student.student_id,
                firstName: student.first_name,
                lastName: student.last_name,
                email: student.email,
                gradeLevel: student.grade_level,
                updatedAt: student.updated_at
            }
        });

    } catch (error) {
        console.error('❌ [Update Student] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to update student'
        });
    }
});

// Import the new credit transfer functions
import {
    getPreviousInsurancePayments,
    getAvailableCredits,
    transferCreditToFee,
    invalidateUnusedCredits
} from '../services/feeService';

// Get available credits for a student (enhanced with asset tag info)
router.get('/:id/available-credits', [
    authenticateToken
], async (req: any, res: any) => {
    try {
        // Accept either SIS student_id or internal DB ID
        let studentId = parseInt(req.params.id);
        if (isNaN(studentId) || studentId > 100000) {
            // SIS ID, resolve to DB ID
            const dbIdResult = await query('SELECT id FROM students WHERE student_id = $1', [req.params.id]);
            if (dbIdResult.rows.length === 0) {
                return res.status(404).json({ error: 'Student not found' });
            }
            studentId = dbIdResult.rows[0].id;
        }

        const credits = await getAvailableCredits(studentId);
        res.json(credits);
    } catch (error) {
        console.error('❌ [ERROR] Error fetching available credits:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get previous insurance payments for a student (legacy endpoint for backward compatibility)
router.get('/:id/previous-insurance-payments', [
    authenticateToken
], async (req: any, res: any) => {
    try {
        // Accept either SIS student_id or internal DB ID
        let studentId = parseInt(req.params.id);
        if (isNaN(studentId) || studentId > 100000) {
            // SIS ID, resolve to DB ID
            const dbIdResult = await query('SELECT id FROM students WHERE student_id = $1', [req.params.id]);
            if (dbIdResult.rows.length === 0) {
                return res.status(404).json({ error: 'Student not found' });
            }
            studentId = dbIdResult.rows[0].id;
        }
        const payments = await getPreviousInsurancePayments(studentId);
        res.json(payments);
    } catch (error) {
        console.error('❌ [ERROR] Error fetching archived previous insurance payments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Transfer credit to a fee
router.post('/:id/transfer-credit', [
    param('id').isInt({ min: 1 }),
    body('creditId').isInt({ min: 1 }),
    body('targetFeeId').isInt({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { creditId, targetFeeId } = req.body;
        const processedByUserId = req.user.id;

        const newPayment = await transferCreditToFee(creditId, targetFeeId, processedByUserId);

        res.json({
            message: 'Credit transferred successfully',
            payment: newPayment
        });

    } catch (error) {
        console.error('❌ [Transfer Credit] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Failed to transfer credit'
        });
    }
});

// Invalidate unused credits for a student
router.post('/:id/invalidate-credits', [
    param('id').isInt({ min: 1 }),
    body('reason').optional().isString().trim(),
    authenticateToken
], async (req: any, res: any) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Accept either SIS student_id or internal DB ID
        let studentId = parseInt(req.params.id);
        if (isNaN(studentId) || studentId > 100000) {
            // SIS ID, resolve to DB ID
            const dbIdResult = await query('SELECT id FROM students WHERE student_id = $1', [req.params.id]);
            if (dbIdResult.rows.length === 0) {
                return res.status(404).json({ error: 'Student not found' });
            }
            studentId = dbIdResult.rows[0].id;
        }

        const { reason = 'New payment made instead of using available credit' } = req.body;

        const invalidatedCount = await invalidateUnusedCredits(studentId, reason);

        res.json({
            message: `Successfully invalidated ${invalidatedCount} credit(s)`,
            invalidatedCount
        });

    } catch (error) {
        console.error('❌ [Invalidate Credits] Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Failed to invalidate credits'
        });
    }
});

export { router as studentRoutes };

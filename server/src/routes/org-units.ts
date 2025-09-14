import express from 'express';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';
import { spawn } from 'child_process';
import path from 'path';

const router = express.Router();

// Database connection helper
const getDbConnection = async () => {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST || 'postgres',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'chromebook_library',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
    });
    return pool;
};

// Helper function to run Python scripts
const runPythonScript = (scriptPath: string, args: string[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        console.log(`🐍 [DEBUG] Running Python script: ${scriptPath}`);

        const pythonProcess = spawn('python3', [scriptPath, ...args]);
        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorString += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python process failed: ${errorString}`));
                return;
            }

            try {
                // Extract JSON from output
                let jsonString = dataString.trim();
                const firstBrace = jsonString.indexOf('{');
                const lastBrace = jsonString.lastIndexOf('}');

                if (firstBrace !== -1 && lastBrace !== -1 && firstBrace <= lastBrace) {
                    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
                }

                const result = JSON.parse(jsonString);
                resolve(result);
            } catch (error) {
                reject(new Error(`Failed to parse Python output as JSON: ${error}`));
            }
        });
    });
};

// Get org units from database
router.get('/', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    console.log('🔍 [API] GET /org-units - Request received');
    try {

        const pool = await getDbConnection();

        // Check if we have any org units in the database
        const countResult = await pool.query('SELECT COUNT(*) as count FROM org_units');
        const orgUnitsCount = parseInt(countResult.rows[0].count);

        if (orgUnitsCount === 0) {
            // No data in database, fetch from Google API and sync
            console.log('📥 [API] No org units in database, fetching from Google API...');

            try {
                // Fetch from Google API
                const scriptPath = path.resolve(process.cwd(), './athena/scripts/get_org_units.py');
                const googleResult = await runPythonScript(scriptPath);

                if (googleResult.success && googleResult.data && googleResult.data.length > 0) {
                    // Sync to database
                    const syncScriptPath = path.resolve(process.cwd(), './athena/scripts/sync_org_units.py');
                    await runPythonScript(syncScriptPath);

                    // Now fetch from database
                    const result = await pool.query(`
                        SELECT
                            name,
                            org_unit_path as "orgUnitPath",
                            parent_org_unit_path as "parentOrgUnitPath",
                            org_unit_path as "orgUnitId",
                            '' as description,
                            false as "blockInheritance"
                        FROM org_units
                        ORDER BY org_unit_path
                    `);

                    await pool.end();

                    return res.json({
                        success: true,
                        data: result.rows,
                        source: 'google_api_then_database',
                        message: 'Data fetched from Google API and synced to database'
                    });
                } else {
                    await pool.end();
                    return res.json({
                        success: true,
                        data: [],
                        source: 'google_api',
                        message: 'No org units found in Google API'
                    });
                }
            } catch (error) {
                await pool.end();
                console.error('❌ [API] Error fetching from Google API:', error);
                return res.status(500).json({
                    error: 'Failed to fetch org units from Google API',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        } else {
            // Data exists in database, return it
            console.log(`📊 [API] Found ${orgUnitsCount} org units in database`);

            const result = await pool.query(`
                SELECT
                    name,
                    org_unit_path as "orgUnitPath",
                    parent_org_unit_path as "parentOrgUnitPath",
                    org_unit_path as "orgUnitId",
                    '' as description,
                    false as "blockInheritance"
                FROM org_units
                ORDER BY org_unit_path
            `);

            await pool.end();

            return res.json({
                success: true,
                data: result.rows,
                source: 'database',
                message: `Found ${result.rows.length} org units in database`
            });
        }
    } catch (error) {
        console.error('❌ [API] Error fetching org units:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch org units'
        });
    }
});

// Background sync org units
router.post('/sync', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    console.log('🔄 [API] POST /org-units/sync - Background sync requested');
    try {

        // Run sync in background
        const syncScriptPath = path.resolve(process.cwd(), './athena/scripts/sync_org_units.py');
        const result = await runPythonScript(syncScriptPath);

        res.json({
            success: true,
            message: 'Background sync completed',
            data: result.data
        });
    } catch (error) {
        console.error('❌ [API] Error during background sync:', error);
        res.status(500).json({
            error: 'Background sync failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export { router as orgUnitsRoutes };

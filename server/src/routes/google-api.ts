import express from 'express';
import { spawn } from 'child_process';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';
import { query } from '../database';
import path from 'path';

const router = express.Router();

// Add debugging to see when routes are being registered
console.log('🔧 [DEBUG] Google API routes module loaded');
console.log('🔧 [DEBUG] Router created:', typeof router);

// Helper function to run Python scripts
const runPythonScript = (scriptPath: string, args: string[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        console.log(`🐍 [DEBUG] Running Python script: ${scriptPath}`);
        console.log(`🐍 [DEBUG] With arguments: ${args.join(', ') || 'none'}`);
        console.log(`🐍 [DEBUG] Current working directory: ${process.cwd()}`);
        console.log(`🐍 [DEBUG] Script exists: ${require('fs').existsSync(scriptPath) ? 'Yes' : 'No'}`);

        // Check Python version
        try {
            const pythonVersionOutput = require('child_process').execSync('python3 --version').toString();
            console.log(`🐍 [DEBUG] Python version: ${pythonVersionOutput.trim()}`);
        } catch (error) {
            console.error(`🐍 [DEBUG] Error checking Python version: ${error}`);
        }

        // Check virtual environment
        console.log(`🐍 [DEBUG] VIRTUAL_ENV: ${process.env.VIRTUAL_ENV || 'Not set'}`);
        console.log(`🐍 [DEBUG] PATH: ${process.env.PATH}`);

        // Set up environment with proper PYTHONPATH for athena package
        const env = {
            ...process.env,
            PYTHONPATH: process.cwd()
        };

        const pythonProcess = spawn('python3', [scriptPath, ...args], { env });

        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            console.log(`🐍 [DEBUG] Python stdout chunk: ${chunk}`);
            dataString += chunk;
        });

        pythonProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            console.error(`🐍 [DEBUG] Python stderr chunk: ${chunk}`);
            errorString += chunk;
        });

        pythonProcess.on('close', (code) => {
            console.log(`🐍 [DEBUG] Python process exited with code ${code}`);
            console.log(`🐍 [DEBUG] Full stdout length: ${dataString.length} characters`);
            console.log(`🐍 [DEBUG] Full stderr length: ${errorString.length} characters`);

            // Log the complete raw output for debugging
            console.log(`🐍 [DEBUG] Complete raw stdout:`, JSON.stringify(dataString));
            if (errorString) {
                console.log(`🐍 [DEBUG] Complete raw stderr:`, JSON.stringify(errorString));
            }

            if (code !== 0) {
                console.error(`❌ Python process exited with code ${code}`);
                console.error(`❌ Error: ${errorString}`);
                reject(new Error(`Python process failed: ${errorString}`));
                return;
            }

            // Try to find JSON in the output by looking for the first { and last }
            let jsonString = dataString.trim();

            // If there's extra output before/after JSON, try to extract just the JSON part
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && firstBrace <= lastBrace) {
                jsonString = jsonString.substring(firstBrace, lastBrace + 1);
                console.log(`🐍 [DEBUG] Extracted JSON substring: ${jsonString.substring(0, 200)}${jsonString.length > 200 ? '...' : ''}`);
            }

            try {
                const result = JSON.parse(jsonString);
                console.log(`🐍 [DEBUG] Successfully parsed JSON`);
                console.log(`🐍 [DEBUG] Parsed result keys: ${Object.keys(result).join(', ')}`);
                resolve(result);
            } catch (error) {
                console.error('❌ Failed to parse Python output as JSON:', error);
                console.error(`❌ Raw output (first 500 chars): ${dataString.substring(0, 500)}`);
                console.error(`❌ Raw output (last 500 chars): ${dataString.substring(Math.max(0, dataString.length - 500))}`);
                console.error(`❌ Attempted JSON string: ${jsonString.substring(0, 500)}`);
                const errorMessage = error instanceof Error ? error.message : String(error);
                reject(new Error(`Failed to parse Python output as JSON: ${errorMessage}`));
            }
        });
    });
};

// Get all Chromebooks from Google
router.get('/chromebooks', authenticateToken, async (req: any, res: any) => {
    console.log('🔍 [API] GET /chromebooks - Request received');
    try {
        // Only admins and above can access Google API data
        if (req.user.role === 'user') {
            console.log('❌ [API] GET /chromebooks - Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        console.log('✅ [API] GET /chromebooks - Admin access confirmed, running script');
        const scriptPath = path.resolve(process.cwd(), './athena/scripts/get_chromebooks.py');
        const result = await runPythonScript(scriptPath);

        console.log('✅ [API] GET /chromebooks - Script completed successfully');
        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error fetching Chromebooks:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch Chromebooks from Google API'
        });
    }
});

// Get all Chromebooks from Google with enhanced OU filtering and pagination
router.get('/chromebooks/all', authenticateToken, async (req: any, res: any) => {
    console.log('🔍 [API] GET /chromebooks/all - Request received');
    try {
        // Only admins and above can access Google API data
        if (req.user.role === 'user') {
            console.log('❌ [API] GET /chromebooks/all - Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Get optional OU filter from query params
        const orgUnitPath = req.query.orgUnit as string;
        const args = orgUnitPath ? [orgUnitPath] : [];

        console.log('✅ [API] GET /chromebooks/all - Admin access confirmed, running enhanced script');
        if (orgUnitPath) {
            console.log(`🔍 [API] GET /chromebooks/all - Filtering by OU: ${orgUnitPath}`);
        }

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/get_all_chromebooks_by_ou.py');
        const result = await runPythonScript(scriptPath, args);

        console.log('✅ [API] GET /chromebooks/all - Enhanced script completed successfully');
        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error fetching all Chromebooks:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch all Chromebooks from Google API'
        });
    }
});

// Get organizational units from Google
router.get('/org-units', authenticateToken, async (req: any, res: any) => {
    console.log('🔍 [API] GET /org-units - Request received');
    try {
        // Only admins and above can access Google API data
        if (req.user.role === 'user') {
            console.log('❌ [API] GET /org-units - Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        console.log('✅ [API] GET /org-units - Admin access confirmed, running script');
        const scriptPath = path.resolve(process.cwd(), './athena/scripts/get_org_units.py');
        const result = await runPythonScript(scriptPath);

        console.log('✅ [API] GET /org-units - Script completed successfully');
        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error fetching Org Units:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch Organizational Units from Google API'
        });
    }
});

// Get users from Google
router.get('/users', authenticateToken, async (req: any, res: any) => {
    console.log('🔍 [API] GET /users - Request received');
    console.log('🔍 [API] GET /users - User info:', {
        userId: req.user?.userId,
        email: req.user?.email,
        isAdmin: req.user?.isAdmin
    });
    try {
        // Only admins and above can access Google API data
        if (req.user.role === 'user') {
            console.log('❌ [API] GET /users - Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        console.log('✅ [API] GET /users - Admin access confirmed, running script');
        const scriptPath = path.resolve(process.cwd(), './athena/scripts/get_users.py');
        const result = await runPythonScript(scriptPath);

        console.log('✅ [API] GET /users - Script completed successfully');
        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error fetching Users:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch Users from Google API'
        });
    }
});

// Search for a student by ID
router.get('/users/search/:studentId', authenticateToken, async (req: any, res: any) => {
    try {
        const { studentId } = req.params;

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/search_student.py');
        const result = await runPythonScript(scriptPath, [studentId]);

        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error searching for student:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to search for student in Google API'
        });
    }
});

// Suspend a user
router.post('/users/:userKey/suspend', [
    param('userKey').isString().trim().isLength({ min: 1 }),
    body('reason').optional().isString(),
    authenticateToken,
    requireSuperAdmin
], async (req: any, res: any) => {
    console.log(`🔄 [Google API] POST /users/${req.params.userKey}/suspend - Request received`);
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [Google API] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { userKey } = req.params;
        const { reason } = req.body;

        console.log(`✅ [Google API] Admin access confirmed, suspending user: ${userKey}`);
        console.log(`📝 [Google API] Suspension reason: ${reason || 'No reason provided'}`);
        console.log(`👤 [Google API] Action performed by: ${req.user.email} (${req.user.userId})`);

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/suspend_user.py');
        const args = reason ? [userKey, reason] : [userKey];
        const result = await runPythonScript(scriptPath, args);

        if (result.success) {
            console.log(`✅ [Google API] User suspended successfully: ${userKey}`);
            console.log(`📝 [Google API] Database will be updated on next sync to reflect Google's current state`);
        } else {
            console.error(`❌ [Google API] User suspension failed: ${userKey} - ${result.error}`);
        }

        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error suspending user:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to suspend user in Google API'
        });
    }
});

// Unsuspend a user
router.post('/users/:userKey/unsuspend', [
    param('userKey').isString().trim().isLength({ min: 1 }),
    authenticateToken,
    requireSuperAdmin
], async (req: any, res: any) => {
    console.log(`🔄 [Google API] POST /users/${req.params.userKey}/unsuspend - Request received`);
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [Google API] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { userKey } = req.params;

        console.log(`✅ [Google API] Admin access confirmed, unsuspending user: ${userKey}`);
        console.log(`👤 [Google API] Action performed by: ${req.user.email} (${req.user.userId})`);

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/unsuspend_user.py');
        const result = await runPythonScript(scriptPath, [userKey]);

        if (result.success) {
            console.log(`✅ [Google API] User unsuspended successfully: ${userKey}`);
            console.log(`📝 [Google API] Database will be updated on next sync to reflect Google's current state`);
        } else {
            console.error(`❌ [Google API] User unsuspension failed: ${userKey} - ${result.error}`);
        }

        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error unsuspending user:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to unsuspend user in Google API'
        });
    }
});

// Move a user to a different organizational unit
router.post('/users/:userKey/move', [
    param('userKey').isString().trim().isLength({ min: 1 }),
    body('orgUnitPath').isString().trim().isLength({ min: 1 }),
    authenticateToken,
    requireSuperAdmin
], async (req: any, res: any) => {
    console.log(`🔄 [Google API] POST /users/${req.params.userKey}/move - Request received`);
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [Google API] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { userKey } = req.params;
        const { orgUnitPath } = req.body;

        console.log(`✅ [Google API] Admin access confirmed, moving user: ${userKey} to ${orgUnitPath}`);
        console.log(`👤 [Google API] Action performed by: ${req.user.email} (${req.user.userId})`);

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/move_user.py');
        const result = await runPythonScript(scriptPath, [userKey, orgUnitPath]);

        if (result.success) {
            console.log(`✅ [Google API] User moved successfully: ${userKey} to ${orgUnitPath}`);
        } else {
            console.error(`❌ [Google API] User move failed: ${userKey} - ${result.error}`);
        }

        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error moving user:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to move user in Google API'
        });
    }
});

// Update device notes in Google Admin Console
router.post('/devices/:assetId/notes', [
    param('assetId').isString().trim().isLength({ min: 1 }),
    body('notes').isString(),
    authenticateToken
], async (req: any, res: any) => {
    console.log(`🔄 [Google API] POST /devices/${req.params.assetId}/notes - Request received`);
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [Google API] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        // Only admins and above can update device notes
        if (req.user.role === 'user') {
            console.log('❌ [Google API] Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { assetId } = req.params;
        const { notes } = req.body;

        console.log(`✅ [Google API] Admin access confirmed, updating notes for asset: ${assetId}`);
        console.log(`📝 [Google API] Notes content: ${notes}`);

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/update_device_notes.py');
        const result = await runPythonScript(scriptPath, [assetId, notes]);

        if (result.success) {
            console.log(`✅ [Google API] Notes updated successfully for asset: ${assetId}`);
        } else {
            console.error(`❌ [Google API] Notes update failed for asset: ${assetId} - ${result.error}`);
        }

        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error updating device notes:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to update device notes in Google API'
        });
    }
});

// Move a device to a different organizational unit
router.post('/devices/move', [
    body('deviceId').isString().trim().isLength({ min: 1 }),
    body('targetOrgUnit').isString().trim().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    console.log(`🔄 [Google API] POST /devices/move - Request received`);
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [Google API] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        // Only admins and above can move devices
        if (req.user.role === 'user') {
            console.log('❌ [Google API] Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { deviceId, targetOrgUnit } = req.body;

        console.log(`✅ [Google API] Admin access confirmed, moving device: ${deviceId} to ${targetOrgUnit}`);
        console.log(`👤 [Google API] Action performed by: ${req.user.email} (${req.user.userId})`);

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/move_device.py');
        const result = await runPythonScript(scriptPath, [deviceId, targetOrgUnit]);

        if (result.success) {
            console.log(`✅ [Google API] Device moved successfully: ${deviceId} to ${targetOrgUnit}`);
        } else {
            console.error(`❌ [Google API] Device move failed: ${deviceId} - ${result.error}`);
        }

        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error moving device:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to move device in Google API'
        });
    }
});

// Reset devices using WIPE_USERS command
router.post('/devices/reset', [
    body('deviceIdentifiers').isArray().isLength({ min: 1 }),
    authenticateToken
], async (req: any, res: any) => {
    console.log(`🔄 [Google API] POST /devices/reset - Request received`);
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ [Google API] Validation errors:', errors.array());
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        // Only admins and above can reset devices
        if (req.user.role === 'user') {
            console.log('❌ [Google API] Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { deviceIdentifiers } = req.body;

        console.log(`✅ [Google API] Admin access confirmed, resetting ${deviceIdentifiers.length} devices`);
        console.log(`👤 [Google API] Action performed by: ${req.user.email} (${req.user.userId})`);

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/reset_devices.py');
        const result = await runPythonScript(scriptPath, deviceIdentifiers);

        if (result.success) {
            console.log(`✅ [Google API] Reset completed successfully`);
        } else {
            console.error(`❌ [Google API] Reset failed: ${result.error}`);
        }

        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error resetting devices:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to reset devices in Google API'
        });
    }
});

// Sync Chromebooks from Google to database
console.log('🔧 [DEBUG] Registering POST /sync/chromebooks route');
router.post('/sync/chromebooks', authenticateToken, async (req: any, res: any) => {
    console.log('🔄 [API] POST /sync/chromebooks - Request received');
    console.log('🔄 [API] POST /sync/chromebooks - Headers:', req.headers);
    console.log('🔄 [API] POST /sync/chromebooks - User:', req.user);
    try {
        console.log('✅ [API] POST /sync/chromebooks - Access confirmed, running sync script');
        const scriptPath = path.resolve(process.cwd(), './athena/scripts/sync_chromebooks.py');
        const result = await runPythonScript(scriptPath);

        console.log('✅ [API] POST /sync/chromebooks - Sync completed successfully');
        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error syncing Chromebooks:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to sync Chromebooks from Google API',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

// Sync Organizational Units from Google to database
console.log('🔧 [DEBUG] Registering POST /sync/org-units route');
router.post('/sync/org-units', authenticateToken, async (req: any, res: any) => {
    console.log('🔄 [API] POST /sync/org-units - Request received');
    try {
        // Only admins and above can sync data
        if (req.user.role === 'user') {
            console.log('❌ [API] POST /sync/org-units - Access denied: insufficient permissions');
            return res.status(403).json({ error: 'Admin access required' });
        }

        console.log('✅ [API] POST /sync/org-units - Admin access confirmed, running sync script');
        const scriptPath = path.resolve(process.cwd(), './athena/scripts/sync_org_units.py');
        const result = await runPythonScript(scriptPath);

        console.log('✅ [API] POST /sync/org-units - Sync completed successfully');
        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error syncing Organizational Units:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to sync Organizational Units from Google API',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

// Sync Users from Google to database
console.log('🔧 [DEBUG] Registering POST /sync/users route');
router.post('/sync/users', authenticateToken, async (req: any, res: any) => {
    console.log('🔄 [API] POST /sync/users - Request received');
    try {
        // Get max results from query params if provided
        const maxResults = req.query.maxResults || 500;
        console.log(`✅ [API] POST /sync/users - Access confirmed, running sync script with maxResults: ${maxResults}`);

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/sync_users.py');
        const result = await runPythonScript(scriptPath, [maxResults.toString()]);

        console.log('✅ [API] POST /sync/users - Sync completed successfully');
        res.json(result);
    } catch (error) {
        console.error('❌ [Google API] Error syncing Users:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to sync Users from Google API',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

// Debug endpoint to check Python environment and Google API credentials
router.get('/debug', authenticateToken, async (req: any, res: any) => {
    try {
        // Only admins and above can access debug info
        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const fs = require('fs');
        const { execSync } = require('child_process');

        // Collect debug information
        const debugInfo: any = {
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                cwd: process.cwd(),
                env: {
                    NODE_ENV: process.env.NODE_ENV,
                    VIRTUAL_ENV: process.env.VIRTUAL_ENV,
                    PYTHONPATH: process.env.PYTHONPATH
                }
            },
            pythonInfo: {},
            fileSystem: {
                athenaExists: fs.existsSync(path.resolve(process.cwd(), './athena')),
                scriptsExists: fs.existsSync(path.resolve(process.cwd(), './athena/scripts')),
                googleApiExists: fs.existsSync(path.resolve(process.cwd(), './athena/api/google_api')),
                keyJsonExists: fs.existsSync(path.resolve(process.cwd(), './athena/api/google_api/key.json')),
                authIniExists: fs.existsSync(path.resolve(process.cwd(), './athena/api/google_api/auth.ini')),
                configIniExists: fs.existsSync(path.resolve(process.cwd(), './athena/api/google_api/config.ini'))
            },
            scripts: {}
        };

        // Check Python version
        try {
            debugInfo.pythonInfo.version = execSync('python3 --version').toString().trim();
            debugInfo.pythonInfo.pipVersion = execSync('pip3 --version').toString().trim();

            // List installed packages
            debugInfo.pythonInfo.packages = execSync('pip3 list').toString().trim();

            // Check if required modules can be imported
            const importCheck = execSync('python3 -c "import sys; print(\\"Python path: \\" + str(sys.path)); try: import google.auth; print(\\"google.auth: OK\\"); import googleapiclient; print(\\"googleapiclient: OK\\"); import psycopg2; print(\\"psycopg2: OK\\"); except ImportError as e: print(f\\"Import error: {e}\\")"').toString().trim();
            debugInfo.pythonInfo.imports = importCheck;
        } catch (error: any) {
            debugInfo.pythonInfo.error = error.toString();
        }

        // List script files
        try {
            const scriptsDir = path.resolve(process.cwd(), './athena/scripts');
            if (fs.existsSync(scriptsDir)) {
                debugInfo.scripts.files = fs.readdirSync(scriptsDir);
            }
        } catch (error: any) {
            debugInfo.scripts.error = error.toString();
        }

        // Check if we can read the key.json file
        try {
            const keyJsonPath = path.resolve(process.cwd(), './athena/api/google_api/key.json');
            if (fs.existsSync(keyJsonPath)) {
                const keyJson = fs.readFileSync(keyJsonPath, 'utf8');
                const keyData = JSON.parse(keyJson);
                debugInfo.googleApi = {
                    keyJsonValid: true,
                    projectId: keyData.project_id,
                    clientEmail: keyData.client_email
                };
            } else {
                debugInfo.googleApi = { keyJsonValid: false, error: 'key.json file not found' };
            }
        } catch (error: any) {
            debugInfo.googleApi = { keyJsonValid: false, error: error.toString() };
        }

        res.json({
            status: 'success',
            message: 'Debug information collected',
            debugInfo
        });
    } catch (error) {
        console.error('❌ [Google API] Error collecting debug info:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to collect debug information'
        });
    }
});

// Run the Python debug script to test Google API connection
router.get('/debug/python', authenticateToken, async (req: any, res: any) => {
    try {
        // Only admins and above can access debug info
        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/debug_google_api.py');
        const result = await runPythonScript(scriptPath);

        res.json({
            status: 'success',
            message: 'Python debug script executed successfully',
            result
        });
    } catch (error) {
        console.error('❌ [Google API] Error running Python debug script:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to run Python debug script'
        });
    }
});

// Test Google API connection
router.get('/test-connection', authenticateToken, async (req: any, res: any) => {
    try {
        // Only admins and above can access test connection
        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/test_google_api_connection.py');
        const result = await runPythonScript(scriptPath);

        res.json({
            status: result.success ? 'success' : 'error',
            message: result.message,
            data: result.data
        });
    } catch (error) {
        console.error('❌ [Google API] Error testing Google API connection:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to test Google API connection'
        });
    }
});

// Test Database connection
router.get('/test-database', authenticateToken, async (req: any, res: any) => {
    try {
        // Only admins and above can access test connection
        if (req.user.role === 'user') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const scriptPath = path.resolve(process.cwd(), './athena/scripts/test_database_connection.py');
        const result = await runPythonScript(scriptPath);

        res.json({
            status: result.success ? 'success' : 'error',
            message: result.message,
            data: result.data
        });
    } catch (error) {
        console.error('❌ [Google API] Error testing database connection:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to test database connection'
        });
    }
});

export default router;

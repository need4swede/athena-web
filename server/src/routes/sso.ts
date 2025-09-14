import { Router, Request, Response } from 'express';
import { ssoConfigService } from '../services/sso-config.service';

const router = Router();

// Get SSO configuration with environment variables substituted
router.get('/config', async (req: Request, res: Response) => {
    try {
        const config = ssoConfigService.getConfig();
        res.json(config);
    } catch (error) {
        console.error('Error getting SSO config:', error);
        res.status(500).json({ error: 'Failed to load SSO configuration' });
    }
});

// Check if an email is allowed based on access control
router.post('/check-access', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        if (!email) {
            res.status(400).json({ error: 'Email is required' });
            return;
        }

        const isAllowed = ssoConfigService.checkAccessControl(email);
        res.json({ allowed: isAllowed });
    } catch (error) {
        console.error('Error checking access control:', error);
        res.status(500).json({ error: 'Failed to check access control' });
    }
});

// Get enabled providers only
router.get('/providers', async (req: Request, res: Response) => {
    try {
        const providers = ssoConfigService.getEnabledProviders();
        res.json(providers);
    } catch (error) {
        console.error('Error getting enabled providers:', error);
        res.status(500).json({ error: 'Failed to get providers' });
    }
});

export default router;

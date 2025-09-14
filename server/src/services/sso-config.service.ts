// SSO configuration service with environment variable substitution
// Based on AB2534's approach

import fs from 'fs';
import path from 'path';

interface SSOConfig {
    providers: Record<string, any>;
    branding: any;
    accessControl: any;
    features: any;
    security: any;
}

class SSOConfigService {
    private config: SSOConfig | null = null;
    private configPath: string;

    constructor() {
        // Look for sso-config.json in the public directory
        // In Docker, the public directory is mounted to /app/public
        this.configPath = path.join(process.cwd(), 'public', 'sso-config.json');
        console.log('🔧 SSO Config Service - Config path:', this.configPath);
        console.log('🔧 SSO Config Service - Working directory:', process.cwd());
    }

    /**
     * Load and parse the SSO configuration file
     */
    private loadConfig(): SSOConfig {
        try {
            console.log('🔧 Loading SSO config from:', this.configPath);
            const configContent = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configContent);
            console.log('🔧 Raw config loaded:', JSON.stringify(config, null, 2));

            const substitutedConfig = this.substituteEnvVars(config);
            console.log('🔧 Config after env substitution:', JSON.stringify(substitutedConfig, null, 2));

            return substitutedConfig;
        } catch (error) {
            console.error('Error loading SSO config:', error);
            throw new Error('Failed to load SSO configuration');
        }
    }

    /**
     * Recursively substitute environment variables in the configuration
     */
    private substituteEnvVars(obj: any): any {
        if (typeof obj === 'string') {
            return this.substituteStringEnvVars(obj);
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.substituteEnvVars(item));
        } else if (obj !== null && typeof obj === 'object') {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.substituteEnvVars(value);
            }
            return result;
        }
        return obj;
    }

    /**
     * Substitute environment variables in a string
     */
    private substituteStringEnvVars(text: string): string {
        const pattern = /\$\{([^}]+)\}/g;

        return text.replace(pattern, (match, varName) => {
            const envValue = process.env[varName];

            if (envValue === undefined) {
                console.warn(`Environment variable ${varName} not found`);
                return '';
            }

            return envValue;
        });
    }

    /**
     * Get the complete SSO configuration with env vars substituted
     */
    public getConfig(): SSOConfig {
        if (!this.config) {
            this.config = this.loadConfig();
        }
        return this.config;
    }

    /**
     * Reload the configuration from file
     */
    public reloadConfig(): void {
        this.config = null;
        this.getConfig();
    }

    /**
     * Parse comma-separated list from string
     */
    private parseCommaSeparatedList(value: string): string[] {
        if (!value || value.trim() === '') {
            return [];
        }

        return value
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0)
            .map(item => item.toLowerCase());
    }

    /**
     * Check if an email is allowed based on access control settings
     */
    public checkAccessControl(email: string): boolean {
        const config = this.getConfig();
        const accessControl = config.accessControl;

        if (!email || !email.includes('@')) {
            return false;
        }

        email = email.toLowerCase().trim();
        const domain = email.split('@')[1];

        // Get allowed domains and emails
        const allowedDomains = typeof accessControl.allowedDomains === 'string'
            ? this.parseCommaSeparatedList(accessControl.allowedDomains)
            : accessControl.allowedDomains || [];

        const allowedEmails = typeof accessControl.allowedEmails === 'string'
            ? this.parseCommaSeparatedList(accessControl.allowedEmails)
            : accessControl.allowedEmails || [];

        // Priority 1: If specific emails are configured, only those are allowed
        if (allowedEmails.length > 0) {
            return allowedEmails.includes(email);
        }

        // Priority 2: If no specific emails but domains are configured, check domain
        if (allowedDomains.length > 0) {
            return allowedDomains.includes(domain);
        }

        // Priority 3: If neither are configured, allow all
        return true;
    }

    /**
     * Validate provider credentials
     */
    public validateProviderCredentials(providerName: string): boolean {
        const config = this.getConfig();
        const provider = config.providers[providerName];

        if (!provider || !provider.enabled) {
            return true; // Disabled providers don't need validation
        }

        const clientId = provider.clientId || '';
        const clientSecret = provider.clientSecret || '';

        // Check if they're empty or still contain placeholders
        if (!clientId || clientId.includes('${') || clientId.includes('your_')) {
            return false;
        }

        if (!clientSecret || clientSecret.includes('${') || clientSecret.includes('your_')) {
            return false;
        }

        return true;
    }

    /**
     * Get enabled providers
     */
    public getEnabledProviders(): Record<string, any> {
        const config = this.getConfig();
        const enabledProviders: Record<string, any> = {};

        for (const [name, provider] of Object.entries(config.providers)) {
            if ((provider as any).enabled && this.validateProviderCredentials(name)) {
                enabledProviders[name] = provider;
            }
        }

        return enabledProviders;
    }
}

// Export singleton instance
export const ssoConfigService = new SSOConfigService();

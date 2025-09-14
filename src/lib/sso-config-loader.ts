// SSO configuration loader with environment variable substitution
// Based on AB2534's approach

export interface SSOConfigEnvVars {
    SSO_GOOGLE_CLIENT_ID?: string;
    SSO_GOOGLE_CLIENT_SECRET?: string;
    SSO_GITHUB_CLIENT_ID?: string;
    SSO_GITHUB_CLIENT_SECRET?: string;
    SSO_MICROSOFT_CLIENT_ID?: string;
    SSO_MICROSOFT_CLIENT_SECRET?: string;
    SSO_MICROSOFT_TENANT_ID?: string;
    SSO_LINKEDIN_CLIENT_ID?: string;
    SSO_LINKEDIN_CLIENT_SECRET?: string;
    SSO_TWITTER_CLIENT_ID?: string;
    SSO_TWITTER_CLIENT_SECRET?: string;
    SSO_ALLOWED_DOMAINS?: string;
    SSO_ALLOWED_EMAILS?: string;
}

/**
 * Recursively substitute environment variables in the configuration.
 * Supports placeholders in the format: ${ENV_VAR_NAME}
 */
export function substituteEnvVars(obj: any, envVars: Record<string, string | undefined>): any {
    if (typeof obj === 'string') {
        return substituteStringEnvVars(obj, envVars);
    } else if (Array.isArray(obj)) {
        return obj.map(item => substituteEnvVars(item, envVars));
    } else if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = substituteEnvVars(value, envVars);
        }
        return result;
    }
    return obj;
}

/**
 * Substitute environment variables in a string.
 * Pattern to match ${VAR_NAME}
 */
function substituteStringEnvVars(text: string, envVars: Record<string, string | undefined>): string {
    const pattern = /\$\{([^}]+)\}/g;

    return text.replace(pattern, (match, varName) => {
        const envValue = envVars[varName];

        if (envValue === undefined) {
            // For missing environment variables, return empty string for frontend
            // This allows the app to function with missing optional configs
            console.warn(`Environment variable ${varName} not found, using empty string`);
            return '';
        }

        return envValue;
    });
}

/**
 * Parse comma-separated list from environment variable
 */
export function parseCommaSeparatedList(value: string | undefined): string[] {
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
export function checkAccessControl(
    email: string,
    allowedDomains: string[],
    allowedEmails: string[]
): boolean {
    if (!email || !email.includes('@')) {
        return false;
    }

    email = email.toLowerCase().trim();
    const domain = email.split('@')[1];

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
 * Validate provider credentials to ensure they're not placeholders or empty
 */
export function validateProviderCredentials(provider: any): boolean {
    if (!provider || !provider.enabled) {
        return true; // Disabled providers don't need validation
    }

    const clientId = provider.clientId || '';
    const clientSecret = provider.clientSecret || '';

    // Check if they're empty or still contain placeholders
    if (!clientId || clientId.includes('${') || clientId === 'mock_' || clientId.includes('your_')) {
        return false;
    }

    if (!clientSecret || clientSecret.includes('${') || clientSecret === 'mock_' || clientSecret.includes('your_')) {
        return false;
    }

    return true;
}

/**
 * Get validation errors for the current configuration
 */
export function getConfigValidationErrors(config: any): string[] {
    const errors: string[] = [];

    if (!config.providers) {
        errors.push('No providers configured');
        return errors;
    }

    for (const [providerName, providerConfig] of Object.entries(config.providers)) {
        if ((providerConfig as any).enabled && !validateProviderCredentials(providerConfig)) {
            errors.push(
                `Provider '${providerName}' is enabled but missing valid credentials. ` +
                `Please set SSO_${providerName.toUpperCase()}_CLIENT_ID and SSO_${providerName.toUpperCase()}_CLIENT_SECRET.`
            );
        }
    }

    return errors;
}

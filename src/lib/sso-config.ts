import { parseCommaSeparatedList, checkAccessControl as checkAccessControlUtil } from './sso-config-loader';

export interface SSOProviderConfig {
    enabled: boolean;
    displayName: string;
    buttonText?: string;
    logo?: {
        enabled?: boolean;
        iconName?: string;
        customUrl?: string;
        centerText?: boolean;
    };
}

export interface SSOConfig {
    providers: Record<string, SSOProviderConfig>;
    branding: {
        companyName: string;
        logoUrl?: string;
        primaryColor: string;
        loginTitle: string;
        loginSubtitle: string;
        customCss?: string;
        footer?: string;
    };
    accessControl: {
        domainMode: string;
        emailMode: string;
        allowedDomains: string[];
        blockedDomains?: string[];
        allowedEmails: string[];
        blockedEmails?: string[];
        requireEmailVerification?: boolean;
    };
    features?: {
        enableEmailLogin?: boolean;
        enableRememberMe?: boolean;
        sessionTimeout?: number;
        allowSelfRegistration?: boolean;
    };
    security?: {
        requireHttps?: boolean;
        enableRateLimit?: boolean;
        maxLoginAttempts?: number;
        lockoutDuration?: number;
    };
}

const fallbackConfig: SSOConfig = {
    providers: {
        tinyauth: {
            enabled: true,
            displayName: 'TinyAuth',
            logo: {
                enabled: true,
                iconName: 'ShieldCheck',
            },
        },
    },
    branding: {
        companyName: 'Athena',
        primaryColor: '#2563eb',
        loginTitle: 'Welcome back',
        loginSubtitle: 'Sign in to your account',
        customCss: '',
    },
    accessControl: {
        domainMode: 'allow-all',
        emailMode: 'allow-all',
        allowedDomains: [],
        allowedEmails: [],
    },
};

export async function fetchSSOConfig(): Promise<SSOConfig> {
    try {
        try {
            const response = await fetch('/api/sso/config');
            if (response.ok) {
                const config = await response.json();
                if (typeof config.accessControl?.allowedDomains === 'string') {
                    config.accessControl.allowedDomains = parseCommaSeparatedList(config.accessControl.allowedDomains);
                }
                if (typeof config.accessControl?.allowedEmails === 'string') {
                    config.accessControl.allowedEmails = parseCommaSeparatedList(config.accessControl.allowedEmails);
                }
                return config as SSOConfig;
            }
        } catch (error) {
            console.warn('Failed to load SSO config from API, using static fallback.', error);
        }

        const response = await fetch('/sso-config.json');
        if (!response.ok) {
            throw new Error('Failed to load static SSO configuration');
        }

        const config = await response.json();
        if (typeof config.accessControl?.allowedDomains === 'string') {
            config.accessControl.allowedDomains = [];
        }
        if (typeof config.accessControl?.allowedEmails === 'string') {
            config.accessControl.allowedEmails = [];
        }
        return config as SSOConfig;
    } catch (error) {
        console.error('Unable to load SSO configuration, using fallback.', error);
        return fallbackConfig;
    }
}

export async function checkAccessControl(email: string): Promise<boolean> {
    const config = await fetchSSOConfig();
    return checkAccessControlUtil(email, config.accessControl.allowedDomains || [], config.accessControl.allowedEmails || []);
}

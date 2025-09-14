// SSO configuration service with real authentication
import {
    createOrUpdateUserFromSSO,
    getUserByEmailFromDB,
    formatUserForFrontend,
    generateUserToken,
    parseUserToken,
    UserData
} from './user-service';
import {
    substituteEnvVars,
    parseCommaSeparatedList,
    checkAccessControl as checkAccessControlUtil,
    validateProviderCredentials,
    getConfigValidationErrors
} from './sso-config-loader';

export interface SSOConfig {
    providers: Record<string, {
        enabled: boolean;
        displayName: string;
        clientId: string;
        clientSecret: string;
        tenantId?: string;
    }>;
    branding: {
        companyName: string;
        logoUrl: string;
        primaryColor: string;
        loginTitle: string;
        loginSubtitle: string;
        customCss: string;
    };
    accessControl: {
        domainMode: string;
        emailMode: string;
        allowedDomains: string[];
        blockedDomains: string[];
        allowedEmails: string[];
        blockedEmails: string[];
        requireEmailVerification: boolean;
    };
    features: {
        enableEmailLogin: boolean;
        enableRememberMe: boolean;
        sessionTimeout: number;
        allowSelfRegistration: boolean;
    };
    security: {
        requireHttps: boolean;
        enableRateLimit: boolean;
        maxLoginAttempts: number;
        lockoutDuration: number;
    };
}

// Default configuration fallback
export const defaultSSOConfig: SSOConfig = {
    providers: {
        google: {
            enabled: false,
            displayName: "Google",
            clientId: "",
            clientSecret: ""
        },
        github: {
            enabled: false,
            displayName: "GitHub",
            clientId: "",
            clientSecret: ""
        },
        microsoft: {
            enabled: false,
            displayName: "Microsoft",
            clientId: "",
            clientSecret: ""
        },
        linkedin: {
            enabled: false,
            displayName: "LinkedIn",
            clientId: "",
            clientSecret: ""
        },
        twitter: {
            enabled: false,
            displayName: "Twitter",
            clientId: "",
            clientSecret: ""
        }
    },
    branding: {
        companyName: "Chromebook Library",
        logoUrl: "",
        primaryColor: "#2563eb",
        loginTitle: "Welcome back",
        loginSubtitle: "Sign in to your Chromebook Library account",
        customCss: ""
    },
    accessControl: {
        domainMode: "allow-all",
        emailMode: "allow-all",
        allowedDomains: [],
        blockedDomains: [],
        allowedEmails: [],
        blockedEmails: [],
        requireEmailVerification: true
    },
    features: {
        enableEmailLogin: true,
        enableRememberMe: true,
        sessionTimeout: 604800,
        allowSelfRegistration: true
    },
    security: {
        requireHttps: false,
        enableRateLimit: true,
        maxLoginAttempts: 5,
        lockoutDuration: 900
    }
};

// Load SSO configuration
export async function fetchSSOConfig(): Promise<SSOConfig> {
    try {
        // First try to get config from backend API (which handles env substitution)
        try {
            const response = await fetch('/api/sso/config');
            if (response.ok) {
                const config = await response.json();
                // Process allowed domains and emails from comma-separated strings
                if (typeof config.accessControl.allowedDomains === 'string') {
                    config.accessControl.allowedDomains = parseCommaSeparatedList(config.accessControl.allowedDomains);
                }
                if (typeof config.accessControl.allowedEmails === 'string') {
                    config.accessControl.allowedEmails = parseCommaSeparatedList(config.accessControl.allowedEmails);
                }
                return config as SSOConfig;
            }
        } catch (apiError) {
            console.warn('Failed to load SSO config from API, trying static file:', apiError);
        }

        // Fallback to static file (for development without backend)
        const response = await fetch('/sso-config.json');
        if (!response.ok) {
            throw new Error('Failed to load SSO configuration');
        }
        const config = await response.json();

        // In development, we can't substitute env vars on the frontend
        // So we'll just return the config as-is with placeholder values
        console.warn('Using static SSO config - environment variables not substituted');

        // Convert string placeholders to empty arrays for access control
        if (typeof config.accessControl.allowedDomains === 'string') {
            config.accessControl.allowedDomains = [];
        }
        if (typeof config.accessControl.allowedEmails === 'string') {
            config.accessControl.allowedEmails = [];
        }

        return config as SSOConfig;
    } catch (error) {
        console.error('Failed to load SSO config, using fallback:', error);
        // Fallback to default config if file loading fails
        return defaultSSOConfig;
    }
}

// Check if an email is allowed based on SSO configuration
export async function checkAccessControl(email: string): Promise<boolean> {
    const config = await fetchSSOConfig();
    const allowedDomains = config.accessControl.allowedDomains || [];
    const allowedEmails = config.accessControl.allowedEmails || [];

    return checkAccessControlUtil(email, allowedDomains, allowedEmails);
}

// Real login function that creates/updates users in the database
export async function authenticateUser(provider: string, authData: any) {
    console.log('🚀 [authenticateUser] Starting authentication process');
    console.log('🚀 [authenticateUser] Provider:', provider);
    console.log('🚀 [authenticateUser] Auth data:', JSON.stringify(authData, null, 2));

    try {
        let userData: UserData;

        // Handle Microsoft OAuth specifically
        if (provider === 'microsoft' && authData.code) {
            console.log('🔐 [authenticateUser] Processing Microsoft OAuth login with code:', authData.code);

            // Use the real user data that's already available in authData
            if (authData.email && authData.name) {
                console.log('✅ [authenticateUser] Using real Microsoft user data from authData');
                userData = {
                    email: authData.email,
                    name: authData.name,
                    avatar: authData.avatar || null,
                    provider: 'microsoft'
                };
                console.log('✅ [authenticateUser] Real Microsoft user data:', userData);
            } else {
                throw new Error('Missing user data from Microsoft OAuth response');
            }
        } else {
            console.log('🔐 [authenticateUser] Processing direct auth data');

            // Handle other providers or direct auth data
            userData = {
                email: authData.email || `user@${provider}.com`,
                name: authData.name || `User from ${provider}`,
                avatar: authData.avatar || null,
                provider: provider
            };
            console.log('🔐 [authenticateUser] Using direct auth data:', userData);
        }

        console.log('💾 [authenticateUser] Final user data for database:', userData);
        console.log('💾 [authenticateUser] Attempting to create/update user in database...');

        // Create or update user in database
        let dbUser;
        try {
            dbUser = await createOrUpdateUserFromSSO(userData);
            console.log('✅ [authenticateUser] Database user created/updated:', dbUser);
        } catch (userServiceError) {
            console.warn('⚠️ [authenticateUser] User service failed, trying direct database creation:', userServiceError);

            // Import database functions directly as fallback
            const { createOrUpdateUser } = await import('./database');
            const directDbUser = await createOrUpdateUser(userData.email, userData.name);

            // Convert to user-service format
            dbUser = {
                id: directDbUser.id,
                email: directDbUser.email,
                name: directDbUser.name,
                is_admin: directDbUser.role === 'admin' || directDbUser.role === 'super_admin',
                created_at: new Date(directDbUser.created_at),
                updated_at: new Date(directDbUser.updated_at)
            };
            console.log('✅ [authenticateUser] Direct database user creation successful:', dbUser);
        }

        // Generate token for the user
        const token = generateUserToken(dbUser);
        console.log('🎫 [authenticateUser] Token generated:', token);

        // Format user for frontend
        const frontendUser = formatUserForFrontend(dbUser, provider, userData.avatar);
        console.log('🎨 [authenticateUser] Frontend user formatted:', frontendUser);

        const result = {
            token: token,
            user: frontendUser
        };
        console.log('🎉 [authenticateUser] Authentication successful, returning:', result);
        return result;

    } catch (error) {
        console.error('❌ [authenticateUser] Authentication error occurred:', error);
        console.error('❌ [authenticateUser] Error stack:', error.stack);
        throw error;
    }
}

// Real get current user function that validates tokens and fetches from database
export async function getCurrentUser(token: string) {
    console.log('👤 [getCurrentUser] Getting current user for token:', token);

    try {
        // Parse the token to get user ID
        const tokenData = parseUserToken(token);
        console.log('🎫 [getCurrentUser] Parsed token data:', tokenData);

        if (!tokenData) {
            throw new Error('Invalid token format');
        }

        console.log('💾 [getCurrentUser] Getting user by ID:', tokenData.userId);

        // Get user from database by ID using the getUserById function
        const dbUser = await import('./database').then(db =>
            db.getUserById(tokenData.userId)
        );

        console.log('💾 [getCurrentUser] Database user result:', dbUser);

        if (!dbUser) {
            throw new Error('User not found in database');
        }

        // Format user for frontend
        const frontendUser = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            avatar: null, // We don't store avatars in DB yet
            provider: "microsoft", // We don't store provider in current schema
            isAdmin: dbUser.role === 'admin' || dbUser.role === 'super_admin',
            lastLogin: new Date()
        };
        console.log('🎨 [getCurrentUser] Formatted frontend user:', frontendUser);
        return frontendUser;

    } catch (error) {
        console.error('❌ [getCurrentUser] Get current user error:', error);
        throw error;
    }
}

// Legacy function names for backward compatibility
export const mockLogin = authenticateUser;
export const mockGetCurrentUser = getCurrentUser;

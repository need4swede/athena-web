import { z } from "zod";

// User types
export interface User {
    id: string | number;
    name: string;
    email: string;
    avatar?: string;
    avatarUrl?: string;
    provider: string;
    providerId?: string;
    role?: 'super_admin' | 'admin' | 'user';
    isAdmin: boolean;
    isSuperAdmin?: boolean;
    lastLogin: Date;
    organizationId?: string;
    microsoftId?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export type UserRole = 'super_admin' | 'admin' | 'user';

// SSO Configuration type for frontend
export const ssoConfigSchema = z.object({
    providers: z.record(z.object({
        enabled: z.boolean(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        tenantId: z.string().optional(),
        displayName: z.string(),
        buttonText: z.string().optional(),
        logo: z.object({
            enabled: z.boolean().default(true),
            iconName: z.string().optional(), // lucide icon name or 'custom'
            customUrl: z.string().optional(), // URL for custom logo
            centerText: z.boolean().default(false), // center text when no logo
        }).optional(),
    })),
    accessControl: z.object({
        domainMode: z.enum(["allow-all", "whitelist", "blacklist"]),
        emailMode: z.enum(["allow-all", "whitelist", "blacklist"]),
        allowedDomains: z.array(z.string()).optional(),
        blockedDomains: z.array(z.string()).optional(),
        allowedEmails: z.array(z.string()).optional(),
        blockedEmails: z.array(z.string()).optional(),
        requireEmailVerification: z.boolean().optional(),
    }),
    branding: z.object({
        companyName: z.string(),
        logoUrl: z.string().optional(),
        primaryColor: z.string(),
        loginTitle: z.string(),
        loginSubtitle: z.string(),
        customCss: z.string().optional(),
        footer: z.string().optional(),
    }),
    features: z.object({
        enableEmailLogin: z.boolean().default(true),
        enableRememberMe: z.boolean().default(true),
        sessionTimeout: z.number().default(604800),
        allowSelfRegistration: z.boolean().default(true),
    }).optional(),
    security: z.object({
        requireHttps: z.boolean().default(false),
        enableRateLimit: z.boolean().default(true),
        maxLoginAttempts: z.number().default(5),
        lockoutDuration: z.number().default(900),
    }).optional(),
});

export type SSOConfig = z.infer<typeof ssoConfigSchema>;

// Microsoft OAuth specific types
export interface MicrosoftTokenResponse {
    access_token: string;
    id_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
}

export interface MicrosoftUserInfo {
    id: string;
    displayName: string;
    mail: string;
    userPrincipalName: string;
    givenName?: string;
    surname?: string;
    jobTitle?: string;
    mobilePhone?: string;
    businessPhones?: string[];
}

// OAuth callback data interface
export interface OAuthCallbackData {
    code?: string;
    state?: string;
    email?: string;
    name?: string;
    avatar?: string;
    providerId?: string;
    accessToken?: string;
}

// Organization type
export interface Organization {
    id: string;
    name: string;
    domain: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    createdAt: Date;
    updatedAt: Date;
}

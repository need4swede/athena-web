import { z } from "zod";

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface User {
    id: string | number;
    name: string;
    email: string;
    avatar?: string | null;
    provider?: string | null;
    role: UserRole;
    isAdmin: boolean;
    isSuperAdmin?: boolean;
    lastLogin?: string | Date | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export const providerLogoSchema = z.object({
    enabled: z.boolean().optional(),
    iconName: z.string().optional(),
    customUrl: z.string().optional(),
    centerText: z.boolean().optional(),
}).optional();

export const providerConfigSchema = z.object({
    enabled: z.boolean(),
    displayName: z.string(),
    buttonText: z.string().optional(),
    logo: providerLogoSchema,
});

export const ssoConfigSchema = z.object({
    providers: z.record(providerConfigSchema),
    branding: z.object({
        companyName: z.string(),
        logoUrl: z.string().optional(),
        primaryColor: z.string(),
        loginTitle: z.string(),
        loginSubtitle: z.string(),
        customCss: z.string().optional(),
        footer: z.string().optional(),
    }),
    accessControl: z.object({
        domainMode: z.string(),
        emailMode: z.string(),
        allowedDomains: z.array(z.string()).optional(),
        blockedDomains: z.array(z.string()).optional(),
        allowedEmails: z.array(z.string()).optional(),
        blockedEmails: z.array(z.string()).optional(),
        requireEmailVerification: z.boolean().optional(),
    }),
    features: z.object({
        enableEmailLogin: z.boolean().optional(),
        enableRememberMe: z.boolean().optional(),
        sessionTimeout: z.number().optional(),
        allowSelfRegistration: z.boolean().optional(),
    }).optional(),
    security: z.object({
        requireHttps: z.boolean().optional(),
        enableRateLimit: z.boolean().optional(),
        maxLoginAttempts: z.number().optional(),
        lockoutDuration: z.number().optional(),
    }).optional(),
});

export type SSOConfig = z.infer<typeof ssoConfigSchema>;

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

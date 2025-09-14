import { Github, Mail, Linkedin, Twitter, Chrome, Building2 } from "lucide-react";
import * as LucideIcons from "lucide-react";

// Define provider configurations
export const oauthProviders = {
    google: {
        name: "google",
        displayName: "Google",
        icon: Chrome, // Using Chrome icon as it's Google's browser
        color: "text-red-500"
    },
    github: {
        name: "github",
        displayName: "GitHub",
        icon: Github,
        color: "text-gray-900"
    },
    microsoft: {
        name: "microsoft",
        displayName: "Microsoft",
        icon: Building2, // Using Building2 icon for Microsoft (corporate)
        color: "text-blue-600"
    },
    linkedin: {
        name: "linkedin",
        displayName: "LinkedIn",
        icon: Linkedin,
        color: "text-blue-700"
    },
    twitter: {
        name: "twitter",
        displayName: "Twitter",
        icon: Twitter,
        color: "text-blue-400"
    }
};

export function getProviderIcon(provider: string, customIconName?: string) {
    // If a custom icon name is provided, try to get it from Lucide icons
    if (customIconName && customIconName !== 'custom') {
        const IconComponent = (LucideIcons as any)[customIconName];
        if (IconComponent) {
            return IconComponent;
        }
    }

    // Fall back to default provider icon
    return oauthProviders[provider as keyof typeof oauthProviders]?.icon || Mail;
}

export function getProviderColor(provider: string) {
    return oauthProviders[provider as keyof typeof oauthProviders]?.color || "text-gray-500";
}

export function getProviderDisplayName(provider: string) {
    return oauthProviders[provider as keyof typeof oauthProviders]?.displayName || provider;
}

// Real OAuth utility functions for different providers

export interface OAuthConfig {
    clientId: string;
    redirectUri: string;
    scope: string;
    responseType: string;
    tenantId?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
}

// PKCE utility functions
export function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export function getOAuthUrl(provider: string, config: OAuthConfig): string {
    const baseUrls: Record<string, string> = {
        google: 'https://accounts.google.com/o/oauth2/v2/auth',
        github: 'https://github.com/login/oauth/authorize',
        microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
        twitter: 'https://twitter.com/i/oauth2/authorize'
    };

    const scopes: Record<string, string> = {
        google: 'openid email profile',
        github: 'user:email',
        microsoft: 'openid email profile',
        linkedin: 'r_liteprofile r_emailaddress',
        twitter: 'tweet.read users.read'
    };

    let baseUrl = baseUrls[provider];

    // Handle tenant-specific Microsoft endpoints
    if (provider === 'microsoft' && config.tenantId) {
        baseUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`;
    }

    if (!baseUrl) {
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scope || scopes[provider],
        response_type: config.responseType || 'code',
        state: generateState(provider)
    });

    // Provider-specific parameters
    if (provider === 'google') {
        params.append('access_type', 'offline');
        params.append('prompt', 'consent');
    }

    if (provider === 'microsoft') {
        params.append('prompt', 'select_account');
        // Add PKCE parameters for Microsoft (required for SPA)
        if (config.codeChallenge) {
            params.append('code_challenge', config.codeChallenge);
            params.append('code_challenge_method', config.codeChallengeMethod || 'S256');
        }
    }

    return `${baseUrl}?${params.toString()}`;
}

export function generateState(provider: string): string {
    const state = {
        provider,
        timestamp: Date.now(),
        random: Math.random().toString(36).substring(2)
    };
    return btoa(JSON.stringify(state));
}

export function parseState(state: string): { provider: string; timestamp: number; random: string } | null {
    try {
        return JSON.parse(atob(state));
    } catch {
        return null;
    }
}

export async function exchangeCodeForToken(provider: string, code: string, clientId: string, clientSecret: string, redirectUri: string, tenantId?: string, codeVerifier?: string) {
    const tokenUrls: Record<string, string> = {
        google: 'https://oauth2.googleapis.com/token',
        github: 'https://github.com/login/oauth/access_token',
        microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
        twitter: 'https://api.twitter.com/2/oauth2/token'
    };

    let tokenUrl = tokenUrls[provider];

    // Handle tenant-specific Microsoft endpoints
    if (provider === 'microsoft' && tenantId) {
        tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    }

    if (!tokenUrl) {
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri
    });

    // For Microsoft SPA (PKCE flow), use code_verifier instead of client_secret
    if (provider === 'microsoft' && codeVerifier) {
        body.append('code_verifier', codeVerifier);
    } else if (clientSecret) {
        // For confidential clients, use client_secret
        body.append('client_secret', clientSecret);
    }

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: body.toString()
    });

    if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return await response.json();
}

export async function getUserInfo(provider: string, accessToken: string) {
    const userInfoUrls: Record<string, string> = {
        google: 'https://www.googleapis.com/oauth2/v2/userinfo',
        github: 'https://api.github.com/user',
        microsoft: 'https://graph.microsoft.com/v1.0/me',
        linkedin: 'https://api.linkedin.com/v2/people/~:(id,firstName,lastName,emailAddress,profilePicture(displayImage~:playableStreams))',
        twitter: 'https://api.twitter.com/2/users/me?user.fields=profile_image_url'
    };

    const userInfoUrl = userInfoUrls[provider];
    if (!userInfoUrl) {
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const response = await fetch(userInfoUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const userData = await response.json();

    // Normalize user data across providers
    return normalizeUserData(provider, userData);
}

function normalizeUserData(provider: string, userData: any) {
    switch (provider) {
        case 'google':
            return {
                id: userData.id,
                email: userData.email,
                name: userData.name,
                avatar: userData.picture,
                provider: 'google'
            };

        case 'github':
            return {
                id: userData.id.toString(),
                email: userData.email,
                name: userData.name || userData.login,
                avatar: userData.avatar_url,
                provider: 'github'
            };

        case 'microsoft':
            return {
                id: userData.id,
                email: userData.mail || userData.userPrincipalName,
                name: userData.displayName,
                avatar: null, // Microsoft Graph doesn't provide avatar in basic profile
                provider: 'microsoft'
            };

        case 'linkedin':
            const firstName = userData.firstName?.localized?.en_US || '';
            const lastName = userData.lastName?.localized?.en_US || '';
            return {
                id: userData.id,
                email: userData.emailAddress,
                name: `${firstName} ${lastName}`.trim(),
                avatar: userData.profilePicture?.displayImage?.elements?.[0]?.identifiers?.[0]?.identifier,
                provider: 'linkedin'
            };

        case 'twitter':
            return {
                id: userData.data.id,
                email: null, // Twitter doesn't provide email in basic scope
                name: userData.data.name,
                avatar: userData.data.profile_image_url,
                provider: 'twitter'
            };

        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}

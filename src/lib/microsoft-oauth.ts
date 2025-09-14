import type { MicrosoftTokenResponse, MicrosoftUserInfo, OAuthCallbackData } from "@/types/sso";

// Microsoft OAuth configuration
interface MicrosoftOAuthConfig {
    clientId: string;
    tenantId: string;
    redirectUri: string;
    scopes: string[];
}

export class MicrosoftOAuthService {
    private config: MicrosoftOAuthConfig;

    constructor(config: MicrosoftOAuthConfig) {
        this.config = config;
    }

    /**
     * Generate a random code verifier for PKCE
     */
    private generateCodeVerifier(): string {
        const array = new Uint8Array(64);
        window.crypto.getRandomValues(array);
        return btoa(String.fromCharCode.apply(null, Array.from(array)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
            .substring(0, 64);
    }

    /**
     * Generate a code challenge from the verifier using SHA256
     */
    private async generateCodeChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Get the Microsoft OAuth authority URL
     */
    private getAuthority(): string {
        return `https://login.microsoftonline.com/${this.config.tenantId}`;
    }

    /**
     * Start the OAuth login flow by redirecting to Microsoft
     */
    async startLogin(): Promise<void> {
        // Generate PKCE parameters
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);

        // Generate state parameter for CSRF protection
        const state = Math.random().toString(36).substring(2, 15);

        // Store PKCE verifier and state in localStorage
        localStorage.setItem('pkce_code_verifier', codeVerifier);
        localStorage.setItem('oauth_state', state);

        // Build authorization URL
        const authUrl = new URL(`${this.getAuthority()}/oauth2/v2.0/authorize`);
        authUrl.searchParams.set('client_id', this.config.clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
        authUrl.searchParams.set('response_mode', 'query');
        authUrl.searchParams.set('scope', this.config.scopes.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        console.log('Starting Microsoft OAuth login with config:', {
            clientId: this.config.clientId,
            tenantId: this.config.tenantId,
            redirectUri: this.config.redirectUri,
            scopes: this.config.scopes,
        });

        // Redirect to Microsoft OAuth
        window.location.href = authUrl.toString();
    }

    /**
     * Handle the OAuth callback and exchange code for tokens
     */
    async handleCallback(code: string, state: string): Promise<OAuthCallbackData> {
        // Verify state parameter
        const savedState = localStorage.getItem('oauth_state');
        if (state !== savedState) {
            throw new Error('Invalid state parameter - possible CSRF attack');
        }

        // Get code verifier
        const codeVerifier = localStorage.getItem('pkce_code_verifier');
        if (!codeVerifier) {
            throw new Error('Code verifier not found');
        }

        // Clean up stored values
        localStorage.removeItem('oauth_state');
        localStorage.removeItem('pkce_code_verifier');

        try {
            // Exchange code for tokens
            const tokens = await this.exchangeCodeForTokens(code, codeVerifier);

            // Get user info from Microsoft Graph
            const userInfo = await this.getUserInfo(tokens.access_token);

            return {
                code,
                state,
                email: userInfo.mail || userInfo.userPrincipalName,
                name: userInfo.displayName,
                avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(userInfo.mail || userInfo.userPrincipalName)}`,
                providerId: userInfo.id,
                accessToken: tokens.access_token,
            };
        } catch (error) {
            console.error('Error in Microsoft OAuth callback:', error);
            throw error;
        }
    }

    /**
     * Exchange authorization code for access tokens
     */
    private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<MicrosoftTokenResponse> {
        const tokenEndpoint = `${this.getAuthority()}/oauth2/v2.0/token`;

        const params = new URLSearchParams({
            client_id: this.config.clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.config.redirectUri,
            code_verifier: codeVerifier,
        });

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Token exchange failed: ${errorData.error_description || response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get user information from Microsoft Graph API
     */
    private async getUserInfo(accessToken: string): Promise<MicrosoftUserInfo> {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Graph API call failed: ${errorData.error?.message || response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Check if we're currently handling an OAuth callback
     */
    static isOAuthCallback(): { code: string; state: string } | null {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');

        if (code && state) {
            return { code, state };
        }

        return null;
    }

    /**
     * Create a Microsoft OAuth service instance from configuration
     */
    static fromConfig(config: {
        clientId: string;
        tenantId: string;
        redirectUri?: string;
        scopes?: string[];
    }): MicrosoftOAuthService {
        return new MicrosoftOAuthService({
            clientId: config.clientId,
            tenantId: config.tenantId,
            redirectUri: config.redirectUri || `${window.location.origin}`,
            scopes: config.scopes || ['openid', 'profile', 'email', 'User.Read'],
        });
    }
}

/**
 * Default Microsoft OAuth service instance
 */
export const createMicrosoftOAuthService = (config: {
    clientId: string;
    tenantId: string;
    redirectUri?: string;
}) => {
    return MicrosoftOAuthService.fromConfig(config);
};

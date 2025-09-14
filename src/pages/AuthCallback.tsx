import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/sso/SSOProvider';
import { exchangeCodeForToken, getUserInfo, parseState } from '../lib/oauth-utils';
import { Loader2 } from 'lucide-react';

export function AuthCallback() {
  const { login } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');

        if (error) {
          throw new Error(`OAuth error: ${error}`);
        }

        if (!code || !state) {
          throw new Error('Missing authorization code or state parameter');
        }

        // Parse the state to get the provider
        const stateData = parseState(state);
        if (!stateData) {
          throw new Error('Invalid state parameter');
        }

        const provider = stateData.provider;

        // Get the stored provider (as a backup)
        const storedProvider = localStorage.getItem('oauth_provider');
        if (storedProvider !== provider) {
          console.warn('Provider mismatch between state and localStorage');
        }

        console.log(`OAuth callback received for ${provider} with code: ${code}`);

        // For Microsoft OAuth, pass the authorization code to the login function
        // This will allow our SSO service to properly handle the OAuth flow
        if (provider === 'microsoft') {
          // Pass the code and any additional OAuth data to the login function
          const authData = {
            code: code,
            state: state,
            provider: provider
          };

          console.log('Processing Microsoft OAuth login with auth data:', authData);

          // Use the SSO login function with the OAuth code
          await login(provider, authData);
        } else {
          // For other providers, use the existing flow
          let userEmail = 'user@example.com';
          let userName = `${provider} User`;

          // Try to extract user info from URL fragments (some providers include this)
          const fragment = window.location.hash;
          if (fragment) {
            const fragmentParams = new URLSearchParams(fragment.substring(1));
            userEmail = fragmentParams.get('email') || userEmail;
            userName = fragmentParams.get('name') || userName;
          }

          // Create user data with real information when available
          const userData = {
            email: userEmail,
            name: userName,
            avatar: provider === 'github' ? 'https://github.com/github.png' :
                    provider === 'google' ? 'https://lh3.googleusercontent.com/a/default-user' : null,
            provider: provider
          };

          console.log('Processing login for user:', userData);

          // Use the SSO login function
          await login(provider, userData);
        }

        setStatus('success');

        // Clean up
        localStorage.removeItem('oauth_provider');
        localStorage.removeItem('pkce_code_verifier');

        // Redirect to main app after a short delay
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);

      } catch (err) {
        console.error('OAuth callback error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setStatus('error');
      }
    };

    handleCallback();
  }, [login]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-gray-600">Completing your login...</p>
          <p className="text-gray-500 text-sm">Creating your account...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-red-600 text-lg font-semibold">Login Failed</div>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="text-green-600 text-lg font-semibold">Login Successful!</div>
        <p className="text-gray-600">Redirecting you to the app...</p>
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MicrosoftOAuthService } from "@/lib/microsoft-oauth";
import { fetchSSOConfig } from "@/lib/sso-config";
import { verifyToken, logout as apiLogout, createOrUpdateUser } from "@/lib/database";
import type { User, SSOConfig, OAuthCallbackData } from "@/types/sso";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (provider: string, authData?: any) => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: 'super_admin' | 'admin' | 'user';
  loginError: string | null;
  clearLoginError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a SSOProvider");
  }
  return context;
}

interface SSOProviderProps {
  children: React.ReactNode;
  config?: Partial<SSOConfig>;
}

export function SSOProvider({ children, config: providedConfig }: SSOProviderProps) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("auth_token")
  );
  const [isHandlingCallback, setIsHandlingCallback] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Get SSO configuration
  const { data: ssoConfig } = useQuery({
    queryKey: ["sso-config"],
    queryFn: fetchSSOConfig,
  });

  // Get current user if token exists
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["current-user"],
    enabled: !!token && !isHandlingCallback,
    queryFn: async () => {
      if (!token) return null;
      try {
        const response = await verifyToken();
        return response.user;
      } catch (error) {
        console.error('Failed to verify token:', error);
        // Clear invalid token
        setToken(null);
        localStorage.removeItem("auth_token");
        return null;
      }
    },
  });

  // Handle OAuth callback on app load
  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check if we're handling an OAuth callback
      const callbackData = MicrosoftOAuthService.isOAuthCallback();
      if (!callbackData) return;

      setIsHandlingCallback(true);

      try {
        console.log('🔄 [SSOProvider] Handling OAuth callback:', callbackData);

        // Clear URL parameters immediately
        window.history.replaceState({}, document.title, window.location.pathname);

        // Get Microsoft OAuth configuration
        if (!ssoConfig?.providers?.microsoft?.enabled) {
          throw new Error("Microsoft OAuth is not enabled");
        }

        const msConfig = ssoConfig.providers.microsoft;
        if (!msConfig.clientId || !msConfig.tenantId) {
          throw new Error("Microsoft OAuth configuration is incomplete");
        }

        // Create Microsoft OAuth service
        const msOAuth = MicrosoftOAuthService.fromConfig({
          clientId: msConfig.clientId,
          tenantId: msConfig.tenantId,
        });

        // Handle the callback
        const authData = await msOAuth.handleCallback(callbackData.code, callbackData.state);
        console.log('✅ [SSOProvider] OAuth callback handled, auth data:', authData);

        // Create or update user via backend API
        const dbUser = await createOrUpdateUser(authData.email, authData.name);
        console.log('✅ [SSOProvider] User created/updated:', dbUser);

        // Set token from localStorage (it was set by createOrUpdateUser)
        const newToken = localStorage.getItem("auth_token");
        if (newToken) {
          setToken(newToken);
          queryClient.invalidateQueries({ queryKey: ["current-user"] });
        }

        // Show welcome toast
        localStorage.setItem('show_welcome_toast', JSON.stringify({
          show: true,
          userName: authData.name
        }));

      } catch (error) {
        console.error('❌ [SSOProvider] OAuth callback error:', error);
        // Check if it's an access control error
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.toLowerCase().includes('access') || errorMessage.toLowerCase().includes('not allowed') || errorMessage.toLowerCase().includes('unauthorized')) {
          setLoginError('You do not have access to this application.');
        } else {
          setLoginError(`Login failed: ${errorMessage}`);
        }
      } finally {
        setIsHandlingCallback(false);
      }
    };

    if (ssoConfig) {
      handleOAuthCallback();
    }
  }, [ssoConfig, queryClient]);

  const loginMutation = useMutation({
    mutationFn: async ({ provider, authData }: { provider: string; authData?: OAuthCallbackData }) => {
      console.log('🚀 [SSOProvider] Login mutation started:', { provider, authData });

      if (provider === 'microsoft' && ssoConfig?.providers?.microsoft?.enabled) {
        // Handle Microsoft OAuth
        if (!authData) {
          // Start OAuth flow
          const msConfig = ssoConfig.providers.microsoft;
          if (!msConfig.clientId || !msConfig.tenantId) {
            throw new Error("Microsoft OAuth configuration is incomplete");
          }

          console.log('🔐 [SSOProvider] Starting Microsoft OAuth flow with config:', {
            clientId: msConfig.clientId,
            tenantId: msConfig.tenantId
          });

          const msOAuth = MicrosoftOAuthService.fromConfig({
            clientId: msConfig.clientId,
            tenantId: msConfig.tenantId,
          });

          await msOAuth.startLogin();
          return; // This will redirect, so we won't reach the rest
        } else {
          // Complete OAuth flow via backend API
          console.log('🔐 [SSOProvider] Completing Microsoft OAuth with auth data:', authData);
          const dbUser = await createOrUpdateUser(authData.email, authData.name);
          return { user: dbUser, token: localStorage.getItem("auth_token") };
        }
      } else {
        throw new Error(`Provider ${provider} is not supported`);
      }
    },
    onSuccess: (data) => {
      console.log('✅ [SSOProvider] Login mutation successful:', data);
      if (data?.token) {
        setToken(data.token);
        queryClient.invalidateQueries({ queryKey: ["current-user"] });
      }
    },
    onError: (error) => {
      console.error('❌ [SSOProvider] Login mutation failed:', error);
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log('🚪 [SSOProvider] Logout mutation started');
      await apiLogout();
    },
    onSuccess: () => {
      console.log('✅ [SSOProvider] Logout successful');
      setToken(null);
      localStorage.removeItem("auth_token");
      localStorage.removeItem('show_welcome_toast');
      queryClient.clear();
    },
  });

  const login = async (provider: string, authData?: any) => {
    console.log('🔑 [SSOProvider] Login called:', { provider, authData });
    await loginMutation.mutateAsync({ provider, authData });
  };

  const logout = async () => {
    console.log('🚪 [SSOProvider] Logout called');
    await logoutMutation.mutateAsync();
  };

  // Show welcome toast if needed
  useEffect(() => {
    const welcomeToast = localStorage.getItem('show_welcome_toast');
    if (welcomeToast && user) {
      try {
        const toastData = JSON.parse(welcomeToast);
        if (toastData.show) {
          console.log(`🎉 Welcome, ${toastData.userName}! Your account has been created/updated.`);
          localStorage.removeItem('show_welcome_toast');
        }
      } catch (error) {
        console.error('Error parsing welcome toast data:', error);
        localStorage.removeItem('show_welcome_toast');
      }
    }
  }, [user]);

  const isAuthenticated = !!user && !!token;
  const role = user?.role || 'user';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || false;
  const isSuperAdmin = user?.role === 'super_admin' || false;

  const clearLoginError = () => setLoginError(null);

  const value: AuthContextType = {
    user: user || null,
    isLoading: userLoading || loginMutation.isPending || logoutMutation.isPending || isHandlingCallback,
    isAuthenticated,
    login,
    logout,
    token,
    isAdmin,
    isSuperAdmin,
    role,
    loginError,
    clearLoginError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

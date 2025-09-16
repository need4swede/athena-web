import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSSOConfig } from "@/lib/sso-config";
import { authenticateWithTinyAuth, verifyToken, logout as apiLogout } from "@/lib/database";
import type { User, SSOConfig } from "@/types/sso";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
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
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasAutoAttempted, setHasAutoAttempted] = useState(false);
  const queryClient = useQueryClient();

  // Get SSO configuration
  const { data: ssoConfig } = useQuery({
    queryKey: ["sso-config"],
    queryFn: fetchSSOConfig,
  });

  // Get current user if token exists
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["current-user"],
    enabled: !!token,
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

  const initializeSession = useCallback(async () => {
    console.log('🚀 [SSOProvider] Attempting TinyAuth session initialization');
    setLoginError(null);
    setIsInitializing(true);
    try {
      const response = await authenticateWithTinyAuth();
      const sessionToken = response.token;
      if (sessionToken) {
        setToken(sessionToken);
      }

      if (response.user?.name) {
        localStorage.setItem('show_welcome_toast', JSON.stringify({
          show: true,
          userName: response.user.name
        }));
      }

      console.log('✅ [SSOProvider] TinyAuth session established for:', response.user?.email);
    } catch (error) {
      console.error('❌ [SSOProvider] TinyAuth session failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.toLowerCase().includes('access') || errorMessage.toLowerCase().includes('unauthorized')) {
        setLoginError('You do not have access to this application.');
      } else if (errorMessage.toLowerCase().includes('header')) {
        setLoginError('Authentication headers were not provided. Ensure requests are routed through TinyAuth.');
      } else {
        setLoginError(`Login failed: ${errorMessage}`);
      }
      throw error;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    if (!token && !isInitializing && !hasAutoAttempted) {
      setHasAutoAttempted(true);
      initializeSession().catch(() => {
        // Error is captured in loginError state; avoid unhandled rejection noise
      });
    }
  }, [token, isInitializing, hasAutoAttempted, initializeSession]);

  const login = async () => {
    console.log('🔑 [SSOProvider] Manual TinyAuth login triggered');
    await initializeSession();
  };

  const logout = async () => {
    console.log('🚪 [SSOProvider] Logout called');
    try {
      await apiLogout();
    } finally {
      setToken(null);
      setLoginError(null);
      setHasAutoAttempted(false);
      localStorage.removeItem("auth_token");
      localStorage.removeItem('show_welcome_toast');
      queryClient.clear();
    }
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
    isLoading: userLoading || isInitializing,
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

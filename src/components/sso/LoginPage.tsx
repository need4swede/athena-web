import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Shield } from "lucide-react";
import { useAuth } from "./SSOProvider";
import { fetchSSOConfig } from "@/lib/sso-config";
import { useCustomCSS } from "@/hooks/useCustomCSS";

export function LoginPage() {
  const { login, isLoading, loginError, clearLoginError } = useAuth();
  const autoAttemptedRef = useRef(false);

  const { data: config, isLoading: configLoading, error } = useQuery({
    queryKey: ["sso-config"],
    queryFn: fetchSSOConfig,
    retry: 3,
    retryDelay: 1000,
  });

  useCustomCSS(config?.branding?.customCss, {
    enabled: !!config?.branding?.customCss,
    onError: (errors) => console.warn("Custom CSS validation errors:", errors),
    onWarning: (warnings) => console.info("Custom CSS validation warnings:", warnings),
  });

  useEffect(() => {
    if (autoAttemptedRef.current) return;
    if (loginError) return;
    autoAttemptedRef.current = true;
    login().catch(() => {
      // Errors are surfaced via loginError state inside the provider.
    });
  }, [login, loginError]);

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-gray-600">Loading SSO configuration...</p>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="text-red-600">Failed to load SSO configuration</div>
              {error && (
                <div className="text-sm text-gray-500">
                  Error: {error instanceof Error ? error.message : "Unknown error"}
                </div>
              )}
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="sso-login-container min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="space-y-6 pb-8">
          <div className="text-center space-y-4">
            {config.branding?.logoUrl ? (
              <img
                src={config.branding.logoUrl}
                alt={config.branding.companyName}
                className="h-16 mx-auto rounded-xl"
              />
            ) : (
              <div
                className="w-16 h-16 mx-auto rounded-xl flex items-center justify-center"
                style={{ backgroundColor: config.branding?.primaryColor || "#2563eb" }}
              >
                <Shield className="w-8 h-8 text-white" />
              </div>
            )}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {config.branding?.loginTitle || "Welcome back"}
              </h1>
              <p className="text-gray-600">
                {config.branding?.loginSubtitle || "Sign in to your account"}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loginError ? (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-red-600">Sign-in blocked</h2>
                  <p className="text-gray-600 text-sm leading-relaxed">{loginError}</p>
                </div>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => {
                    clearLoginError();
                    login().catch(() => {});
                  }}
                  className="w-full h-12 font-medium"
                  disabled={isLoading}
                >
                  Retry TinyAuth login
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  className="w-full h-12 font-medium"
                  variant="outline"
                >
                  Refresh page
                </Button>
              </div>
              <div className="text-center text-sm text-gray-500">
                {(config.branding as any)?.footer || "Protected by enterprise-grade security"}
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
              <div className="space-y-2">
                <p className="text-gray-700 font-medium">Signing you in with TinyAuth</p>
                <p className="text-sm text-gray-500">
                  Authentication happens automatically once TinyAuth confirms your identity.
                </p>
              </div>
              <div className="text-center text-sm text-gray-500">
                {(config.branding as any)?.footer || "Protected by enterprise-grade security"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

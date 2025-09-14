import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Shield } from "lucide-react";
import { useAuth } from "./SSOProvider";
import { OAuthButton } from "./OAuthButton";
import { fetchSSOConfig } from "@/lib/sso-config";
import { useCustomCSS } from "@/hooks/useCustomCSS";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const { login, isLoading, loginError, clearLoginError } = useAuth();

  const { data: config, isLoading: configLoading, error } = useQuery({
    queryKey: ["sso-config"],
    queryFn: fetchSSOConfig,
    retry: 3,
    retryDelay: 1000,
  });

  // Apply custom CSS from configuration
  const { isApplied: isCSSApplied, errors: cssErrors, warnings: cssWarnings } = useCustomCSS(
    config?.branding?.customCss,
    {
      enabled: !!config?.branding?.customCss,
      onError: (errors) => {
        console.warn('Custom CSS validation errors:', errors);
      },
      onWarning: (warnings) => {
        console.info('Custom CSS validation warnings:', warnings);
      }
    }
  );

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsEmailLoading(true);
    try {
      // Simulate magic link functionality
      await login("email", { email, code: "magic_link_" + Date.now() });
    } catch (error) {
      console.error("Email login failed:", error);
    } finally {
      setIsEmailLoading(false);
    }
  };

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
              <div className="text-red-600">
                Failed to load SSO configuration
              </div>
              {error && (
                <div className="text-sm text-gray-500">
                  Error: {error instanceof Error ? error.message : 'Unknown error'}
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

  const enabledProviders = Object.entries(config.providers || {}).filter(
    ([_, provider]: [string, any]) => provider?.enabled
  );

  const hasOAuthProviders = enabledProviders.length > 0;

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
                style={{ backgroundColor: config.branding?.primaryColor || '#2563eb' }}
              >
                <Shield className="w-8 h-8 text-white" />
              </div>
            )}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {config.branding?.loginTitle || 'Welcome back'}
              </h1>
              <p className="text-gray-600">
                {config.branding?.loginSubtitle || 'Sign in to your account'}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loginError ? (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-red-600">
                    Access Denied
                  </h2>
                  <p className="text-gray-600 text-sm">
                    {loginError}
                  </p>
                </div>
              </div>
              <Button
                onClick={clearLoginError}
                className="w-full h-12 font-medium"
                variant="outline"
              >
                Try Again
              </Button>
              <div className="text-center text-sm text-gray-500">
                {(config.branding as any)?.footer || 'Protected by enterprise-grade security'}
              </div>
            </div>
          ) : (
            <>
              {hasOAuthProviders && (
                <div className="space-y-3">
                  {enabledProviders.map(([providerName, provider]: [string, any]) => (
                    <OAuthButton
                      key={providerName}
                      provider={providerName}
                      displayName={provider?.displayName || providerName}
                      clientId={provider?.clientId || ''}
                      tenantId={provider?.tenantId}
                      buttonText={provider?.buttonText}
                      logo={provider?.logo}
                      disabled={isLoading}
                    />
                  ))}
                </div>
              )}

              {hasOAuthProviders && config.features?.enableEmailLogin && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">or</span>
                  </div>
                </div>
              )}

              {config.features?.enableEmailLogin && (
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Email address
                    </label>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-12"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 font-medium"
                    disabled={isLoading || isEmailLoading || !email}
                    style={{ backgroundColor: config.branding?.primaryColor || '#2563eb' }}
                  >
                    {isEmailLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Send Magic Link
                  </Button>
                </form>
              )}

              <div className="text-center text-sm text-gray-500">
                {(config.branding as any)?.footer || 'Protected by enterprise-grade security'}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

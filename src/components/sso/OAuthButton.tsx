import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useAuth } from "./SSOProvider";
import { getProviderIcon, getProviderColor } from "@/lib/oauth-providers";

interface LogoConfig {
  enabled?: boolean;
  iconName?: string;
  customUrl?: string;
  centerText?: boolean;
}

interface OAuthButtonProps {
  provider: string;
  displayName: string;
  disabled?: boolean;
  clientId?: string;
  tenantId?: string;
  buttonText?: string;
  logo?: LogoConfig;
}

export function OAuthButton({
  provider,
  displayName,
  disabled,
  clientId,
  tenantId,
  buttonText,
  logo
}: OAuthButtonProps) {
  const { login, isLoading } = useAuth();

  const handleClick = async () => {
    try {
      if (!clientId) {
        console.error(`No client ID configured for ${provider}`);
        alert(`${provider} OAuth is not properly configured. Please add your client ID to the configuration.`);
        return;
      }

      // Use the enhanced login method from SSOProvider
      await login(provider);
    } catch (error) {
      console.error(`${provider} login failed:`, error);
      alert(`Failed to initiate ${provider} login. Please try again.`);
    }
  };

  // Determine if logo should be shown
  const showLogo = logo?.enabled !== false;
  const centerText = logo?.centerText || false;

  // Get icon component
  const IconComponent = getProviderIcon(provider, logo?.iconName);
  const providerColor = getProviderColor(provider);

  // Determine button layout classes
  const buttonClasses = showLogo && !centerText
    ? "w-full h-12 justify-start space-x-3 hover:bg-gray-50 transition-colors"
    : "w-full h-12 justify-center hover:bg-gray-50 transition-colors";

  return (
    <Button
      type="button"
      variant="outline"
      className={buttonClasses}
      onClick={handleClick}
      disabled={disabled || isLoading || !clientId}
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <>
          {showLogo && logo?.customUrl ? (
            // Custom image logo
            <img
              src={logo.customUrl}
              alt={`${displayName} logo`}
              className="w-5 h-5 object-contain"
              onError={(e) => {
                // Fallback to icon if custom image fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : showLogo ? (
            // Lucide icon
            <IconComponent className={`w-5 h-5 ${providerColor}`} />
          ) : null}

          <span className={`font-medium text-gray-700 ${centerText && !showLogo ? 'text-center' : ''}`}>
            {buttonText || `Continue with ${displayName}`}
            {!clientId && <span className="text-xs text-red-500 ml-1">(Not configured)</span>}
          </span>
        </>
      )}
    </Button>
  );
}

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export function AuthCallback() {
  useEffect(() => {
    const timeout = setTimeout(() => {
      window.location.href = '/';
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        <p className="text-gray-600">Processing sign-in redirect...</p>
      </div>
    </div>
  );
}

export default AuthCallback;

import React from 'react';
import { Bell, User, Moon, Sun, Settings, LogOut, Users } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/components/sso/SSOProvider';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { SandboxToggle } from '@/components/Nav/SandboxToggle';

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin, isSuperAdmin } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'super-admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  // Don't render header if no user is authenticated
  if (!user) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-black/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-black/60">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <img className="w-12" src="https://njesd.b-cdn.net/photos/apps/athena/logo.png" alt="athena_logo" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Athena
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Asset & Directory Service for Education
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <GlobalSearch />

          {/* Actions */}
          <div className="flex items-center space-x-3">
            <SandboxToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="w-9 h-9 p-0 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-300"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="w-9 h-9 p-0 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-300"
            >
              <Bell className="w-4 h-4" />
            </Button>

            {isSuperAdmin && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-9 h-9 p-0 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-300"
                title="User Management"
              >
                <Link to="/users">
                  <Users className="w-4 h-4" />
                </Link>
              </Button>
            )}

            {isSuperAdmin && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-9 h-9 p-0 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-300"
                title="Admin Settings"
              >
                <Link to="/admin">
                  <Settings className="w-4 h-4" />
                </Link>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-9 h-9 p-0 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-300"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>

            {/* User Profile */}
            <div className="flex items-center space-x-3 pl-3 border-l border-gray-200/60 dark:border-gray-700/60">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {user.name}
                </p>
                <div className="flex items-center space-x-2">
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeStyle(user.role || 'user')}`}>
                    {user.role ? user.role.replace('_', ' ') : 'user'}
                  </span>
                </div>
              </div>
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <div className="w-9 h-9 bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

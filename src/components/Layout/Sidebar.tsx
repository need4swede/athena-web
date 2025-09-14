
import React from 'react';
import { useDashboardStats } from '@/hooks/useChromebooks';
import {
  Home,
  Laptop,
  Users,
  FileText,
  BarChart3,
  Settings,
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  FolderTree,
  ListTodo,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  userRole: 'user' | 'admin' | 'super-admin';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
  userRole
}) => {
  const location = useLocation();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, roles: ['user', 'admin', 'super-admin'], path: '/' },
    { id: 'chromebooks', label: 'Chromebooks', icon: Laptop, roles: ['user', 'admin', 'super-admin'], path: '/chromebooks' },
    { id: 'org-units', label: 'Org Units', icon: FolderTree, roles: ['super-admin'], path: '/org-units' },
    { id: 'users', label: 'Users', icon: Users, roles: ['user', 'admin', 'super-admin'], path: '/users' },
    { id: 'aeries', label: 'Aeries', icon: Shield, roles: ['admin', 'super-admin'], path: '/aeries' },
    { id: 'checkout', label: 'Check Out', icon: Upload, roles: ['admin', 'super-admin'], path: '/checkout' },
    { id: 'checkin', label: 'Check In', icon: Download, roles: ['admin', 'super-admin'], path: '/checkin' },
    { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'super-admin'], path: '/reports' },
    { id: 'maintenance', label: 'Maintenance', icon: AlertTriangle, roles: ['admin', 'super-admin'], path: '/maintenance' },
    { id: 'tasks', label: 'Tasks', icon: ListTodo, roles: ['admin', 'super-admin'], path: '/tasks' },
    { id: 'db-admin', label: 'DB Admin', icon: Database, roles: ['super-admin'], path: '/db-admin' },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['super-admin'], path: '/' },
  ];

  const availableItems = menuItems.filter(item =>
    item.roles.includes(userRole)
  );

  const handleMenuItemClick = (id: string) => {
    onSectionChange(id);
  };

  return (
    <aside className="w-64 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-xl border-r border-gray-200/60 dark:border-gray-800/60 h-[calc(100vh-80px)]">
      <nav className="p-4 space-y-2">
        {availableItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path && (item.path === '/' ? activeSection === item.id : true);

          return (
            <Button
              key={item.id}
              variant={isActive ? "default" : "ghost"}
              className={`w-full justify-start h-11 text-left font-medium transition-all duration-300 ${
                isActive
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 dark:shadow-blue-500/25'
                  : 'hover:bg-gray-100/80 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300'
              }`}
              asChild
              onClick={() => handleMenuItemClick(item.id)}
            >
              <Link to={item.path}>
                <Icon className="w-4 h-4 mr-3" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      {/* Quick Stats */}
      <div className="p-4 mt-6 border-t border-gray-200/60 dark:border-gray-700/60">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Quick Overview
        </h3>
        <StatsOverview />
      </div>
    </aside>
  );
};

// Stats component to handle data fetching and display
const StatsOverview: React.FC = () => {
  const { stats, loading, error } = useDashboardStats();

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500">
        Unable to load stats. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">Available</span>
        <div className="flex items-center space-x-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="font-medium text-gray-900 dark:text-white">{stats.available}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">Checked Out</span>
        <div className="flex items-center space-x-1">
          <Upload className="w-3 h-3 text-blue-500" />
          <span className="font-medium text-gray-900 dark:text-white">{stats.checkedOut}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">Maintenance</span>
        <div className="flex items-center space-x-1">
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
          <span className="font-medium text-gray-900 dark:text-white">{stats.maintenance}</span>
        </div>
      </div>
    </div>
  );
};

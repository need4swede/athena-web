import React from 'react';
import { Chromebook } from '@/types/chromebook';
import {
  Laptop,
  User,
  MapPin,
  Calendar,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cloud,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Utility function to format org unit path by removing "/Chromebooks" prefix
const formatOrgUnit = (orgUnit: string): string => {
  if (orgUnit.startsWith('/Chromebooks')) {
    const remaining = orgUnit.substring('/Chromebooks'.length);
    return remaining || '/';
  }
  return orgUnit;
};

interface ChromebookCardProps {
  chromebook: Chromebook;
  onViewDetails: (id: string) => void;
  userRole?: 'user' | 'admin' | 'super-admin';
  isSync?: boolean;
  buttonText?: string;
}

export const ChromebookCard: React.FC<ChromebookCardProps> = ({
  chromebook,
  onViewDetails,
  userRole = 'user',
  isSync = false,
  buttonText = 'View Details'
}) => {
  const getStatusIcon = () => {
    switch (chromebook.status) {
      case 'available':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'checked-out':
        return <User className="w-4 h-4 text-blue-500" />;
      case 'maintenance':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'lost':
      case 'damaged':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (chromebook.status) {
      case 'available':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'checked-out':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'lost':
      case 'damaged':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <div className={`bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-xl p-6 border border-gray-200/60 dark:border-gray-800/60 shadow-sm hover:shadow-md transition-all duration-300 group ${isSync ? 'ring-2 ring-blue-200 dark:ring-blue-800' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 rounded-lg flex items-center justify-center relative">
            <Laptop className="w-5 h-5 text-white" />
            {isSync && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                <Cloud className="w-2 h-2 text-white animate-pulse" />
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {chromebook.assetTag}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {chromebook.model}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isSync && (
            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <Cloud className="w-3 h-3 animate-pulse" />
              <span>Syncing</span>
            </div>
          )}
          {chromebook.isInsured && (
            <div className="tooltip" data-tip="Insured">
              <Shield className="w-4 h-4 text-blue-500" />
            </div>
          )}
          <span className={`inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor()}`}>
            {getStatusIcon()}
            <span className="capitalize">{chromebook.status.replace('-', ' ')}</span>
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">Serial:</span>
          <span className="font-mono">{chromebook.serialNumber}</span>
        </div>

        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
          <MapPin className="w-3 h-3" />
          <span>{formatOrgUnit(chromebook.orgUnit)}</span>
        </div>

        {chromebook.currentUser && (
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <User className="w-3 h-3" />
            <span>
              {chromebook.currentUser.firstName} {chromebook.currentUser.lastName}
              <span className="text-xs ml-1">({chromebook.currentUser.studentId})</span>
            </span>
          </div>
        )}

        {(chromebook.mostRecentUser || (chromebook.recentUsers && chromebook.recentUsers.length > 0)) && !chromebook.currentUser && (
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <User className="w-3 h-3" />
              <span>Most recent user: {chromebook.mostRecentUser || chromebook.recentUsers?.[0]?.email}</span>
            </div>
            {chromebook.lastKnownNetwork && chromebook.lastKnownNetwork.length > 0 && chromebook.lastKnownNetwork[0].wanIpAddress && (
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <Globe className="w-3 h-3" />
                <span>WAN IP: {chromebook.lastKnownNetwork[0].wanIpAddress}</span>
              </div>
            )}
          </div>
        )}

        {chromebook.checkedOutDate && (
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>Checked out: {chromebook.checkedOutDate.toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {chromebook.tags && chromebook.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {chromebook.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md"
            >
              {tag.name}
            </span>
          ))}
          {chromebook.tags.length > 3 && (
            <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md">
              +{chromebook.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      <div className="flex space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewDetails(chromebook.id)}
          className="flex-1 transition-all duration-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          disabled={isSync}
        >
          {buttonText}
        </Button>

        {userRole !== 'user' && chromebook.status === 'available' && (
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white transition-all duration-300"
            disabled={isSync}
          >
            Check Out
          </Button>
        )}

        {userRole !== 'user' && chromebook.status === 'checked-out' && (
          <Button
            size="sm"
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20 transition-all duration-300"
            disabled={isSync}
          >
            Check In
          </Button>
        )}
      </div>
    </div>
  );
};

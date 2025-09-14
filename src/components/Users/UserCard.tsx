import React from 'react';
import { GoogleUser } from '@/types/user';
import { Button } from '@/components/ui/button';
import {
    User,
    Mail,
    Calendar,
    Building,
    Shield,
    AlertTriangle,
    CheckCircle,
    Clock,
    Cloud,
    Phone,
    MapPin,
    UserCheck,
    UserX,
    Key
} from 'lucide-react';

interface UserCardProps {
    user: GoogleUser;
    onViewDetails?: (userId: string) => void;
    onSuspendUser?: (userId: string) => void;
    onUnsuspendUser?: (userId: string) => void;
    userRole?: 'user' | 'admin' | 'super-admin';
    isSync?: boolean;
}

export const UserCard: React.FC<UserCardProps> = ({
    user,
    onViewDetails,
    onSuspendUser,
    onUnsuspendUser,
    userRole = 'user',
    isSync = false
}) => {
    // Format date strings
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Never';
        try {
            return new Date(dateString).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return 'Invalid date';
        }
    };

    // Get organization info if available
    const primaryOrg = user.organizations?.find(org => org.primary) || user.organizations?.[0];

    // Get status icon and color
    const getStatusIcon = () => {
        if (user.suspended) {
            return <UserX className="w-4 h-4 text-red-500" />;
        }
        if (user.isAdmin) {
            return <Shield className="w-4 h-4 text-blue-500" />;
        }
        if (user.isEnrolledIn2Sv) {
            return <CheckCircle className="w-4 h-4 text-green-500" />;
        }
        return <UserCheck className="w-4 h-4 text-gray-500" />;
    };

    const getStatusColor = () => {
        if (user.suspended) {
            return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
        }
        if (user.isAdmin) {
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
        }
        if (user.isEnrolledIn2Sv) {
            return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
        }
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    };

    const getStatusText = () => {
        if (user.suspended) {
            return 'Suspended';
        }
        if (user.isAdmin) {
            return 'Admin';
        }
        if (user.isEnrolledIn2Sv) {
            return '2FA Enabled';
        }
        return 'Active';
    };

    return (
        <div className={`bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-xl p-6 border border-gray-200/60 dark:border-gray-800/60 shadow-sm hover:shadow-md transition-all duration-300 group ${isSync ? 'ring-2 ring-blue-200 dark:ring-blue-800' : ''}`}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-700 rounded-lg flex items-center justify-center relative">
                        <User className="w-5 h-5 text-white" />
                        {isSync && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                                <Cloud className="w-2 h-2 text-white animate-pulse" />
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                            {user.name.fullName || 'Unknown User'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {user.primaryEmail}
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
                    {user.isDelegatedAdmin && (
                        <div className="tooltip" data-tip="Delegated Admin">
                            <Key className="w-4 h-4 text-purple-500" />
                        </div>
                    )}
                    <span className={`inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor()}`}>
                        {getStatusIcon()}
                        <span>{getStatusText()}</span>
                    </span>
                </div>
            </div>

            <div className="space-y-2 mb-4">
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <Building className="w-3 h-3" />
                    <span>{user.orgUnitPath || '/'}</span>
                </div>

                {primaryOrg && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        <User className="w-3 h-3" />
                        <span>
                            {primaryOrg.title || 'No title'}
                            {primaryOrg.department && ` • ${primaryOrg.department}`}
                        </span>
                    </div>
                )}

                {primaryOrg?.location && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        <MapPin className="w-3 h-3" />
                        <span>{primaryOrg.location}</span>
                    </div>
                )}

                {user.phones && user.phones.length > 0 && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        <Phone className="w-3 h-3" />
                        <span>{user.phones[0].value}</span>
                    </div>
                )}

                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <Calendar className="w-3 h-3" />
                    <span>Last login: {formatDate(user.lastLoginTime)}</span>
                </div>

                {user.changePasswordAtNextLogin && (
                    <div className="flex items-center space-x-2 text-sm text-yellow-600 dark:text-yellow-400">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Password change required</span>
                    </div>
                )}
            </div>

            {user.aliases && user.aliases.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                    {user.aliases.slice(0, 2).map((alias, index) => (
                        <span
                            key={index}
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md"
                        >
                            {alias}
                        </span>
                    ))}
                    {user.aliases.length > 2 && (
                        <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md">
                            +{user.aliases.length - 2} more
                        </span>
                    )}
                </div>
            )}

            <div className="flex space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewDetails && onViewDetails(user.id)}
                    className="flex-1 transition-all duration-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    disabled={isSync}
                >
                    View Details
                </Button>
            </div>
        </div>
    );
};

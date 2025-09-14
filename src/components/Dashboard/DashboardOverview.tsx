import React, { useState } from 'react';
import { StatsCard } from './StatsCard';
import { CheckedOutDevicesModal } from './CheckedOutDevicesModal';
import { InsuredDevicesModal } from './InsuredDevicesModal';
import {
  Laptop,
  Upload,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
  FileText
} from 'lucide-react';
import { useDashboardStats, useRecentActivity } from '@/hooks/useChromebooks';
import { PendingAgreementModal } from './PendingAgreementModal';

export const DashboardOverview: React.FC = () => {
  const { stats, loading: statsLoading, error: statsError } = useDashboardStats();
  const { activities, loading: activitiesLoading, error: activitiesError } = useRecentActivity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPendingAgreementModalOpen, setIsPendingAgreementModalOpen] = useState(false);
  const [isInsuredDevicesModalOpen, setIsInsuredDevicesModalOpen] = useState(false);

  const statsConfig = [
    {
      title: 'Total Chromebooks',
      value: stats.totalChromebooks,
      change: 'Total inventory',
      changeType: 'neutral' as const,
      icon: Laptop,
      iconColor: 'bg-gradient-to-br from-blue-500 to-blue-600'
    },
    {
      title: 'Available',
      value: stats.available,
      change: `${stats.totalChromebooks > 0 ? Math.round((stats.available / stats.totalChromebooks) * 100) : 0}% of total`,
      changeType: 'neutral' as const,
      icon: CheckCircle,
      iconColor: 'bg-gradient-to-br from-green-500 to-green-600'
    },
    {
      title: 'Checked Out',
      value: stats.checkedOut,
      change: `${stats.totalChromebooks > 0 ? Math.round((stats.checkedOut / stats.totalChromebooks) * 100) : 0}% of total`,
      changeType: 'neutral' as const,
      icon: Upload,
      iconColor: 'bg-gradient-to-br from-purple-500 to-purple-600',
      onClick: () => setIsModalOpen(true),
    },
    {
      title: 'Maintenance',
      value: stats.maintenance,
      change: `${stats.totalChromebooks > 0 ? Math.round((stats.maintenance / stats.totalChromebooks) * 100) : 0}% of total`,
      changeType: 'neutral' as const,
      icon: AlertTriangle,
      iconColor: 'bg-gradient-to-br from-yellow-500 to-yellow-600'
    },
    {
      title: 'Insured Devices',
      value: stats.insured,
      change: `${stats.totalChromebooks > 0 ? Math.round((stats.insured / stats.totalChromebooks) * 100) : 0}% coverage`,
      changeType: 'neutral' as const,
      icon: Shield,
      iconColor: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      onClick: () => setIsInsuredDevicesModalOpen(true),
    },
    {
      title: 'Pending Agreement',
      value: stats.pending,
      change: `${stats.totalChromebooks > 0 ? Math.round((stats.pending / stats.totalChromebooks) * 100) : 0}% of total`,
      changeType: 'neutral' as const,
      icon: FileText,
      iconColor: 'bg-gradient-to-br from-orange-500 to-orange-600',
      onClick: () => setIsPendingAgreementModalOpen(true),
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Dashboard Overview
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Real-time insights into your Chromebook fleet
        </p>
      </div>

      {statsLoading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading dashboard stats...</span>
        </div>
      )}

      {statsError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">Error loading stats: {statsError}</p>
        </div>
      )}

      {!statsLoading && !statsError && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statsConfig.map((stat, index) => (
            <StatsCard
              key={index}
              title={stat.title}
              value={stat.value}
              change={stat.change}
              changeType={stat.changeType}
              icon={stat.icon}
              iconColor={stat.iconColor}
              onClick={(stat as any).onClick}
            />
          ))}
        </div>
      )}

      <CheckedOutDevicesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <PendingAgreementModal
        isOpen={isPendingAgreementModalOpen}
        onClose={() => setIsPendingAgreementModalOpen(false)}
      />

      <InsuredDevicesModal
        isOpen={isInsuredDevicesModalOpen}
        onClose={() => setIsInsuredDevicesModalOpen(false)}
      />

      {/* Recent Activity */}
      <div className="mt-8">
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-xl p-6 border border-gray-200/60 dark:border-gray-800/60">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Activity
          </h3>

          {activitiesLoading && (
            <div className="flex justify-center items-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading recent activity...</span>
            </div>
          )}

          {activitiesError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-red-800 dark:text-red-200 text-sm">Error loading activity: {activitiesError}</p>
            </div>
          )}

          {!activitiesLoading && !activitiesError && (
            <div className="space-y-4">
              {activities.map((activity, index) => (
                <div key={index} className="flex items-center space-x-4 py-3 border-b border-gray-100/60 dark:border-gray-800/60 last:border-0">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.type === 'checkout' ? 'bg-blue-500' :
                    activity.type === 'checkin' ? 'bg-green-500' :
                    activity.type === 'maintenance' ? 'bg-yellow-500' :
                    'bg-purple-500'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 dark:text-white">
                      {activity.action} <span className="font-medium">{activity.user}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}

              {activities.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-gray-600 dark:text-gray-400 text-sm">No recent activity found.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

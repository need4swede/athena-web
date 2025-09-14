import React, { useState } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { DashboardOverview } from '@/components/Dashboard/DashboardOverview';
import { ChromebookCard } from '@/components/Chromebooks/ChromebookCard';
import { useAuth } from '@/components/sso/SSOProvider';
import { useChromebooks } from '@/hooks/useChromebooks';

const Index = () => {
  const [activeSection, setActiveSection] = useState('dashboard');
  const { user } = useAuth();
  const { chromebooks, loading, error } = useChromebooks();

  const handleViewDetails = (id: string) => {
    console.log('View details for chromebook:', id);
  };

  // Convert SSO user to the format expected by Sidebar component
  const userRole = user?.role === 'super_admin' ? 'super-admin' as const :
                   user?.role === 'admin' ? 'admin' as const :
                   'user' as const;

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardOverview />;
      case 'chromebooks':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Chromebook Library
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Manage and track all chromebooks in your fleet
              </p>
            </div>

            {loading && (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600 dark:text-gray-400">Loading chromebooks...</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">Error: {error}</p>
              </div>
            )}

            {!loading && !error && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {chromebooks.map((chromebook) => (
                  <ChromebookCard
                    key={chromebook.id}
                    chromebook={chromebook}
                    onViewDetails={handleViewDetails}
                    userRole={userRole}
                  />
                ))}
              </div>
            )}

            {!loading && !error && chromebooks.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">No chromebooks found.</p>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50/80 dark:bg-black/80 transition-colors duration-300">
        <Header />
        <div className="flex">
          <Sidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            userRole={userRole}
          />
          <main className="flex-1 p-8">
            {renderContent()}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default Index;

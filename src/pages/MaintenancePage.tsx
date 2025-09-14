
import React, { useState } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { MaintenanceList } from '@/components/Maintenance/MaintenanceList';
import { MaintenanceDetails } from '@/components/Maintenance/MaintenanceDetails';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { AddDeviceModal } from '@/components/Maintenance/AddDeviceModal';
import { useAuth } from '@/components/sso/SSOProvider';

const MaintenancePage = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('maintenance');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isAddDeviceModalOpen, setAddDeviceModalOpen] = useState(false);
  const [refreshList, setRefreshList] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50/80 dark:bg-black/80 transition-colors duration-300">
        <Header />
        <div className="flex">
          <Sidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            userRole={user?.role === 'super_admin' ? 'super-admin' : user?.role || 'user'}
          />
          <main className="flex-1 p-8">
            <AddDeviceModal
              isOpen={isAddDeviceModalOpen}
              onClose={() => setAddDeviceModalOpen(false)}
              onComplete={() => {
                setAddDeviceModalOpen(false);
                setRefreshList(prev => !prev); // Toggle to trigger refresh
              }}
            />
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Device Maintenance
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage device repairs, maintenance requests, and issue tracking
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setAddDeviceModalOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Device
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <MaintenanceList
                    onSelectDevice={setSelectedDeviceId}
                    selectedDeviceId={selectedDeviceId}
                    refresh={refreshList}
                  />
                </div>
                <div className="lg:col-span-2">
                  {selectedDeviceId ? (
                    <MaintenanceDetails deviceId={selectedDeviceId} />
                  ) : (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                          No Device Selected
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">
                          Select a device from the list to view maintenance details
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default MaintenancePage;

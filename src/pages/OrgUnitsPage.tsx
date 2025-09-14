import React, { useState, useMemo, useCallback } from 'react';
import { useOrgUnits } from '@/hooks/useOrgUnits';
import { OrgUnitTree } from '@/components/OrgUnits/OrgUnitTree';
import { OrgUnitTreeNode, OrgUnit } from '@/types/orgUnit';
import { useAuth } from '@/components/sso/SSOProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Search, FolderTree, RefreshCw, Cloud } from 'lucide-react';

// Custom hook for debounced search
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const OrgUnitsPage: React.FC = () => {
  const { orgUnits, orgUnitTree, loading, syncing, syncProgress, syncingOrgUnits, error, isInitialSync, refetch } = useOrgUnits();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('org-units');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<OrgUnitTreeNode | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Debounce search term to prevent lag while typing
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Handle sidebar navigation
  const handleSectionChange = useCallback((section: string) => {
    setActiveSection(section);

    // Navigate to the appropriate page based on the selected section
    switch (section) {
      case 'dashboard':
        window.location.href = '/';
        break;
      case 'chromebooks':
        window.location.href = '/chromebooks';
        break;
      case 'users':
        window.location.href = '/users';
        break;
      case 'checkout':
        window.location.href = '/checkout';
        break;
      case 'checkin':
        window.location.href = '/checkin';
        break;
      case 'reports':
        window.location.href = '/reports';
        break;
      case 'maintenance':
        window.location.href = '/maintenance';
        break;
      // Add other sections as needed
    }
  }, []);

  // Handle org unit selection
  const handleOrgUnitSelect = useCallback((orgUnit: OrgUnitTreeNode) => {
    setSelectedOrgUnit(orgUnit);
    setIsDetailsOpen(true);
  }, []);

  // Memoized filtered org units with debounced search
  const filteredOrgUnits = useMemo(() => {
    if (!debouncedSearchTerm) {
      return [];
    }

    return orgUnits.filter(ou =>
      ou.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      ou.orgUnitPath.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [orgUnits, debouncedSearchTerm]);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50/80 dark:bg-black/80 transition-colors duration-300">
        <Header />
        <div className="flex">
          <Sidebar
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            userRole={user?.role === 'super_admin' ? 'super-admin' : 
                     user?.role === 'admin' ? 'admin' : 
                     'user'}
          />
          <main className="flex-1 p-8">
            <div className="max-w-7xl mx-auto">
              {/* Header with search */}
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                    <FolderTree className="mr-2 h-6 w-6" />
                    Organizational Units ({orgUnits.length.toLocaleString()})
                  </h1>

                  {/* Background sync indicator with progress */}
                  {syncing && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                      <Cloud className="h-4 w-4 animate-pulse" />
                      <span>Syncing...</span>
                      {!isInitialSync && (
                        <div className="ml-2 w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${syncProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col md:flex-row gap-3 md:w-auto w-full">
                  <div className="relative md:w-64 w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search org units..."
                      className="pl-9 w-full"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm !== debouncedSearchTerm && (
                      <div className="absolute right-2.5 top-2.5">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => refetch()}
                      disabled={loading || syncing}
                      className="flex items-center gap-1"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading || syncing ? 'animate-spin' : ''}`} />
                      <span className="hidden md:inline">Refresh</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Sync Progress Bar - Only show for initial sync and manual refresh */}
              {syncing && syncProgress > 0 && isInitialSync && (
                <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-blue-500 animate-pulse" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Syncing organizational units with Google...
                      </span>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {syncProgress}%
                    </span>
                  </div>
                  <Progress value={syncProgress} className="h-2" />
                </div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="ml-2 text-gray-600 dark:text-gray-400">Loading organizational units...</p>
                </div>
              )}

              {/* Error state */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-red-800 dark:text-red-400">
                    Error loading organizational units: {error}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => refetch()}
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* Main content */}
              {!loading && !error && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Tree view */}
                  <div className="md:col-span-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Organization Structure</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {orgUnitTree.length > 0 ? (
                          <OrgUnitTree
                            nodes={orgUnitTree}
                            onSelect={handleOrgUnitSelect}
                            selectedOrgUnitId={selectedOrgUnit?.id}
                            syncingOrgUnits={syncingOrgUnits}
                          />
                        ) : (
                          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                            No organizational units found
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Search results or details */}
                  <div className="md:col-span-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          {debouncedSearchTerm ? `Search Results (${filteredOrgUnits.length})` : 'Organization Details'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {debouncedSearchTerm ? (
                          filteredOrgUnits.length > 0 ? (
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {filteredOrgUnits.map(ou => (
                                <div
                                  key={ou.id}
                                  className="p-3 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center justify-between transition-colors"
                                  onClick={() => {
                                    const treeNode = {
                                      ...ou,
                                      children: [],
                                      level: ou.orgUnitPath.split('/').filter(Boolean).length
                                    };
                                    handleOrgUnitSelect(treeNode);
                                  }}
                                >
                                  <div>
                                    <p className="font-medium">{ou.name}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{ou.orgUnitPath}</p>
                                  </div>
                                  {syncingOrgUnits.has(ou.orgUnitPath) && (
                                    <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                              No organizational units match your search "{debouncedSearchTerm}"
                            </p>
                          )
                        ) : selectedOrgUnit ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-xl font-medium">{selectedOrgUnit.name}</h3>
                                <p className="text-gray-500 dark:text-gray-400">{selectedOrgUnit.orgUnitPath}</p>
                              </div>
                              {syncingOrgUnits.has(selectedOrgUnit.orgUnitPath) && (
                                <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
                              )}
                            </div>

                            {selectedOrgUnit.description && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h4>
                                <p>{selectedOrgUnit.description}</p>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Organization ID</h4>
                                <p className="font-mono text-sm">{selectedOrgUnit.orgUnitId}</p>
                              </div>

                              {selectedOrgUnit.parentOrgUnitPath && (
                                <div>
                                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Parent Organization</h4>
                                  <p>{selectedOrgUnit.parentOrgUnitPath}</p>
                                </div>
                              )}

                              <div>
                                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Block Inheritance</h4>
                                <p>{selectedOrgUnit.blockInheritance ? 'Yes' : 'No'}</p>
                              </div>
                            </div>

                            {selectedOrgUnit.children.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                  Child Organizations ({selectedOrgUnit.children.length})
                                </h4>
                                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                  {selectedOrgUnit.children.map(child => (
                                    <div
                                      key={child.id}
                                      className="p-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center justify-between transition-colors"
                                      onClick={() => handleOrgUnitSelect(child)}
                                    >
                                      <p className="font-medium">{child.name}</p>
                                      {syncingOrgUnits.has(child.orgUnitPath) && (
                                        <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                            Select an organizational unit from the tree to view details, or use the search above to find specific units
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Org Unit Details Dialog */}
        {selectedOrgUnit && (
          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Organizational Unit Details</span>
                  {syncingOrgUnits.has(selectedOrgUnit.orgUnitPath) && (
                    <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                  )}
                </DialogTitle>
                <DialogDescription>
                  Detailed information about {selectedOrgUnit.name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div>
                  <h3 className="text-xl font-medium">{selectedOrgUnit.name}</h3>
                  <p className="text-gray-500 dark:text-gray-400">{selectedOrgUnit.orgUnitPath}</p>
                </div>

                {selectedOrgUnit.description && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h4>
                    <p>{selectedOrgUnit.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Organization ID</h4>
                    <p className="font-mono text-sm">{selectedOrgUnit.orgUnitId}</p>
                  </div>

                  {selectedOrgUnit.parentOrgUnitPath && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Parent Organization</h4>
                      <p>{selectedOrgUnit.parentOrgUnitPath}</p>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Block Inheritance</h4>
                    <p>{selectedOrgUnit.blockInheritance ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </ThemeProvider>
  );
};

export default OrgUnitsPage;

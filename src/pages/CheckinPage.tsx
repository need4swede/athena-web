import React, { useState, useMemo, useCallback } from 'react';
import { useChromebooks } from '@/hooks/useChromebooks';
import { ChromebookCard } from '@/components/Chromebooks/ChromebookCard';
import { CheckinWorkflow } from '@/components/Checkin/CheckinWorkflow';
import { Chromebook } from '@/types/chromebook';
import { OrgUnitTreeNode } from '@/types/orgUnit';
import { useAuth } from '@/components/sso/SSOProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Search, RotateCcw, RefreshCw, Cloud, ChevronRight, ChevronDown, FolderTree, X } from 'lucide-react';

// Org Units Sidebar Component (same as ChromebooksPage)
const OrgUnitsSidebar: React.FC<{
  orgUnitTree: OrgUnitTreeNode[];
  selectedOrgUnit: string;
  onOrgUnitSelect: (orgUnitPath: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
  deviceCounts: Record<string, number>;
}> = ({ orgUnitTree, selectedOrgUnit, onOrgUnitSelect, isExpanded, onToggle, deviceCounts }) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['/']));

  const toggleNode = useCallback((orgUnitPath: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orgUnitPath)) {
        newSet.delete(orgUnitPath);
      } else {
        newSet.add(orgUnitPath);
      }
      return newSet;
    });
  }, []);

  const renderOrgUnitNode = useCallback((node: OrgUnitTreeNode, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.orgUnitPath);
    const isSelected = selectedOrgUnit === node.orgUnitPath;
    const deviceCount = deviceCounts[node.orgUnitPath] || 0;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            isSelected ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onOrgUnitSelect(node.orgUnitPath)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.orgUnitPath);
              }}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}
          <FolderTree className="h-3 w-3 flex-shrink-0" />
          <span className="text-xs truncate flex-1">
            {node.name === '/' ? 'Root' : node.name}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
            {deviceCount}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderOrgUnitNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  }, [expandedNodes, selectedOrgUnit, onOrgUnitSelect, toggleNode, deviceCounts]);

  return (
    <div
      className={`fixed left-64 top-16 h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-lg transition-all duration-300 z-40 ${
        isExpanded ? 'w-80' : 'w-0'
      } overflow-hidden`}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 pt-8 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-gray-900 dark:text-white">Filter by Org Unit</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div
            className={`flex items-center gap-2 py-2 px-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 ${
              selectedOrgUnit === 'all' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''
            }`}
            onClick={() => onOrgUnitSelect('all')}
          >
            <RotateCcw className="h-3 w-3" />
            <span className="text-xs font-medium">All Check-In Eligible</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
              {Object.values(deviceCounts).reduce((sum, count) => sum + count, 0)}
            </span>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
            {orgUnitTree.map(node => renderOrgUnitNode(node))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Simple paginated checked-out devices grid component
const PaginatedCheckedOutGrid: React.FC<{
  devices: Chromebook[];
  onViewDetails: (id: string) => void;
  syncingDevices: Set<string>;
}> = ({ devices, onViewDetails, syncingDevices }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const totalPages = Math.ceil(devices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentDevices = devices.slice(startIndex, endIndex);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [devices.length]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {currentDevices.map((device) => (
          <ChromebookCard
            key={device.id}
            chromebook={device}
            onViewDetails={onViewDetails}
            isSync={syncingDevices.has(device.serialNumber)}
            buttonText="Check-in"
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 pt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>

          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(pageNum)}
                  className="w-8 h-8 p-0"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>

          <span className="text-sm text-gray-500 dark:text-gray-400 ml-4">
            Page {currentPage} of {totalPages} ({devices.length.toLocaleString()} total)
          </span>
        </div>
      )}
    </div>
  );
};

const CheckinPage: React.FC = () => {
  const { chromebooks, loading, syncing, syncProgress, syncingDevices, error, isInitialSync, refetch } = useChromebooks();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('checkin');
  const [searchTerm, setSearchTerm] = useState('');
  const [orgUnitFilter, setOrgUnitFilter] = useState<string>('all');
  const [selectedChromebook, setSelectedChromebook] = useState<Chromebook | null>(null);
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false);
  const [isOrgUnitsSidebarExpanded, setIsOrgUnitsSidebarExpanded] = useState(false);


  // Filter to devices that need check-in (checked-out or pending_signature)
  const checkedOutDevices = useMemo(() => {
    return chromebooks.filter(device =>
      device.status === 'checked-out' || device.status === 'pending_signature'
    );
  }, [chromebooks]);

  // Build org unit tree from checked-out device data
  const orgUnitTree = useMemo(() => {
    const orgUnitMap = new Map<string, OrgUnitTreeNode>();
    const rootNodes: OrgUnitTreeNode[] = [];

    const orgUnitPaths = new Set<string>();
    checkedOutDevices.forEach(device => {
      if (device.orgUnit && device.orgUnit !== '/') {
        orgUnitPaths.add(device.orgUnit);
        const parts = device.orgUnit.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          const parentPath = '/' + parts.slice(0, i).join('/');
          orgUnitPaths.add(parentPath);
        }
      }
    });

    orgUnitPaths.add('/');

    Array.from(orgUnitPaths).forEach(path => {
      const parts = path.split('/').filter(Boolean);
      const name = parts.length === 0 ? 'Root' : parts[parts.length - 1];

      let parentPath: string | undefined;
      if (path === '/') {
        parentPath = undefined;
      } else if (parts.length === 1) {
        parentPath = '/';
      } else {
        parentPath = '/' + parts.slice(0, -1).join('/');
      }

      const node: OrgUnitTreeNode = {
        id: path,
        name,
        orgUnitPath: path,
        orgUnitId: path,
        parentOrgUnitPath: parentPath,
        blockInheritance: false,
        children: [],
        level: parts.length
      };

      orgUnitMap.set(path, node);
    });

    orgUnitMap.forEach(node => {
      if (node.parentOrgUnitPath && orgUnitMap.has(node.parentOrgUnitPath)) {
        const parent = orgUnitMap.get(node.parentOrgUnitPath)!;
        parent.children.push(node);
      } else if (node.orgUnitPath === '/') {
        rootNodes.push(node);
      }
    });

    const sortChildren = (nodes: OrgUnitTreeNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(node => sortChildren(node.children));
    };
    sortChildren(rootNodes);

    return rootNodes;
  }, [checkedOutDevices]);

  // Calculate device counts per org unit
  const deviceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    checkedOutDevices.forEach(device => {
      if (device.orgUnit) {
        counts[device.orgUnit] = (counts[device.orgUnit] || 0) + 1;
      }
    });
    return counts;
  }, [checkedOutDevices]);

  // Handle sidebar navigation
  const handleSectionChange = useCallback((section: string) => {
    setActiveSection(section);

    switch (section) {
      case 'dashboard':
        window.location.href = '/';
        break;
      case 'users':
        window.location.href = '/users';
        break;
      case 'chromebooks':
        window.location.href = '/chromebooks';
        break;
      case 'org-units':
        window.location.href = '/org-units';
        break;
      case 'checkout':
        window.location.href = '/checkout';
        break;
      case 'reports':
        window.location.href = '/reports';
        break;
      case 'maintenance':
        window.location.href = '/maintenance';
        break;
    }
  }, []);

  // Handle view details - opens checkin workflow
  const handleViewDetails = useCallback((id: string) => {
    const device = checkedOutDevices.find(d => d.id === id);
    if (device) {
      setSelectedChromebook(device);
      setIsWorkflowOpen(true);
    }
  }, [checkedOutDevices]);

  // Handle workflow completion
  const handleWorkflowComplete = useCallback(() => {
    setIsWorkflowOpen(false);
    setSelectedChromebook(null);
    refetch();
  }, [refetch]);

  // Simple local filtering of checked-out devices
  const filteredDevices = useMemo(() => {
    return checkedOutDevices.filter(device => {
      const matchesSearch = !searchTerm ||
        device.assetTag.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (device.currentUser?.firstName && device.currentUser.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (device.currentUser?.lastName && device.currentUser.lastName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (device.currentUser?.studentId && device.currentUser.studentId.includes(searchTerm));

      const matchesOrgUnit = orgUnitFilter === 'all' || device.orgUnit === orgUnitFilter;

      return matchesSearch && matchesOrgUnit;
    });
  }, [checkedOutDevices, searchTerm, orgUnitFilter]);

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

          {/* Org Units Sidebar */}
          <OrgUnitsSidebar
            orgUnitTree={orgUnitTree}
            selectedOrgUnit={orgUnitFilter}
            onOrgUnitSelect={setOrgUnitFilter}
            isExpanded={isOrgUnitsSidebarExpanded}
            onToggle={() => setIsOrgUnitsSidebarExpanded(!isOrgUnitsSidebarExpanded)}
            deviceCounts={deviceCounts}
          />

          <main className={`flex-1 p-8 transition-all duration-300 ${isOrgUnitsSidebarExpanded ? 'ml-80' : ''}`}>
            <div className="max-w-7xl mx-auto">
              {/* Header with search and filters */}
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                    <RotateCcw className="mr-2 h-6 w-6" />
                    Check In Devices ({filteredDevices.length.toLocaleString()})
                  </h1>
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
                      placeholder="Search by asset tag, serial, student..."
                      className="pl-9 w-full"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsOrgUnitsSidebarExpanded(!isOrgUnitsSidebarExpanded)}
                      className="flex items-center gap-1"
                    >
                      <FolderTree className="h-4 w-4" />
                      <span className="hidden md:inline">
                        {orgUnitFilter === 'all' ? 'Filter by Org Unit' :
                         orgUnitFilter === '/' ? 'Root' :
                         orgUnitFilter.split('/').pop() || orgUnitFilter}
                      </span>
                    </Button>

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

              {/* Active filter indicator */}
              {orgUnitFilter !== 'all' && (
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Filtered by:</span>
                  <div className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-md text-sm">
                    <FolderTree className="h-3 w-3" />
                    <span>{orgUnitFilter === '/' ? 'Root' : orgUnitFilter.split('/').pop() || orgUnitFilter}</span>
                    <button
                      onClick={() => setOrgUnitFilter('all')}
                      className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Sync Progress Bar */}
              {syncing && syncProgress > 0 && isInitialSync && (
                <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-blue-500 animate-pulse" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Syncing devices with Google...
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
                  <p className="ml-2 text-gray-600 dark:text-gray-400">Loading devices...</p>
                </div>
              )}

              {/* Error state */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-red-800 dark:text-red-400">
                    Error loading devices: {error}
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

              {/* Empty state */}
              {!loading && !error && filteredDevices.length === 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                  <RotateCcw className="h-12 w-12 mx-auto text-gray-400" />
                  <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
                    No Checked-Out Devices Found
                  </h3>
                  <p className="mt-1 text-gray-500 dark:text-gray-400">
                    {searchTerm || orgUnitFilter !== 'all'
                      ? "No checked-out devices match your current filters."
                      : "There are no devices currently checked out."}
                  </p>
                </div>
              )}

              {/* Devices grid */}
              {!loading && !error && filteredDevices.length > 0 && (
                <PaginatedCheckedOutGrid
                  devices={filteredDevices}
                  onViewDetails={handleViewDetails}
                  syncingDevices={syncingDevices}
                />
              )}
            </div>
          </main>
        </div>

        {/* Checkin Workflow Modal */}
        <Dialog open={isWorkflowOpen} onOpenChange={setIsWorkflowOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Check In Device - {selectedChromebook?.assetTag}
              </DialogTitle>
            </DialogHeader>
            {selectedChromebook && (
              <CheckinWorkflow
                key={`${selectedChromebook.id}-${isWorkflowOpen}`}
                chromebook={selectedChromebook}
                onComplete={handleWorkflowComplete}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ThemeProvider>
  );
};

export default CheckinPage;

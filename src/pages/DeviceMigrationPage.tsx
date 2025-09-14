import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/components/sso/SSOProvider';
import { useChromebooks } from '@/hooks/useChromebooks';
import { Chromebook } from '@/types/chromebook';
import { OrgUnitTreeNode } from '@/types/orgUnit';
import { ThemeProvider } from '@/components/ThemeProvider';
import {
  ArrowLeft,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FolderTree,
  Server,
  Check,
  X,
  AlertTriangle,
  Info,
  Loader2
} from 'lucide-react';

// Migration status type
interface MigrationStatus {
  device: string;
  sourceOu: string;
  targetOu: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  message?: string;
}

const DeviceMigrationPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { chromebooks, loading, syncing, syncProgress, refetch } = useChromebooks();

  const [activeSection, setActiveSection] = useState('tasks');
  const [deviceInput, setDeviceInput] = useState('');
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<string>('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['/']));
  const [migrationInProgress, setMigrationInProgress] = useState(false);
  const [migrationStatuses, setMigrationStatuses] = useState<MigrationStatus[]>([]);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);

  // The useChromebooks hook already handles initial sync automatically
  // No need to trigger it again here

  // Build org unit tree from chromebook data
  const orgUnitTree = useMemo(() => {
    const orgUnitMap = new Map<string, OrgUnitTreeNode>();
    const rootNodes: OrgUnitTreeNode[] = [];

    // Collect all unique org unit paths from chromebooks
    const orgUnitPaths = new Set<string>();
    chromebooks.forEach(chromebook => {
      if (chromebook.orgUnit && chromebook.orgUnit !== '/') {
        orgUnitPaths.add(chromebook.orgUnit);
        // Also add parent paths
        const parts = chromebook.orgUnit.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          const parentPath = '/' + parts.slice(0, i).join('/');
          orgUnitPaths.add(parentPath);
        }
      }
    });

    // Always add root
    orgUnitPaths.add('/');

    // Create org unit nodes
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

    // Build hierarchy
    orgUnitMap.forEach(node => {
      if (node.parentOrgUnitPath && orgUnitMap.has(node.parentOrgUnitPath)) {
        const parent = orgUnitMap.get(node.parentOrgUnitPath)!;
        parent.children.push(node);
      } else if (node.orgUnitPath === '/') {
        rootNodes.push(node);
      }
    });

    // Sort children by name
    const sortChildren = (nodes: OrgUnitTreeNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(node => sortChildren(node.children));
    };
    sortChildren(rootNodes);

    return rootNodes;
  }, [chromebooks]);

  // Toggle org unit node expansion
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

  // Render org unit tree node
  const renderOrgUnitNode = useCallback((node: OrgUnitTreeNode, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.orgUnitPath);
    const isSelected = selectedOrgUnit === node.orgUnitPath;
    const deviceCount = chromebooks.filter(c => c.orgUnit === node.orgUnitPath).length;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 py-2 px-3 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            isSelected ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''
          }`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => setSelectedOrgUnit(node.orgUnitPath)}
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
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-5" />}
          <FolderTree className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm truncate flex-1">
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
  }, [expandedNodes, selectedOrgUnit, chromebooks, toggleNode]);

  // Parse device input and validate
  const parseDeviceInput = useCallback((): { valid: string[], invalid: string[] } => {
    const lines = deviceInput
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const valid: string[] = [];
    const invalid: string[] = [];

    lines.forEach(line => {
      // Check if it's a serial number or asset tag
      const device = chromebooks.find(
        c => c.serialNumber.toLowerCase() === line.toLowerCase() ||
             c.assetTag.toLowerCase() === line.toLowerCase()
      );

      if (device) {
        valid.push(line);
      } else {
        invalid.push(line);
      }
    });

    return { valid, invalid };
  }, [deviceInput, chromebooks]);

  // Get parsed device count
  const { valid: validDevices } = parseDeviceInput();
  const canMigrate = validDevices.length > 0 && selectedOrgUnit && !migrationInProgress;

  // Handle migration
  const handleMigration = async () => {
    if (!canMigrate || !token) return;

    setMigrationInProgress(true);
    setMigrationComplete(false);
    setShowMigrationModal(true);
    setMigrationStatuses([]);

    try {
      // Prepare device list for migration
      const deviceIdentifiers = validDevices;
      const statuses: MigrationStatus[] = [];

      // Initialize statuses
      deviceIdentifiers.forEach(identifier => {
        const device = chromebooks.find(
          c => c.serialNumber.toLowerCase() === identifier.toLowerCase() ||
               c.assetTag.toLowerCase() === identifier.toLowerCase()
        );

        if (device) {
          statuses.push({
            device: `${device.assetTag} (${device.serialNumber})`,
            sourceOu: device.orgUnit || 'Unknown',
            targetOu: selectedOrgUnit,
            status: 'pending'
          });
        }
      });

      setMigrationStatuses(statuses);

      // Process each device
      for (let i = 0; i < deviceIdentifiers.length; i++) {
        const identifier = deviceIdentifiers[i];
        const device = chromebooks.find(
          c => c.serialNumber.toLowerCase() === identifier.toLowerCase() ||
               c.assetTag.toLowerCase() === identifier.toLowerCase()
        );

        if (!device) continue;

        // Update status to processing
        setMigrationStatuses(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'processing' };
          return updated;
        });

        try {
          // Call API to move device
          const response = await fetch('/api/google/devices/move', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              deviceId: device.deviceId,
              targetOrgUnit: selectedOrgUnit
            })
          });

          if (response.ok) {
            setMigrationStatuses(prev => {
              const updated = [...prev];
              updated[i] = {
                ...updated[i],
                status: 'success',
                message: 'Successfully moved'
              };
              return updated;
            });
          } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to move device');
          }
        } catch (error) {
          setMigrationStatuses(prev => {
            const updated = [...prev];
            updated[i] = {
              ...updated[i],
              status: 'error',
              message: error instanceof Error ? error.message : 'Unknown error'
            };
            return updated;
          });
        }

        // Add small delay between operations
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setMigrationComplete(true);

      // Refresh chromebooks data after migration
      setTimeout(() => {
        refetch();
      }, 2000);

    } catch (error) {
      console.error('Migration error:', error);
    } finally {
      setMigrationInProgress(false);
    }
  };

  // Calculate migration summary
  const migrationSummary = useMemo(() => {
    const success = migrationStatuses.filter(s => s.status === 'success').length;
    const error = migrationStatuses.filter(s => s.status === 'error').length;
    const total = migrationStatuses.length;

    return { success, error, total };
  }, [migrationStatuses]);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50/80 dark:bg-black/80 transition-colors duration-300">
        <Header />
      <div className="flex">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          userRole={user?.role === 'super_admin' ? 'super-admin' : (user?.role as 'user' | 'admin') || 'user'}
        />
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/tasks')}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Tasks
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Server className="h-6 w-6" />
                    Device Migration
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Batch move devices between organizational units
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={syncing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                Sync Devices
              </Button>
            </div>

            {/* Sync Progress */}
            {(loading || syncing) && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm font-medium">
                        {syncing
                          ? 'Syncing device information from Google...'
                          : 'Loading device information...'}
                      </span>
                    </div>
                    {syncing && (
                      <span className="text-sm text-gray-500">{syncProgress}%</span>
                    )}
                  </div>
                  <Progress value={syncing ? syncProgress : undefined} className="h-2" />
                  <p className="text-xs text-gray-500 mt-2">
                    {syncing
                      ? 'This ensures you have the most up-to-date device information'
                      : 'Please wait while we load the initial data.'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Info Banner */}
            {!loading && !syncing && chromebooks.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-medium mb-1">Device sync complete</p>
                    <p>{chromebooks.length} devices loaded. Enter device identifiers below and select a target organizational unit.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content */}
            {!loading && !syncing && chromebooks.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Device Input */}
                <Card>
                  <CardHeader>
                    <CardTitle>Device Identifiers</CardTitle>
                    <CardDescription>
                      Enter asset tags or serial numbers, one per line
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Enter device identifiers...&#10;Example:&#10;CB-123456&#10;5CD1234567&#10;CB-789012"
                      value={deviceInput}
                      onChange={(e) => setDeviceInput(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                    />

                    {deviceInput && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span className="text-green-700 dark:text-green-400">
                            {validDevices.length} valid device{validDevices.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {parseDeviceInput().invalid.length > 0 && (
                          <div className="flex items-start gap-2 text-sm">
                            <X className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <span className="text-red-700 dark:text-red-400">
                                {parseDeviceInput().invalid.length} invalid identifier{parseDeviceInput().invalid.length !== 1 ? 's' : ''}:
                              </span>
                              <div className="text-xs text-red-600 dark:text-red-300 mt-1">
                                {parseDeviceInput().invalid.join(', ')}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Right Column - Org Unit Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>Target Organization Unit</CardTitle>
                    <CardDescription>
                      Select the destination organizational unit
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg p-2 max-h-[400px] overflow-y-auto">
                      {orgUnitTree.map(node => renderOrgUnitNode(node))}
                    </div>

                    {selectedOrgUnit && (
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                          <FolderTree className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span className="font-medium text-blue-800 dark:text-blue-300">
                            Selected: {selectedOrgUnit === '/' ? 'Root' : selectedOrgUnit}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Migration Button */}
            {!loading && !syncing && chromebooks.length > 0 && (
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={handleMigration}
                  disabled={!canMigrate}
                  size="lg"
                  className="min-w-[200px]"
                >
                  {migrationInProgress ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Server className="h-4 w-4 mr-2" />
                      Migrate {validDevices.length} Device{validDevices.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Migration Progress Modal */}
      <Dialog open={showMigrationModal} onOpenChange={setShowMigrationModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Device Migration Progress</DialogTitle>
            <DialogDescription>
              Moving devices to {selectedOrgUnit === '/' ? 'Root' : selectedOrgUnit}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-2">
              {migrationStatuses.map((status, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{status.device}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {status.sourceOu} → {status.targetOu}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {status.status === 'pending' && (
                      <span className="text-sm text-gray-500">Pending</span>
                    )}
                    {status.status === 'processing' && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        <span className="text-sm text-blue-600">Processing</span>
                      </>
                    )}
                    {status.status === 'success' && (
                      <>
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600">Success</span>
                      </>
                    )}
                    {status.status === 'error' && (
                      <>
                        <X className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-red-600">{status.message || 'Failed'}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {migrationComplete && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Migration Complete</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Successfully moved {migrationSummary.success} of {migrationSummary.total} devices
                    {migrationSummary.error > 0 && ` (${migrationSummary.error} failed)`}
                  </p>
                </div>
                <Button onClick={() => setShowMigrationModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </ThemeProvider>
  );
};

export default DeviceMigrationPage;

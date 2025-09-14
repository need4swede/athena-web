import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
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
  AlertTriangle,
  Check,
  X,
  Info,
  Loader2,
  RotateCcw
} from 'lucide-react';

// Reset status type
interface ResetStatus {
  device: string;
  orgUnit: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  message?: string;
}

const DeviceResetPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { chromebooks, loading, syncing, syncProgress, refetch } = useChromebooks();

  const [activeSection, setActiveSection] = useState('tasks');
  const [deviceInput, setDeviceInput] = useState('');
  const [selectedOrgUnits, setSelectedOrgUnits] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['/']));
  const [resetInProgress, setResetInProgress] = useState(false);
  const [resetStatuses, setResetStatuses] = useState<ResetStatus[]>([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

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

  // Toggle org unit selection
  const toggleOrgUnitSelection = useCallback((orgUnitPath: string) => {
    setSelectedOrgUnits(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orgUnitPath)) {
        newSet.delete(orgUnitPath);
      } else {
        newSet.add(orgUnitPath);
      }
      return newSet;
    });
  }, []);

  // Render org unit tree node with checkboxes
  const renderOrgUnitNode = useCallback((node: OrgUnitTreeNode, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.orgUnitPath);
    const isSelected = selectedOrgUnits.has(node.orgUnitPath);
    const deviceCount = chromebooks.filter(c => c.orgUnit === node.orgUnitPath).length;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 py-2 px-3 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
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
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleOrgUnitSelection(node.orgUnitPath)}
            className="mr-2"
          />
          <FolderTree className="h-4 w-4 flex-shrink-0" />
          <span 
            className="text-sm truncate flex-1 cursor-pointer"
            onClick={() => toggleOrgUnitSelection(node.orgUnitPath)}
          >
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
  }, [expandedNodes, selectedOrgUnits, chromebooks, toggleNode, toggleOrgUnitSelection]);

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

  // Get all devices from selected org units
  const getDevicesFromSelectedOrgUnits = useCallback((): string[] => {
    const devices: string[] = [];
    selectedOrgUnits.forEach(orgUnit => {
      const ouDevices = chromebooks.filter(c => c.orgUnit === orgUnit);
      ouDevices.forEach(device => {
        devices.push(device.assetTag);
      });
    });
    return devices;
  }, [selectedOrgUnits, chromebooks]);

  // Get all device identifiers to reset
  const getAllDeviceIdentifiers = useCallback((): string[] => {
    const manualDevices = parseDeviceInput().valid;
    const ouDevices = getDevicesFromSelectedOrgUnits();
    // Combine and deduplicate
    const allDevices = [...new Set([...manualDevices, ...ouDevices])];
    return allDevices;
  }, [parseDeviceInput, getDevicesFromSelectedOrgUnits]);

  // Get parsed device count
  const totalDevices = getAllDeviceIdentifiers();
  const canReset = totalDevices.length > 0 && !resetInProgress;

  // Handle reset
  const handleReset = async () => {
    if (!canReset || !token) return;

    setResetInProgress(true);
    setResetComplete(false);
    setShowResetModal(true);
    setResetStatuses([]);

    try {
      // Prepare device list for reset
      const deviceIdentifiers = totalDevices;
      const statuses: ResetStatus[] = [];

      // Initialize statuses
      deviceIdentifiers.forEach(identifier => {
        const device = chromebooks.find(
          c => c.serialNumber.toLowerCase() === identifier.toLowerCase() ||
               c.assetTag.toLowerCase() === identifier.toLowerCase()
        );

        if (device) {
          statuses.push({
            device: `${device.assetTag} (${device.serialNumber})`,
            orgUnit: device.orgUnit || 'Unknown',
            status: 'pending'
          });
        }
      });

      setResetStatuses(statuses);

      // Call API to reset all devices at once
      try {
        const response = await fetch('/api/google/devices/reset', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            deviceIdentifiers
          })
        });

        if (response.ok) {
          const result = await response.json();
          
          // Update statuses based on the result
          const updatedStatuses: ResetStatus[] = [];
          
          // Process successful resets
          if (result.results?.success) {
            result.results.success.forEach((device: any) => {
              const existingStatus = statuses.find(s => 
                s.device.includes(device.annotatedAssetId) || 
                s.device.includes(device.deviceId)
              );
              if (existingStatus) {
                updatedStatuses.push({
                  ...existingStatus,
                  status: 'success',
                  message: 'Successfully reset'
                });
              }
            });
          }
          
          // Process failed resets
          if (result.results?.failure) {
            result.results.failure.forEach((device: any) => {
              const existingStatus = statuses.find(s => 
                s.device.includes(device.annotatedAssetId) || 
                s.device.includes(device.deviceId)
              );
              if (existingStatus) {
                updatedStatuses.push({
                  ...existingStatus,
                  status: 'error',
                  message: device.reason || 'Failed to reset'
                });
              }
            });
          }
          
          setResetStatuses(updatedStatuses);
        } else {
          const error = await response.json();
          throw new Error(error.message || 'Failed to reset devices');
        }
      } catch (error) {
        // Set all devices to error state
        setResetStatuses(statuses.map(s => ({
          ...s,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })));
      }

      setResetComplete(true);

      // Refresh chromebooks data after reset
      setTimeout(() => {
        refetch();
      }, 2000);

    } catch (error) {
      console.error('Reset error:', error);
    } finally {
      setResetInProgress(false);
    }
  };

  // Calculate reset summary
  const resetSummary = useMemo(() => {
    const success = resetStatuses.filter(s => s.status === 'success').length;
    const error = resetStatuses.filter(s => s.status === 'error').length;
    const total = resetStatuses.length;

    return { success, error, total };
  }, [resetStatuses]);

  // Calculate selected devices summary
  const selectedDevicesSummary = useMemo(() => {
    const manual = parseDeviceInput().valid.length;
    const fromOUs = getDevicesFromSelectedOrgUnits().length;
    const total = getAllDeviceIdentifiers().length;
    
    return { manual, fromOUs, total };
  }, [parseDeviceInput, getDevicesFromSelectedOrgUnits, getAllDeviceIdentifiers]);

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
                    <RotateCcw className="h-6 w-6" />
                    Device Reset
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Reset devices by wiping user data
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

            {/* Warning Banner */}
            {!loading && !syncing && chromebooks.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800 dark:text-yellow-300">
                    <p className="font-medium mb-1">Warning: Device Reset</p>
                    <p>This action will wipe all user data from the selected devices. This operation cannot be undone.</p>
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
                    <CardTitle>Manual Device Selection</CardTitle>
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
                            {parseDeviceInput().valid.length} valid device{parseDeviceInput().valid.length !== 1 ? 's' : ''}
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
                    <CardTitle>Organizational Unit Selection</CardTitle>
                    <CardDescription>
                      Select organizational units to reset all devices within
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg p-2 max-h-[400px] overflow-y-auto">
                      {orgUnitTree.map(node => renderOrgUnitNode(node))}
                    </div>

                    {selectedOrgUnits.size > 0 && (
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex items-center gap-2 text-sm mb-2">
                          <FolderTree className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span className="font-medium text-blue-800 dark:text-blue-300">
                            Selected {selectedOrgUnits.size} organizational unit{selectedOrgUnits.size !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-200">
                          {getDevicesFromSelectedOrgUnits().length} devices from selected OUs
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Device Summary and Reset Button */}
            {!loading && !syncing && chromebooks.length > 0 && (
              <div className="mt-6">
                {totalDevices.length > 0 && (
                  <Card className="mb-4">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium mb-2">Total Devices Selected</h4>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            <p>{selectedDevicesSummary.manual} from manual input</p>
                            <p>{selectedDevicesSummary.fromOUs} from organizational units</p>
                            <p className="font-medium text-gray-900 dark:text-white pt-1">
                              {selectedDevicesSummary.total} unique device{selectedDevicesSummary.total !== 1 ? 's' : ''} to reset
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={handleReset}
                          disabled={!canReset}
                          size="lg"
                          variant="destructive"
                          className="min-w-[200px]"
                        >
                          {resetInProgress ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Reset {totalDevices.length} Device{totalDevices.length !== 1 ? 's' : ''}
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Reset Progress Modal */}
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Device Reset Progress</DialogTitle>
            <DialogDescription>
              Wiping user data from selected devices
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-2">
              {resetStatuses.map((status, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{status.device}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {status.orgUnit}
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

          {resetComplete && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Reset Complete</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Successfully reset {resetSummary.success} of {resetSummary.total} devices
                    {resetSummary.error > 0 && ` (${resetSummary.error} failed)`}
                  </p>
                </div>
                <Button onClick={() => setShowResetModal(false)}>
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

export default DeviceResetPage;

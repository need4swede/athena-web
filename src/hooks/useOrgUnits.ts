import { useState, useEffect, useCallback, useRef } from 'react';
import { OrgUnit, OrgUnitTreeNode } from '@/types/orgUnit';
import { useAuth } from '@/components/sso/SSOProvider';

export const useOrgUnits = () => {
    const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
    const [orgUnitTree, setOrgUnitTree] = useState<OrgUnitTreeNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncingOrgUnits, setSyncingOrgUnits] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [isInitialSync, setIsInitialSync] = useState(false);
    const { isAdmin, token } = useAuth();
    const hasInitialSyncRef = useRef(false);

    // Function to build a tree structure from flat org units
    const buildOrgUnitTree = (orgUnits: OrgUnit[]): OrgUnitTreeNode[] => {
        // Create a map for quick lookup
        const orgUnitMap: Record<string, OrgUnitTreeNode> = {};

        // First pass: create tree nodes with empty children arrays
        orgUnits.forEach(ou => {
            orgUnitMap[ou.orgUnitPath] = {
                ...ou,
                children: [],
                level: ou.orgUnitPath.split('/').filter(Boolean).length
            };
        });

        // Second pass: build the tree structure
        const rootNodes: OrgUnitTreeNode[] = [];

        Object.values(orgUnitMap).forEach(node => {
            // Root node (usually '/')
            if (!node.parentOrgUnitPath || node.parentOrgUnitPath === node.orgUnitPath) {
                rootNodes.push(node);
            }
            // Child node
            else if (orgUnitMap[node.parentOrgUnitPath]) {
                orgUnitMap[node.parentOrgUnitPath].children.push(node);
            }
            // Orphaned node (parent doesn't exist in our data)
            else {
                rootNodes.push(node);
            }
        });

        // Sort children by name
        const sortChildren = (nodes: OrgUnitTreeNode[]) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name));
            nodes.forEach(node => {
                if (node.children.length > 0) {
                    sortChildren(node.children);
                }
            });
        };

        sortChildren(rootNodes);
        return rootNodes;
    };

    // Transform API data to frontend format
    const transformOrgUnits = (data: any[]): OrgUnit[] => {
        return data.map((item: any) => ({
            id: item.orgUnitId || item.orgUnitPath || Math.random().toString(36).substring(2, 9),
            name: item.name || 'Unknown',
            description: item.description || '',
            parentOrgUnitId: item.parentOrgUnitId,
            parentOrgUnitPath: item.parentOrgUnitPath,
            orgUnitPath: item.orgUnitPath || '/',
            orgUnitId: item.orgUnitId || item.orgUnitPath,
            blockInheritance: item.blockInheritance || false
        }));
    };

    // Background sync function with progress tracking and individual org unit indicators
    const backgroundSync = useCallback(async () => {
        if (!isAdmin || !token || syncing) return;

        try {
            setSyncing(true);
            setSyncProgress(0);
            console.log('🔄 Starting background sync for org units...');

            // Set all current org units as syncing to show individual indicators
            const currentOrgUnitPaths = new Set(orgUnits.map(ou => ou.orgUnitPath));
            setSyncingOrgUnits(currentOrgUnitPaths);

            // Progress simulation: 1% every 0.1 seconds (100ms)
            // Reaches 10% after 1 second, pauses at 99% until API finishes
            let currentProgress = 0;
            const progressInterval = setInterval(() => {
                currentProgress += 1;
                if (currentProgress <= 99) {
                    setSyncProgress(currentProgress);
                }
                // Stop incrementing at 99%, pause until API call finishes
            }, 100); // 100ms intervals (0.1 seconds)

            const response = await fetch('/api/org-units/sync', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            clearInterval(progressInterval);

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Background sync completed:', result);

                // Refresh data from database after sync (without triggering another sync)
                await fetchOrgUnitsFromDatabaseOnly();

                // Complete progress to 100%
                setSyncProgress(100);

                // Hang at 100% for 1 second before clearing
                setTimeout(() => {
                    setSyncProgress(0);
                }, 1000);
            } else {
                console.error('❌ Background sync failed:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Background sync error:', error);
        } finally {
            setSyncing(false);
            setSyncingOrgUnits(new Set());
        }
    }, [isAdmin, token, syncing, orgUnits]);

    // Fetch org units from database only (no sync trigger)
    const fetchOrgUnitsFromDatabaseOnly = useCallback(async () => {
        if (!isAdmin || !token) return;

        try {
            const response = await fetch('/api/org-units', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch org units');
            }

            // Transform and set the data
            const transformedData = transformOrgUnits(data.data || []);
            setOrgUnits(transformedData);

            // Build the org unit tree
            const tree = buildOrgUnitTree(transformedData);
            setOrgUnitTree(tree);

            return { success: true, data: transformedData, source: 'database' };
        } catch (err) {
            console.error('Error fetching org units:', err);
            setError(`Error fetching organizational units: ${err instanceof Error ? err.message : 'Unknown error'}`);
            throw err;
        }
    }, [isAdmin, token]);

    // Main fetch function (called on initial load)
    const fetchOrgUnits = useCallback(async () => {
        if (!isAdmin) {
            setError("Admin access required");
            return;
        }

        if (!token) {
            setError("Authentication token required");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const data = await fetchOrgUnitsFromDatabaseOnly();

            // Auto-sync behavior: always trigger background refresh when data exists
            if (data && data.source === 'database' && data.data && data.data.length > 0 && !hasInitialSyncRef.current) {
                hasInitialSyncRef.current = true;
                setIsInitialSync(false); // Background refresh uses minimal loading bar
                // Start background sync after a short delay
                setTimeout(() => {
                    backgroundSync();
                }, 1000);
            }

        } catch (err) {
            setOrgUnits([]);
            setOrgUnitTree([]);
            setError(`Error fetching organizational units: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [isAdmin, token, fetchOrgUnitsFromDatabaseOnly, backgroundSync]);

    // Manual refresh function (for refresh button)
    const refreshOrgUnits = useCallback(async () => {
        if (!isAdmin || !token) return;

        try {
            setLoading(true);
            setError(null);
            setIsInitialSync(true); // Manual refresh shows big progress bar

            // First get fresh data from database
            await fetchOrgUnitsFromDatabaseOnly();

            // Then trigger background sync
            await backgroundSync();

        } catch (err) {
            setError(`Error refreshing organizational units: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [isAdmin, token, fetchOrgUnitsFromDatabaseOnly, backgroundSync]);

    // Initial load
    useEffect(() => {
        if (isAdmin && token) {
            fetchOrgUnits();
        }
    }, [isAdmin, token]); // Removed fetchOrgUnits from dependencies to prevent loops

    // Reset sync flag when user changes
    useEffect(() => {
        hasInitialSyncRef.current = false;
    }, [isAdmin, token]);

    return {
        orgUnits,
        orgUnitTree,
        loading,
        syncing,
        syncProgress,
        syncingOrgUnits,
        error,
        isInitialSync,
        refetch: refreshOrgUnits
    };
};

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chromebook } from '@/types/chromebook';
import { useAuth } from '@/components/sso/SSOProvider';
import { useEventListener, GLOBAL_EVENTS } from './useGlobalEvents';

export const useChromebooks = () => {
    const [chromebooks, setChromebooks] = useState<Chromebook[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncingDevices, setSyncingDevices] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [isInitialSync, setIsInitialSync] = useState(false);
    const { isAdmin, token, user } = useAuth();
    const hasInitialSyncRef = useRef(false);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isSyncingRef = useRef(false);

    // Transform API data to frontend format
    const transformChromebooks = (data: any[]): Chromebook[] => {
        return data.map((item: any) => {
            // Parse recentUsers if it's a string
            let recentUsers = item.recentUsers || item.recent_users;
            if (typeof recentUsers === 'string') {
                try {
                    recentUsers = JSON.parse(recentUsers);
                } catch (e) {
                    recentUsers = [];
                }
            }
            if (!Array.isArray(recentUsers)) {
                recentUsers = [];
            }

            // Parse lastKnownNetwork if it's a string
            let lastKnownNetwork = item.lastKnownNetwork || item.last_known_network;
            if (typeof lastKnownNetwork === 'string') {
                try {
                    lastKnownNetwork = JSON.parse(lastKnownNetwork);
                } catch (e) {
                    lastKnownNetwork = [];
                }
            }
            if (!Array.isArray(lastKnownNetwork)) {
                lastKnownNetwork = [];
            }

            // Compute most recent user from recentUsers array
            const mostRecentUser = recentUsers.length > 0 ? recentUsers[0].email : null;

            const transformedItem = {
                id: item.id?.toString() || item.deviceId || Math.random().toString(36).substring(2, 9),
                assetTag: item.asset_tag || item.annotatedAssetId || `CB-${item.serial_number?.slice(-6) || 'UNKNOWN'}`,
                serialNumber: item.serial_number || item.serialNumber || 'Unknown',
                model: item.model || 'Unknown',
                orgUnit: item.org_unit || item.orgUnitPath || '/',
                status: mapStatus(item.status),
                currentUser: (item.currentUser && item.currentUser.id) ? item.currentUser : (item.current_user_id ? {
                    id: item.current_user_id,
                    studentId: item.student_id,
                    firstName: item.first_name,
                    lastName: item.last_name,
                    email: item.student_email,
                    gradeLevel: item.grade_level
                } : null),
                checkedOutDate: item.checked_out_date ? new Date(item.checked_out_date) : null,
                isInsured: Boolean(item.is_insured),
                notes: item.notes ? [{ id: '1', note: item.notes, created_at: new Date(item.updated_at || Date.now()) }] : [],
                insurance_status: item.insurance_status,
                // Additional Google API fields
                bootMode: item.bootMode || item.boot_mode,
                lastEnrollmentTime: item.lastEnrollmentTime || item.last_enrollment_time,
                supportEndDate: item.supportEndDate || item.support_end_date,
                orderNumber: item.orderNumber || item.order_number,
                willAutoRenew: item.willAutoRenew !== undefined ? item.willAutoRenew : item.will_auto_renew,
                meid: item.meid,
                etag: item.etag,
                activeTimeRanges: item.activeTimeRanges || item.active_time_ranges,
                cpuStatusReports: item.cpuStatusReports || item.cpu_status_reports,
                diskVolumeReports: item.diskVolumeReports || item.disk_volume_reports,
                systemRamTotal: item.systemRamTotal || item.system_ram_total,
                systemRamFreeReports: item.systemRamFreeReports || item.system_ram_free_reports,
                history: [],
                tags: item.tags || [],
                lastUpdated: item.updated_at ? new Date(item.updated_at) : new Date(),
                assignedLocation: item.assigned_location || item.orgUnitPath?.split('/').pop() || 'Unknown',
                // Google Admin specific fields
                deviceId: item.device_id || item.deviceId,
                lastSync: item.last_sync || item.lastSync ? new Date(item.last_sync || item.lastSync) : undefined,
                platformVersion: item.platform_version || item.platformVersion,
                osVersion: item.os_version || item.osVersion,
                firmwareVersion: item.firmware_version || item.firmwareVersion,
                macAddress: item.mac_address || item.macAddress,
                lastKnownNetwork: lastKnownNetwork,
                // New fields from Google API
                annotatedUser: item.annotatedUser || item.annotated_user,
                annotatedAssetId: item.annotatedAssetId || item.annotated_asset_id,
                recentUsers: recentUsers,
                orgUnitPath: item.orgUnitPath || item.org_unit_path,
                // Computed field for most recent user
                mostRecentUser: mostRecentUser,
                // Keep lastKnownUser for backward compatibility
                lastKnownUser: item.last_known_user || item.annotatedUser || item.lastKnownUser
            };


            return transformedItem;
        });
    };

    // Map status values
    const mapStatus = (status: string): Chromebook['status'] => {
        const statusMap: Record<string, Chromebook['status']> = {
            'ACTIVE': 'available',
            'DEPROVISIONED': 'deprovisioned',
            'DISABLED': 'disabled',
            'UNKNOWN': 'available',
            'checked_out': 'checked-out',
            'available': 'available',
            'maintenance': 'maintenance',
            'retired': 'deprovisioned', // Map old 'retired' to new 'deprovisioned'
            'deprovisioned': 'deprovisioned',
            'disabled': 'disabled',
            'pending': 'pending',
            'pending_signature': 'pending_signature'
        };
        return statusMap[status] || 'available';
    };

    // Fetch chromebooks from database (synced from Google)
    const fetchChromebooksFromDatabase = useCallback(async () => {
        if (!token) return;

        try {
            console.log('🔍 Fetching chromebooks from database...');

            const response = await fetch('/api/chromebooks', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Database response:', result);

            // Handle different response formats
            let data = result;
            if (Array.isArray(result)) {
                data = result;
            } else if (result.data && Array.isArray(result.data)) {
                data = result.data;
            } else {
                throw new Error('Invalid response format - expected array of devices');
            }

            // Transform and set the data
            const transformedData = transformChromebooks(data);
            setChromebooks(transformedData);
            console.log(`✅ Loaded ${transformedData.length} chromebooks from database`);

            return { success: true, data: transformedData, source: 'database' };
        } catch (err) {
            console.error('❌ Error fetching chromebooks from database:', err);
            setError(`Error fetching chromebooks: ${err instanceof Error ? err.message : 'Unknown error'}`);
            throw err;
        }
    }, [token]);

    // Background sync function with progress tracking
    const backgroundSync = useCallback(async () => {
        // Prevent concurrent syncs using ref
        if (!token || isSyncingRef.current) {
            console.log('🚫 Sync already in progress or no token, skipping...');
            return;
        }

        try {
            isSyncingRef.current = true;
            setSyncing(true);
            setSyncProgress(0);
            console.log('🔄 Starting background sync for chromebooks...');

            // Clear any existing progress interval
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            // Set all current devices as syncing to show individual indicators
            const currentDeviceSerials = new Set(chromebooks.map(c => c.serialNumber));
            setSyncingDevices(currentDeviceSerials);

            // Enhanced progress simulation with smoother curve
            let currentProgress = 0;
            const startTime = Date.now();

            progressIntervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const duration = 23000; // Expected 24 seconds for sync

                // Use a logarithmic curve for more realistic progress
                const rawProgress = Math.min(elapsed / duration, 0.99);
                const smoothProgress = Math.log(rawProgress * 9 + 1) / Math.log(10);
                currentProgress = Math.round(smoothProgress * 99);

                if (currentProgress <= 99) {
                    setSyncProgress(currentProgress);
                }
            }, 100); // Update every 100ms for smoother animation

            const response = await fetch('/api/google/sync/chromebooks', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            // Clear the progress interval
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Background sync completed:', result);

                // Refresh data from database after sync
                await fetchChromebooksFromDatabase();

                // Complete progress to 100%
                setSyncProgress(100);

                // Hang at 100% for 1 second before clearing
                setTimeout(() => {
                    setSyncProgress(0);
                    setSyncing(false);
                    isSyncingRef.current = false;
                }, 1000);
            } else {
                console.error('❌ Background sync failed:', response.statusText);
                setSyncProgress(0);
                setSyncing(false);
                isSyncingRef.current = false;
            }
        } catch (error) {
            console.error('❌ Background sync error:', error);
            // Clear interval on error
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            setSyncProgress(0);
            setSyncing(false);
            isSyncingRef.current = false;
        } finally {
            setSyncingDevices(new Set());
        }
    }, [token, chromebooks, fetchChromebooksFromDatabase]);

    // Main fetch function (called on initial load)
    const fetchChromebooks = useCallback(async () => {
        if (!token) {
            setError("Authentication token required");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Get data from database only - no automatic sync
            await fetchChromebooksFromDatabase();

        } catch (err) {
            setChromebooks([]);
            setError(`Error fetching chromebooks: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [token, fetchChromebooksFromDatabase]);

    // Manual refresh function (for refresh button)
    const refreshChromebooks = useCallback(async () => {
        if (!token) return;

        try {
            setLoading(true);
            setError(null);
            setIsInitialSync(true); // Manual refresh shows big progress bar

            // Trigger background sync to get fresh data from Google
            await backgroundSync();

            // Then get updated data from database
            await fetchChromebooksFromDatabase();

        } catch (err) {
            setError(`Error refreshing chromebooks: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [token, backgroundSync, fetchChromebooksFromDatabase]);

    // Initial load
    useEffect(() => {
        if (token) {
            fetchChromebooks();
        }
    }, [token, fetchChromebooks]);

    // Reset sync flag when user changes
    useEffect(() => {
        hasInitialSyncRef.current = false;
    }, [isAdmin, token]);

    // Listen for global events to auto-refresh when devices are auto-populated
    useEventListener(GLOBAL_EVENTS.CHROMEBOOKS_REFRESH_NEEDED, useCallback(() => {
        console.log('📡 [Chromebooks] Received refresh event - auto-refreshing chromebooks list');
        fetchChromebooksFromDatabase().catch(error => {
            console.error('❌ [Chromebooks] Auto-refresh failed:', error);
        });
    }, [fetchChromebooksFromDatabase]));

    // Listen for device auto-population events for additional logging
    useEventListener(GLOBAL_EVENTS.DEVICES_AUTO_POPULATED, useCallback((data: any) => {
        console.log(`📡 [Chromebooks] ${data.count} devices auto-populated from search: "${data.query}"`);
    }, []));

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Clear any running intervals
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            // Reset sync state
            isSyncingRef.current = false;
        };
    }, []);

    return {
        chromebooks,
        loading,
        syncing,
        syncProgress,
        syncingDevices,
        error,
        isInitialSync,
        refetch: refreshChromebooks
    };
};

export const useDashboardStats = () => {
    const [stats, setStats] = useState({
        totalChromebooks: 0,
        available: 0,
        checkedOut: 0,
        maintenance: 0,
        insured: 0,
        overdue: 0,
        pending: 0
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { token } = useAuth();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                setError(null);

                const headers: HeadersInit = {
                    'Content-Type': 'application/json'
                };

                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const response = await fetch('/api/dashboard/stats', {
                    headers
                });

                const defaultStats = {
                    totalChromebooks: 0,
                    available: 0,
                    checkedOut: 0,
                    maintenance: 0,
                    insured: 0,
                    overdue: 0,
                    pending: 0
                };

                if (!response.ok) {
                    setStats(defaultStats);
                    return;
                }

                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    setStats(defaultStats);
                    return;
                }

                setStats({
                    totalChromebooks: data?.totalChromebooks || 0,
                    available: data?.available || 0,
                    checkedOut: data?.checkedOut || 0,
                    maintenance: data?.maintenance || 0,
                    insured: data?.insured || 0,
                    overdue: data?.overdue || 0,
                    pending: data?.pending || 0
                });
            } catch (err) {
                setStats({
                    totalChromebooks: 0,
                    available: 0,
                    checkedOut: 0,
                    maintenance: 0,
                    insured: 0,
                    overdue: 0,
                    pending: 0
                });
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [token]);

    return {
        stats,
        loading,
        error
    };
};

export const useRecentActivity = () => {
    const [activities, setActivities] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { token } = useAuth();

    useEffect(() => {
        const fetchActivities = async () => {
            try {
                setLoading(true);
                setError(null);

                const headers: HeadersInit = {
                    'Content-Type': 'application/json'
                };

                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const response = await fetch('/api/dashboard/activity', {
                    headers
                });

                if (!response.ok) {
                    setActivities([]);
                    return;
                }

                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    setActivities([]);
                    return;
                }

                if (!Array.isArray(data)) {
                    setActivities([]);
                    return;
                }

                setActivities(data);
            } catch (err) {
                setActivities([]);
            } finally {
                setLoading(false);
            }
        };

        fetchActivities();
    }, [token]);

    return {
        activities,
        loading,
        error
    };
};

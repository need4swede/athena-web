import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleUser } from '@/types/user';
import { useAuth } from '@/components/sso/SSOProvider';
import { useEventListener, GLOBAL_EVENTS } from './useGlobalEvents';

export const useUsers = () => {
    const [users, setUsers] = useState<GoogleUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncingUsers, setSyncingUsers] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [isInitialSync, setIsInitialSync] = useState(false);
    const { isAdmin, token, user } = useAuth();
    const hasInitialSyncRef = useRef(false);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isSyncingRef = useRef(false);

    // Transform API data to frontend format
    const transformUsers = (data: any[]): GoogleUser[] => {
        return data.map((item: any) => ({
            id: item.id || item.primaryEmail || Math.random().toString(36).substring(2, 9),
            student_id: item.student_id,
            student_db_id: item.student_db_id,
            primaryEmail: item.primaryEmail || '',
            name: {
                fullName: item.name?.fullName || item.fullName || 'Unknown User',
                givenName: item.name?.givenName || item.givenName || '',
                familyName: item.name?.familyName || item.familyName || ''
            },
            suspended: Boolean(item.suspended),
            orgUnitPath: item.orgUnitPath || '/',
            isAdmin: item.isAdmin || false,
            isDelegatedAdmin: item.isDelegatedAdmin || false,
            lastLoginTime: item.lastLoginTime,
            creationTime: item.creationTime,
            agreedToTerms: item.agreedToTerms || false,
            archived: item.archived || false,
            changePasswordAtNextLogin: item.changePasswordAtNextLogin || false,
            ipWhitelisted: item.ipWhitelisted || false,
            emails: item.emails || [],
            organizations: item.organizations || [],
            phones: item.phones || [],
            addresses: item.addresses || [],
            isEnrolledIn2Sv: item.isEnrolledIn2Sv || false,
            isEnforcedIn2Sv: item.isEnforcedIn2Sv || false,
            includeInGlobalAddressList: item.includeInGlobalAddressList !== false
        }));
    };

    // Fetch users from database only (no sync trigger)
    const fetchUsersFromDatabaseOnly = useCallback(async () => {
        if (!token) return;

        try {
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error('Invalid response format - expected array');
            }

            // Transform and set the data
            const transformedData = transformUsers(data);
            setUsers(transformedData);

            return { success: true, data: transformedData, source: 'database' };
        } catch (err) {
            console.error('Error fetching users:', err);
            setError(`Error fetching users: ${err instanceof Error ? err.message : 'Unknown error'}`);
            throw err;
        }
    }, [token]);

    // Background sync function with progress tracking and individual user indicators
    const backgroundSync = useCallback(async () => {
        // Prevent concurrent syncs using ref
        if (!token || isSyncingRef.current) {
            console.log('🚫 User sync already in progress or no token, skipping...');
            return;
        }

        try {
            isSyncingRef.current = true;
            setSyncing(true);
            setSyncProgress(0);
            console.log('🔄 Starting background sync for users...');

            // Clear any existing progress interval
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            // Set all current users as syncing to show individual indicators
            const currentUserEmails = new Set(users.map(u => u.primaryEmail));
            setSyncingUsers(currentUserEmails);

            // Enhanced progress simulation with smoother curve
            let currentProgress = 0;
            const startTime = Date.now();

            progressIntervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const duration = 20000; // Expected 20 seconds for user sync

                // Use a logarithmic curve for more realistic progress
                const rawProgress = Math.min(elapsed / duration, 0.99);
                const smoothProgress = Math.log(rawProgress * 9 + 1) / Math.log(10);
                currentProgress = Math.round(smoothProgress * 99);

                if (currentProgress <= 99) {
                    setSyncProgress(currentProgress);
                }
            }, 100); // Update every 100ms for smoother animation

            const response = await fetch('/api/google/sync/users', {
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

                // Refresh data from database after sync (without triggering another sync)
                await fetchUsersFromDatabaseOnly();

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
            setSyncingUsers(new Set());
        }
    }, [token, users, fetchUsersFromDatabaseOnly]);

    // Main fetch function (called on initial load)
    const fetchUsers = useCallback(async () => {
        if (!token) {
            setError("Authentication token required");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Get data from database only - no automatic sync
            await fetchUsersFromDatabaseOnly();

        } catch (err) {
            setUsers([]);
            setError(`Error fetching users: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [token, fetchUsersFromDatabaseOnly]);

    // Manual refresh function (for refresh button)
    const refreshUsers = useCallback(async () => {
        if (!token) return;

        try {
            setLoading(true);
            setError(null);
            setIsInitialSync(true); // Manual refresh shows big progress bar

            // First get fresh data from database
            await fetchUsersFromDatabaseOnly();

            // Then trigger background sync
            await backgroundSync();

        } catch (err) {
            setError(`Error refreshing users: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [token, fetchUsersFromDatabaseOnly, backgroundSync]);

    // Initial load
    useEffect(() => {
        if (token) {
            fetchUsers();
        }
    }, [token, fetchUsers]);

    // Reset sync flag when user changes
    useEffect(() => {
        hasInitialSyncRef.current = false;
    }, [isAdmin, token]);

    // Listen for global events to auto-refresh when students are auto-populated
    useEventListener(GLOBAL_EVENTS.USERS_REFRESH_NEEDED, useCallback(() => {
        console.log('📡 [Users] Received refresh event - auto-refreshing users list');
        fetchUsersFromDatabaseOnly().catch(error => {
            console.error('❌ [Users] Auto-refresh failed:', error);
        });
    }, [fetchUsersFromDatabaseOnly]));

    // Listen for student auto-population events for additional logging
    useEventListener(GLOBAL_EVENTS.STUDENTS_AUTO_POPULATED, useCallback((data: any) => {
        console.log(`📡 [Users] ${data.count} students auto-populated from search: "${data.query}"`);
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
        users,
        loading,
        syncing,
        syncProgress,
        syncingUsers,
        error,
        isInitialSync,
        refetch: refreshUsers,
        refetchFromDatabase: fetchUsersFromDatabaseOnly
    };
};

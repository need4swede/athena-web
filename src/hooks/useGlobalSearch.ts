import { useState, useEffect } from 'react';
import { useDebounce } from './useDebounce';
import { useEventEmitter, GLOBAL_EVENTS } from './useGlobalEvents';
import { GoogleUser } from '@/types/user';
import { Chromebook } from '@/types/chromebook';
import { useAuth } from '@/components/sso/SSOProvider';

interface HybridSearchStudent {
    id: string | number;
    studentId: string;
    firstName: string;
    lastName: string;
    email: string;
    gradeLevel?: number;
    fullName?: string;
    source?: 'local' | 'google';
    createdAt?: string;
}

interface SearchResults {
    users: GoogleUser[];
    devices: Chromebook[];
    metadata?: {
        searchQuery?: string;
        searchIntent?: 'student' | 'device' | 'both';
        localUserCount?: number;
        localDeviceCount?: number;
        syncInProgress?: boolean;
        syncStudents?: boolean;
        syncDevices?: boolean;
        source?: 'instant';
    };
    syncing?: {
        users: boolean;
        devices: boolean;
    };
}

export const useGlobalSearch = (query: string) => {
    const { token } = useAuth();
    const { emit } = useEventEmitter();
    const [results, setResults] = useState<SearchResults>({ users: [], devices: [] });
    const [loading, setLoading] = useState(false);
    const [backgroundSyncing, setBackgroundSyncing] = useState(false);
    const [syncingQuery, setSyncingQuery] = useState<string | null>(null);
    const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);
    const [error, setError] = useState<string | null>(null);
    const debouncedQuery = useDebounce(query, 100);

    useEffect(() => {
        // Cancel any existing refresh timer when starting new search
        if (refreshTimer) {
            console.log(`🚫 [Timer] Cancelling previous refresh timer`);
            clearTimeout(refreshTimer);
            setRefreshTimer(null);
        }

        if (debouncedQuery.length < 3) {
            setResults({ users: [], devices: [] });
            setLoading(false);
            setBackgroundSyncing(false);
            return;
        }

        const fetchResults = async () => {
            const searchStartTime = Date.now();
            setLoading(true);
            setBackgroundSyncing(false);
            setError(null);

            try {
                console.log(`🔍 [Parallel Search] Starting search for: "${debouncedQuery}"`);

                const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token && { 'Authorization': `Bearer ${token}` }),
                    },
                });

                if (!response.ok) {
                    throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
                }

                const searchData = await response.json();
                console.log(`🔍 [Parallel Search] Instant results received:`, searchData);

                const users: GoogleUser[] = searchData.users || [];
                const devices: Chromebook[] = searchData.devices || [];
                const metadata = searchData.metadata || {};

                const elapsed = Date.now() - searchStartTime;

                // Set background syncing state if sync is happening
                if (metadata.syncInProgress) {
                    setBackgroundSyncing(true);
                    setSyncingQuery(debouncedQuery); // Track which query is syncing
                    console.log(`🔄 [Parallel Search] Background sync active for "${debouncedQuery}": Users=${metadata.syncStudents}, Devices=${metadata.syncDevices}`);
                }

                // Show results immediately for lightning-fast experience
                console.log(`⚡ [Parallel Search] Showing ${users.length} users, ${devices.length} devices after ${elapsed}ms`);

                setResults({
                    users,
                    devices,
                    metadata: {
                        searchQuery: metadata.searchQuery || debouncedQuery,
                        searchIntent: metadata.searchIntent,
                        localUserCount: metadata.localUserCount || users.length,
                        localDeviceCount: metadata.localDeviceCount || devices.length,
                        syncInProgress: metadata.syncInProgress,
                        syncStudents: metadata.syncStudents,
                        syncDevices: metadata.syncDevices,
                        source: metadata.source
                    },
                    syncing: {
                        users: metadata.syncStudents || false,
                        devices: metadata.syncDevices || false
                    }
                });

                setLoading(false);

                // Start monitoring background sync if it's happening
                if (metadata.syncInProgress) {
                    scheduleRefresh(debouncedQuery);
                }

            } catch (err) {
                setError('Failed to fetch search results.');
                console.error('❌ [Parallel Search] Error:', err);
                setLoading(false);
                setBackgroundSyncing(false);
            }
        };

        fetchResults();

        // Cleanup function to cancel timer on unmount or re-run
        return () => {
            if (refreshTimer) {
                console.log(`🧹 [Cleanup] Cancelling refresh timer on unmount/re-run`);
                clearTimeout(refreshTimer);
                setRefreshTimer(null);
            }
        };
    }, [debouncedQuery, token]);

    // Function to refresh results after background sync
    const refreshResults = async (originalQuery: string) => {
        if (!originalQuery || originalQuery.length < 3) return;

        // Prevent stale refreshes - only refresh if sync query matches current query
        if (originalQuery !== debouncedQuery) {
            console.log(`🚫 [Refresh] Ignoring stale sync for "${originalQuery}", current query is "${debouncedQuery}"`);
            setSyncingQuery(null);
            setBackgroundSyncing(false);
            return;
        }

        try {
            console.log(`🔄 [Refresh] Updating results after background sync for: "${originalQuery}"`);

            const response = await fetch(`/api/search?q=${encodeURIComponent(originalQuery)}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
            });

            if (!response.ok) return;

            const searchData = await response.json();
            const users: GoogleUser[] = searchData.users || [];
            const devices: Chromebook[] = searchData.devices || [];
            const metadata = searchData.metadata || {};

            // Update results and turn off sync indicators
            setResults(prev => ({
                users,
                devices,
                metadata: {
                    ...prev.metadata,
                    localUserCount: metadata.localUserCount || users.length,
                    localDeviceCount: metadata.localDeviceCount || devices.length,
                    syncInProgress: false
                },
                syncing: {
                    users: false,
                    devices: false
                }
            }));

            // Turn off background syncing state
            setSyncingQuery(null);
            setBackgroundSyncing(false);

            console.log(`✅ [Refresh] Updated with ${users.length} users, ${devices.length} devices - sync complete`);

            // Emit refresh events for other components
            emit(GLOBAL_EVENTS.USERS_REFRESH_NEEDED);
            emit(GLOBAL_EVENTS.CHROMEBOOKS_REFRESH_NEEDED);

        } catch (err) {
            console.error('❌ [Refresh] Error updating results:', err);
            setSyncingQuery(null);
            setBackgroundSyncing(false);
        }
    };

    // Schedule refresh after background sync delay
    const scheduleRefresh = (originalQuery: string) => {
        console.log(`⏰ [Refresh] Scheduling refresh in 3 seconds for query: "${originalQuery}"`);
        const timer = setTimeout(() => {
            refreshResults(originalQuery);
            setRefreshTimer(null); // Clear timer reference after execution
        }, 3000);
        setRefreshTimer(timer);
    };

    return { results, loading, backgroundSyncing, error };
};

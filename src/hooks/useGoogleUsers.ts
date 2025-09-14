import { useState, useEffect, useCallback } from 'react';
import { GoogleUser } from '@/types/user';
import { useAuth } from '@/components/sso/SSOProvider';
import { apiConfig } from '@/config';

export const useGoogleUsers = () => {
    const [users, setUsers] = useState<GoogleUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { isAdmin, token } = useAuth();

    const fetchUsers = useCallback(async () => {
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

            // Fetch users from the API - use environment-aware URL
            const response = await fetch(`${apiConfig.apiUrl}/google/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                setUsers([]);
                setError(`Error: ${response.status} ${response.statusText}`);
                return;
            }

            // Read response as text first, then parse as JSON
            const responseText = await response.text();
            console.log('Raw response text:', responseText.substring(0, 500));

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse JSON response:', parseError);
                console.error('Raw response:', responseText);
                setUsers([]);
                setError(`JSON parsing error: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}. Raw response: ${responseText.substring(0, 200)}...`);
                return;
            }

            if (!data.success || !Array.isArray(data.data)) {
                console.error('API returned unsuccessful response or invalid data:', data);
                setUsers([]);
                setError(data.message || "Failed to fetch users");
                return;
            }

            // Set the users
            setUsers(data.data);
        } catch (err) {
            setUsers([]);
            setError(`Error fetching users: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [isAdmin, token]);

    useEffect(() => {
        if (isAdmin && token) {
            fetchUsers();
        }
    }, [fetchUsers, isAdmin, token]);

    const syncUsers = useCallback(async (maxResults = 500) => {
        if (!isAdmin) {
            return { success: false, message: "Admin access required" };
        }

        try {
            setLoading(true);
            setError(null);

            // Sync users from Google to the database - use environment-aware URL
            const response = await fetch(`${apiConfig.apiUrl}/google/sync/users?maxResults=${maxResults}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                setError(`Error: ${response.status} ${response.statusText}`);
                return { success: false, message: `Error: ${response.status} ${response.statusText}` };
            }

            // Read response as text first, then parse as JSON
            const responseText = await response.text();
            console.log('Sync response text:', responseText.substring(0, 500));

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse sync response:', parseError);
                console.error('Raw sync response:', responseText);
                const errorMessage = `JSON parsing error: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`;
                setError(errorMessage);
                return { success: false, message: errorMessage };
            }

            // Refresh the users list
            fetchUsers();

            return result;
        } catch (err) {
            const errorMessage = `Error syncing users: ${err instanceof Error ? err.message : 'Unknown error'}`;
            setError(errorMessage);
            return { success: false, message: errorMessage };
        } finally {
            setLoading(false);
        }
    }, [isAdmin, token, fetchUsers]);

    return {
        users,
        loading,
        error,
        refetch: fetchUsers,
        syncUsers
    };
};

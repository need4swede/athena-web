import { useCallback } from 'react';
import { GoogleUser } from '@/types/user';
import { useToast } from '@/hooks/use-toast';

interface UseUserManagementProps {
    users: GoogleUser[];
    token: string;
    refetch: () => void;
}

export const useUserManagement = ({ users, token, refetch }: UseUserManagementProps) => {
    const { toast } = useToast();

    const suspendUser = useCallback(async (userEmail: string, reason?: string) => {
        try {
            const response = await fetch(`/api/google/users/${userEmail}/suspend`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reason: reason || 'No reason provided'
                }),
            });

            const result = await response.json();

            if (result.success) {
                const user = users.find(u => u.primaryEmail === userEmail);
                toast({
                    title: "User Suspended",
                    description: `${user?.name.fullName || userEmail} has been suspended successfully.`,
                });
                refetch();
                return { success: true };
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to suspend user",
                    variant: "destructive",
                });
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('Error suspending user:', error);
            toast({
                title: "Error",
                description: "An unexpected error occurred while suspending the user",
                variant: "destructive",
            });
            return { success: false, error: 'Unexpected error' };
        }
    }, [users, token, toast, refetch]);

    const unsuspendUser = useCallback(async (userEmail: string) => {
        try {
            const response = await fetch(`/api/google/users/${userEmail}/unsuspend`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const result = await response.json();

            if (result.success) {
                const user = users.find(u => u.primaryEmail === userEmail);
                toast({
                    title: "User Unsuspended",
                    description: `${user?.name.fullName || userEmail} has been unsuspended successfully.`,
                });
                refetch();
                return { success: true };
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to unsuspend user",
                    variant: "destructive",
                });
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('Error unsuspending user:', error);
            toast({
                title: "Error",
                description: "An unexpected error occurred while unsuspending the user",
                variant: "destructive",
            });
            return { success: false, error: 'Unexpected error' };
        }
    }, [users, token, toast, refetch]);

    const moveUser = useCallback(async (userEmail: string, orgUnitPath: string) => {
        try {
            const response = await fetch(`/api/google/users/${userEmail}/move`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    orgUnitPath
                }),
            });

            const result = await response.json();

            if (result.success) {
                const user = users.find(u => u.primaryEmail === userEmail);
                toast({
                    title: "User Moved",
                    description: `${user?.name.fullName || userEmail} has been moved to ${orgUnitPath} successfully.`,
                });
                refetch();
                return { success: true };
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to move user",
                    variant: "destructive",
                });
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('Error moving user:', error);
            toast({
                title: "Error",
                description: "An unexpected error occurred while moving the user",
                variant: "destructive",
            });
            return { success: false, error: 'Unexpected error' };
        }
    }, [users, token, toast, refetch]);

    return {
        suspendUser,
        unsuspendUser,
        moveUser
    };
};

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { useUnifiedSearch } from '@/hooks/useUnifiedSearch';
import { useUserManagement } from '@/hooks/useUserManagement';
import { useOrgUnitTree } from '@/hooks/useOrgUnitTree';
import { UserDetailsDialog } from '@/components/Users/UserDetailsDialog';
import { OrgUnitsSidebar } from '@/components/Users/OrgUnitsSidebar';
import { PaginatedUserGrid } from '@/components/Users/PaginatedUserGrid';
import { SuspendUserDialog, MoveUserDialog } from '@/components/Users/UserManagementDialogs';
import { GoogleUser } from '@/types/user';
import { useAuth } from '@/components/sso/SSOProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Search, Users, RefreshCw, Cloud, FolderTree, X } from 'lucide-react';

const UsersPage: React.FC = () => {
    const { users, loading, syncing, syncProgress, syncingUsers, error, isInitialSync, refetch, refetchFromDatabase } = useUsers();
    const { user, token } = useAuth();
    const [activeSection, setActiveSection] = useState('users');
    const [searchTerm, setSearchTerm] = useState('');
    const [orgUnitFilter, setOrgUnitFilter] = useState<string>('all');
    const [selectedUser, setSelectedUser] = useState<GoogleUser | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isOrgUnitsSidebarExpanded, setIsOrgUnitsSidebarExpanded] = useState(false);

    // User management dialogs
    const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
    const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
    const [suspensionReason, setSuspensionReason] = useState('');
    const [targetOrgUnit, setTargetOrgUnit] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Unified search for users (includes students)
    const {
        users: searchUsers,
        loading: searchLoading,
        backgroundSyncing: searchSyncing,
        metadata: searchMetadata
    } = useUnifiedSearch(searchTerm, {
        context: 'users',
        limit: 100,
        debounceMs: 300
    });

    // Custom hooks
    const { orgUnitTree, userCounts, availableOrgUnits } = useOrgUnitTree(users);
    const userManagement = useUserManagement({ users, token: token || '', refetch: refetchFromDatabase });

    // Update selectedUser when users data changes (after suspend/unsuspend operations)
    useEffect(() => {
        if (selectedUser) {
            const updatedUser = users.find(u => u.id === selectedUser.id);
            if (updatedUser && JSON.stringify(updatedUser) !== JSON.stringify(selectedUser)) {
                setSelectedUser(updatedUser);
            }
        }
    }, [users, selectedUser]);

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
            case 'org-units':
                window.location.href = '/org-units';
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
        }
    }, []);

    // Handle view details
    const handleViewDetails = useCallback((id: string) => {
        const user = users.find(u => u.id === id);
        if (user) {
            setSelectedUser(user);
            setIsDetailsOpen(true);
        }
    }, [users]);

    // User management functions
    const handleSuspendUser = useCallback(async (userEmail: string) => {
        const userToSuspend = users.find(u => u.primaryEmail === userEmail);
        if (!userToSuspend) return;

        setSelectedUser(userToSuspend);
        setIsSuspendDialogOpen(true);
    }, [users]);

    const handleUnsuspendUser = useCallback(async (userEmail: string) => {
        const userToUnsuspend = users.find(u => u.primaryEmail === userEmail);
        if (!userToUnsuspend) return;

        setIsProcessing(true);
        try {
            await userManagement.unsuspendUser(userEmail);
        } finally {
            setIsProcessing(false);
        }
    }, [users, userManagement]);

    const handleMoveUser = useCallback(async (userId: string) => {
        const userToMove = users.find(u => u.id === userId);
        if (!userToMove) return;

        setSelectedUser(userToMove);
        setTargetOrgUnit(userToMove.orgUnitPath || '/');
        setIsMoveDialogOpen(true);
    }, [users]);

    const confirmSuspendUser = useCallback(async () => {
        if (!selectedUser) return;

        setIsProcessing(true);
        try {
            const result = await userManagement.suspendUser(selectedUser.primaryEmail, suspensionReason);
            if (result.success) {
                setIsSuspendDialogOpen(false);
                setSuspensionReason('');
            }
        } finally {
            setIsProcessing(false);
        }
    }, [selectedUser, suspensionReason, userManagement]);

    const confirmMoveUser = useCallback(async () => {
        if (!selectedUser || !targetOrgUnit) return;

        setIsProcessing(true);
        try {
            const result = await userManagement.moveUser(selectedUser.primaryEmail, targetOrgUnit);
            if (result.success) {
                setIsMoveDialogOpen(false);
                setTargetOrgUnit('');
            }
        } finally {
            setIsProcessing(false);
        }
    }, [selectedUser, targetOrgUnit, userManagement]);

    // Memoized filtered users combining local users and search results
    const filteredUsers = useMemo(() => {
        let allUsers = users;

        // If there's a search term, merge with search results and deduplicate
        if (searchTerm && searchTerm.length >= 3) {
            // Create a Set of existing user emails for deduplication
            const existingUserEmails = new Set(users.map(u => u.primaryEmail));

            // Add unique search results that aren't already in local users
            const uniqueSearchUsers = searchUsers.filter(searchUser =>
                !existingUserEmails.has(searchUser.primaryEmail)
            );

            allUsers = [...users, ...uniqueSearchUsers];
        }

        // Apply filters
        return allUsers.filter(user => {
            const matchesSearch = !searchTerm ||
                user.name.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.primaryEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (user.student_id && user.student_id.toLowerCase().includes(searchTerm.toLowerCase()));

            // Exact org unit match - no children included
            const matchesOrgUnit = orgUnitFilter === 'all' || user.orgUnitPath === orgUnitFilter;

            return matchesSearch && matchesOrgUnit;
        });
    }, [users, searchUsers, searchTerm, orgUnitFilter]);

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
                        userCounts={userCounts}
                    />

                    <main className={`flex-1 p-8 transition-all duration-300 ${isOrgUnitsSidebarExpanded ? 'ml-80' : ''}`}>
                        <div className="max-w-7xl mx-auto">
                            {/* Header with search and filters */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                                        <Users className="mr-2 h-6 w-6" />
                                        Users ({filteredUsers.length.toLocaleString()})
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
                            placeholder="Search users by name, email, or student ID..."
                            className="pl-9 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {(searchLoading || searchSyncing) && (
                            <div className="absolute right-2.5 top-2.5">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                            </div>
                        )}
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

                            {/* Sync Progress Bar - Only show for initial sync and manual refresh */}
                            {syncing && syncProgress > 0 && isInitialSync && (
                                <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Cloud className="h-4 w-4 text-blue-500 animate-pulse" />
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Syncing users with Google...
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
                                    <p className="ml-2 text-gray-600 dark:text-gray-400">Loading users...</p>
                                </div>
                            )}

                            {/* Error state */}
                            {error && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                                    <p className="text-red-800 dark:text-red-400">
                                        Error loading users: {error}
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
                            {!loading && !error && filteredUsers.length === 0 && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                                    <Users className="h-12 w-12 mx-auto text-gray-400" />
                                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                                        {searchTerm || orgUnitFilter !== 'all' ? 'No users found' : 'No users available'}
                                    </h3>
                                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                                        {searchTerm || orgUnitFilter !== 'all'
                                            ? 'Try adjusting your search or filter criteria.'
                                            : 'Users will appear here once they are synced from Google.'}
                                    </p>
                                    {(searchTerm || orgUnitFilter !== 'all') && (
                                        <Button
                                            variant="outline"
                                            className="mt-4"
                                            onClick={() => {
                                                setSearchTerm('');
                                                setOrgUnitFilter('all');
                                            }}
                                        >
                                            Clear filters
                                        </Button>
                                    )}
                                </div>
                            )}

            {/* Users content with enhanced search */}
            {!loading && !error && filteredUsers.length > 0 && (
                <div>
                    {/* Search results metadata */}
                    {searchTerm && searchTerm.length >= 3 && searchMetadata && (
                        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span>Search results:</span>
                            {searchMetadata.localUserCount !== undefined && (
                                <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs">
                                    {searchMetadata.localUserCount} local
                                </span>
                            )}
                            {searchSyncing && (
                                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                                    <Cloud className="h-3 w-3 animate-pulse" />
                                    Searching Google...
                                </span>
                            )}
                        </div>
                    )}

                    <PaginatedUserGrid
                        users={filteredUsers}
                        onViewDetails={handleViewDetails}
                        onSuspendUser={handleSuspendUser}
                        onUnsuspendUser={handleUnsuspendUser}
                        syncingUsers={syncingUsers}
                        userRole={user?.role === 'super_admin' ? 'super-admin' :
                                 user?.role === 'admin' ? 'admin' :
                                 'user'}
                    />
                </div>
            )}
                        </div>
                    </main>
                </div>

                {/* User Details Dialog */}
                {selectedUser && (
                    <UserDetailsDialog
                        user={selectedUser}
                        isOpen={isDetailsOpen}
                        onClose={() => {
                            setIsDetailsOpen(false);
                            setSelectedUser(null);
                        }}
                        onSuspendUser={handleSuspendUser}
                        onUnsuspendUser={handleUnsuspendUser}
                        onMoveUser={handleMoveUser}
                        userRole={user?.role === 'super_admin' ? 'super-admin' :
                                 user?.role === 'admin' ? 'admin' :
                                 'user'}
                    />
                )}

                {/* Suspend User Dialog */}
                <SuspendUserDialog
                    isOpen={isSuspendDialogOpen}
                    onClose={() => setIsSuspendDialogOpen(false)}
                    selectedUser={selectedUser}
                    suspensionReason={suspensionReason}
                    setSuspensionReason={setSuspensionReason}
                    onConfirm={confirmSuspendUser}
                    isProcessing={isProcessing}
                />

                {/* Move User Dialog */}
                <MoveUserDialog
                    isOpen={isMoveDialogOpen}
                    onClose={() => setIsMoveDialogOpen(false)}
                    selectedUser={selectedUser}
                    targetOrgUnit={targetOrgUnit}
                    setTargetOrgUnit={setTargetOrgUnit}
                    onConfirm={confirmMoveUser}
                    isProcessing={isProcessing}
                    availableOrgUnits={availableOrgUnits}
                />
            </div>
        </ThemeProvider>
    );
};

export default UsersPage;

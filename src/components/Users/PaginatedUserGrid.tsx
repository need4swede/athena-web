import React, { useState, useEffect } from 'react';
import { GoogleUser } from '@/types/user';
import { UserCard } from '@/components/Users/UserCard';
import { Button } from '@/components/ui/button';

interface PaginatedUserGridProps {
    users: GoogleUser[];
    onViewDetails: (id: string) => void;
    onSuspendUser: (userId: string) => void;
    onUnsuspendUser: (userId: string) => void;
    syncingUsers: Set<string>;
    userRole?: 'user' | 'admin' | 'super-admin';
}

export const PaginatedUserGrid: React.FC<PaginatedUserGridProps> = ({
    users,
    onViewDetails,
    onSuspendUser,
    onUnsuspendUser,
    syncingUsers,
    userRole = 'user'
}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50; // Show 50 users per page

    const totalPages = Math.ceil(users.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentUsers = users.slice(startIndex, endIndex);

    // Reset to first page when users change (e.g., filtering)
    useEffect(() => {
        setCurrentPage(1);
    }, [users.length]);

    return (
        <div className="space-y-6">
            {/* Users grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentUsers.map((user) => (
                    <UserCard
                        key={user.id}
                        user={user}
                        onViewDetails={onViewDetails}
                        onSuspendUser={onSuspendUser}
                        onUnsuspendUser={onUnsuspendUser}
                        isSync={syncingUsers.has(user.primaryEmail)}
                        userRole={userRole}
                    />
                ))}
            </div>

            {/* Pagination controls */}
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
                        {/* Show page numbers */}
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
                        Page {currentPage} of {totalPages} ({users.length.toLocaleString()} total)
                    </span>
                </div>
            )}
        </div>
    );
};

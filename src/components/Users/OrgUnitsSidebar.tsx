import React, { useState, useCallback } from 'react';
import { OrgUnitTreeNode } from '@/types/orgUnit';
import { Button } from '@/components/ui/button';
import { Users, ChevronRight, ChevronDown, FolderTree, X } from 'lucide-react';

interface OrgUnitsSidebarProps {
    orgUnitTree: OrgUnitTreeNode[];
    selectedOrgUnit: string;
    onOrgUnitSelect: (orgUnitPath: string) => void;
    isExpanded: boolean;
    onToggle: () => void;
    userCounts: Record<string, number>;
}

export const OrgUnitsSidebar: React.FC<OrgUnitsSidebarProps> = ({
    orgUnitTree,
    selectedOrgUnit,
    onOrgUnitSelect,
    isExpanded,
    onToggle,
    userCounts
}) => {
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['/']));

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

    const renderOrgUnitNode = useCallback((node: OrgUnitTreeNode, level: number = 0) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedNodes.has(node.orgUnitPath);
        const isSelected = selectedOrgUnit === node.orgUnitPath;
        const userCount = userCounts[node.orgUnitPath] || 0;

        return (
            <div key={node.id}>
                <div
                    className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                        isSelected ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''
                    }`}
                    style={{ paddingLeft: `${level * 16 + 8}px` }}
                    onClick={() => onOrgUnitSelect(node.orgUnitPath)}
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
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronRight className="h-3 w-3" />
                            )}
                        </button>
                    )}
                    {!hasChildren && <div className="w-4" />}
                    <FolderTree className="h-3 w-3 flex-shrink-0" />
                    <span className="text-xs truncate flex-1">
                        {node.name === '/' ? 'Root' : node.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        {userCount}
                    </span>
                </div>
                {hasChildren && isExpanded && (
                    <div>
                        {node.children.map(child => renderOrgUnitNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    }, [expandedNodes, selectedOrgUnit, onOrgUnitSelect, toggleNode, userCounts]);

    return (
        <div
            className={`fixed left-64 top-16 h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-lg transition-all duration-300 z-40 ${
                isExpanded ? 'w-80' : 'w-0'
            } overflow-hidden`}
        >
            <div className="h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white">Filter by Org Unit</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggle}
                        className="h-6 w-6 p-0"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    <div
                        className={`flex items-center gap-2 py-2 px-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 ${
                            selectedOrgUnit === 'all' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''
                        }`}
                        onClick={() => onOrgUnitSelect('all')}
                    >
                        <Users className="h-3 w-3" />
                        <span className="text-xs font-medium">All Users</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                            {Object.values(userCounts).reduce((sum, count) => sum + count, 0)}
                        </span>
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                        {orgUnitTree.map(node => renderOrgUnitNode(node))}
                    </div>
                </div>
            </div>
        </div>
    );
};

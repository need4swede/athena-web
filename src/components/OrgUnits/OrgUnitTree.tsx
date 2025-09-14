import React, { useState } from 'react';
import { OrgUnitTreeNode } from '@/types/orgUnit';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrgUnitTreeProps {
    nodes: OrgUnitTreeNode[];
    onSelect?: (orgUnit: OrgUnitTreeNode) => void;
    selectedOrgUnitId?: string | number;
    syncingOrgUnits?: Set<string>;
}

export const OrgUnitTree: React.FC<OrgUnitTreeProps> = ({
    nodes,
    onSelect,
    selectedOrgUnitId,
    syncingOrgUnits = new Set()
}) => {
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
        '/': true // Root is expanded by default
    });

    const toggleNode = (nodeId: string) => {
        setExpandedNodes(prev => ({
            ...prev,
            [nodeId]: !prev[nodeId]
        }));
    };

    const renderNode = (node: OrgUnitTreeNode) => {
        const isExpanded = expandedNodes[node.orgUnitPath] || false;
        const isSelected = selectedOrgUnitId === node.id;
        const hasChildren = node.children && node.children.length > 0;
        const indentLevel = node.level;
        const isSyncing = syncingOrgUnits.has(node.orgUnitPath);

        return (
            <div key={node.id}>
                <div
                    className={cn(
                        "flex items-center py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer rounded-md",
                        isSelected && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    )}
                    style={{ paddingLeft: `${indentLevel * 16 + 8}px` }}
                    onClick={() => onSelect && onSelect(node)}
                >
                    {hasChildren ? (
                        <span
                            className="mr-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleNode(node.orgUnitPath);
                            }}
                        >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                    ) : (
                        <span className="w-6"></span>
                    )}

                    <span className="mr-2">
                        {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                    </span>

                    <span className="truncate flex-1">{node.name}</span>

                    {isSyncing && (
                        <Cloud className="h-3 w-3 text-blue-600 dark:text-blue-400 animate-pulse ml-2" />
                    )}
                </div>

                {isExpanded && hasChildren && (
                    <div>
                        {node.children.map(childNode => renderNode(childNode))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="org-unit-tree">
            {nodes.map(node => renderNode(node))}
        </div>
    );
};

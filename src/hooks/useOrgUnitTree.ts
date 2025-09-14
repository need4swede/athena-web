import { useMemo } from 'react';
import { GoogleUser } from '@/types/user';
import { OrgUnitTreeNode } from '@/types/orgUnit';

export const useOrgUnitTree = (users: GoogleUser[]) => {
    // Build org unit tree from user data
    const orgUnitTree = useMemo(() => {
        const orgUnitMap = new Map<string, OrgUnitTreeNode>();
        const rootNodes: OrgUnitTreeNode[] = [];

        // Collect all unique org unit paths from users
        const orgUnitPaths = new Set<string>();
        users.forEach(user => {
            if (user.orgUnitPath && user.orgUnitPath !== '/') {
                orgUnitPaths.add(user.orgUnitPath);
                // Also add parent paths
                const parts = user.orgUnitPath.split('/').filter(Boolean);
                for (let i = 1; i <= parts.length; i++) {
                    const parentPath = '/' + parts.slice(0, i).join('/');
                    orgUnitPaths.add(parentPath);
                }
            }
        });

        // Always add root
        orgUnitPaths.add('/');

        // Create org unit nodes
        Array.from(orgUnitPaths).forEach(path => {
            const parts = path.split('/').filter(Boolean);
            const name = parts.length === 0 ? 'Root' : parts[parts.length - 1];

            // Calculate parent path correctly
            let parentPath: string | undefined;
            if (path === '/') {
                parentPath = undefined; // Root has no parent
            } else if (parts.length === 1) {
                parentPath = '/'; // Direct children of root
            } else {
                parentPath = '/' + parts.slice(0, -1).join('/'); // Other nodes
            }

            const node: OrgUnitTreeNode = {
                id: path,
                name,
                orgUnitPath: path,
                orgUnitId: path,
                parentOrgUnitPath: parentPath,
                blockInheritance: false,
                children: [],
                level: parts.length
            };

            orgUnitMap.set(path, node);
        });

        // Build hierarchy
        orgUnitMap.forEach(node => {
            if (node.parentOrgUnitPath && orgUnitMap.has(node.parentOrgUnitPath)) {
                const parent = orgUnitMap.get(node.parentOrgUnitPath)!;
                parent.children.push(node);
            } else if (node.orgUnitPath === '/') {
                rootNodes.push(node);
            }
        });

        // Sort children by name
        const sortChildren = (nodes: OrgUnitTreeNode[]) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name));
            nodes.forEach(node => sortChildren(node.children));
        };
        sortChildren(rootNodes);

        return rootNodes;
    }, [users]);

    // Calculate user counts per org unit (exact matches only, no children)
    const userCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        users.forEach(user => {
            if (user.orgUnitPath) {
                counts[user.orgUnitPath] = (counts[user.orgUnitPath] || 0) + 1;
            }
        });
        return counts;
    }, [users]);

    // Get available org units for move dialog
    const availableOrgUnits = useMemo(() => {
        const flattenOrgUnits = (nodes: OrgUnitTreeNode[]): OrgUnitTreeNode[] => {
            const result: OrgUnitTreeNode[] = [];
            nodes.forEach(node => {
                result.push(node);
                result.push(...flattenOrgUnits(node.children));
            });
            return result;
        };
        return flattenOrgUnits(orgUnitTree);
    }, [orgUnitTree]);

    return {
        orgUnitTree,
        userCounts,
        availableOrgUnits
    };
};

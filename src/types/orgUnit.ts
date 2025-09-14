/**
 * Represents an organizational unit in Google Admin.
 */
export interface OrgUnit {
    id: string | number;
    name: string;
    orgUnitPath: string;
    parentOrgUnitPath: string | null;
    description?: string;
    orgUnitId?: string;
    blockInheritance?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Represents the response from the API when fetching organizational units.
 */
export interface OrgUnitsResponse {
    success: boolean;
    message: string;
    data?: OrgUnit[];
}

/**
 * Represents the response from the API when syncing organizational units.
 */
export interface SyncOrgUnitsResponse {
    success: boolean;
    message: string;
    data?: {
        org_units_count: number;
        inserted_count: number;
        updated_count: number;
    };
}

/**
 * Represents a node in the organizational unit tree.
 */
export interface OrgUnitTreeNode extends OrgUnit {
    children: OrgUnitTreeNode[];
    level?: number;
}

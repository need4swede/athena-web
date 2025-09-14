/**
 * Represents a user in Google Admin.
 */
export interface GoogleUser {
    // Database fields
    id: string;
    google_id?: string;
    student_id?: string;
    student_db_id?: number; // Database ID for students table

    // Google API fields
    primaryEmail: string;
    name: {
        givenName?: string;
        familyName?: string;
        fullName?: string;
    };
    orgUnitPath?: string;
    isAdmin?: boolean;
    suspended?: boolean;
    role?: 'super_admin' | 'admin' | 'user';
    creationTime?: string;
    lastLoginTime?: string;
    isEnrolledIn2Sv?: boolean;
    isEnforcedIn2Sv?: boolean;

    // Additional user status fields
    archived?: boolean;
    changePasswordAtNextLogin?: boolean;
    ipWhitelisted?: boolean;
    agreedToTerms?: boolean;
    includeInGlobalAddressList?: boolean;
    isDelegatedAdmin?: boolean;

    // Suspension details
    suspensionReason?: string;

    // Additional contact information
    organizations?: Array<{
        primary?: boolean;
        title?: string;
        department?: string;
        costCenter?: string;
        location?: string;
        description?: string;
        domain?: string;
        fullTimeEquivalent?: number;
        type?: string;
    }>;
    emails?: Array<{
        address: string;
        primary?: boolean;
        type?: string;
        customType?: string;
    }>;
    phones?: Array<{
        value: string;
        primary?: boolean;
        type?: string;
        customType?: string;
    }>;
    addresses?: Array<{
        type?: string;
        customType?: string;
        sourceIsStructured?: boolean;
        formatted?: string;
        poBox?: string;
        extendedAddress?: string;
        streetAddress?: string;
        locality?: string;
        region?: string;
        postalCode?: string;
        country?: string;
        countryCode?: string;
        primary?: boolean;
    }>;

    // User photo
    thumbnailPhotoUrl?: string;
    thumbnailPhotoEtag?: string;

    // Additional metadata
    etag?: string;
    kind?: string;
    customerId?: string;
    aliases?: string[];
    nonEditableAliases?: string[];

    // Recovery information
    recoveryEmail?: string;
    recoveryPhone?: string;

    // Language and location
    languages?: Array<{
        languageCode?: string;
        preference?: string;
    }>;
    locations?: Array<{
        type?: string;
        customType?: string;
        area?: string;
        buildingId?: string;
        floorName?: string;
        floorSection?: string;
        deskCode?: string;
    }>;

    // Keywords and relations
    keywords?: Array<{
        type?: string;
        customType?: string;
        value?: string;
    }>;
    relations?: Array<{
        value?: string;
        type?: string;
        customType?: string;
    }>;

    // External IDs
    externalIds?: Array<{
        value?: string;
        type?: string;
        customType?: string;
    }>;

    // Custom schemas
    customSchemas?: Record<string, any>;

    // Database timestamps
    created_at?: string;
    updated_at?: string;
}

/**
 * Represents the response from the API when fetching users.
 */
export interface GoogleUsersResponse {
    success: boolean;
    message: string;
    data?: GoogleUser[];
}

/**
 * Represents the response from the API when syncing users.
 */
export interface SyncGoogleUsersResponse {
    success: boolean;
    message: string;
    data?: {
        users_count: number;
        inserted_count: number;
        updated_count: number;
    };
}

/**
 * Represents a user search result from the API.
 */
export interface GoogleUserSearchResponse {
    success: boolean;
    message: string;
    user?: GoogleUser;
}

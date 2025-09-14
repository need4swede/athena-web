import { createOrUpdateUser, getUserByEmail, isFirstUser as checkFirstUser } from './database';

export interface UserData {
    email: string;
    name: string;
    avatar?: string;
    provider: string;
}

export interface DatabaseUser {
    id: number;
    email: string;
    name: string;
    is_admin: boolean;
    created_at: Date;
    updated_at: Date;
}

// Check if this is the first user in the system
export async function isFirstUser(): Promise<boolean> {
    console.log('👥 [isFirstUser] Checking if this is the first user...');
    try {
        const isFirst = await checkFirstUser();
        console.log('👥 [isFirstUser] Is first user?', isFirst);
        return isFirst;
    } catch (error) {
        console.error('❌ [isFirstUser] Error checking if first user:', error);
        // If we can't check the database, assume it's not the first user for safety
        console.log('⚠️ [isFirstUser] Defaulting to false for safety');
        return false;
    }
}

// Create or update a user from SSO login
export async function createOrUpdateUserFromSSO(userData: UserData): Promise<DatabaseUser> {
    console.log('🔧 [createOrUpdateUserFromSSO] Starting user creation/update');
    console.log('🔧 [createOrUpdateUserFromSSO] User data:', userData);

    try {
        // Check if this is the first user (should be super-admin)
        console.log('🔧 [createOrUpdateUserFromSSO] Checking if first user...');
        const isFirst = await isFirstUser();
        console.log('🔧 [createOrUpdateUserFromSSO] Is first user?', isFirst);

        // Create or update the user in the database
        console.log('🔧 [createOrUpdateUserFromSSO] Calling createOrUpdateUser...');
        const dbUser = await createOrUpdateUser(
            userData.email,
            userData.name
        );
        console.log('🔧 [createOrUpdateUserFromSSO] Database user result:', dbUser);

        const result = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            is_admin: dbUser.is_admin,
            created_at: new Date(dbUser.created_at),
            updated_at: new Date(dbUser.updated_at)
        };
        console.log('🔧 [createOrUpdateUserFromSSO] Formatted result:', result);
        return result;
    } catch (error) {
        console.error('❌ [createOrUpdateUserFromSSO] Error creating/updating user from SSO:', error);
        console.error('❌ [createOrUpdateUserFromSSO] Error stack:', error.stack);
        throw new Error('Failed to create or update user account');
    }
}

// Get user by email
export async function getUserByEmailFromDB(email: string): Promise<DatabaseUser | null> {
    console.log('📧 [getUserByEmailFromDB] Getting user by email:', email);
    try {
        const dbUser = await getUserByEmail(email);
        console.log('📧 [getUserByEmailFromDB] Database result:', dbUser);

        if (!dbUser) {
            console.log('📧 [getUserByEmailFromDB] No user found');
            return null;
        }

        const result = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            is_admin: dbUser.is_admin,
            created_at: new Date(dbUser.created_at),
            updated_at: new Date(dbUser.updated_at)
        };
        console.log('📧 [getUserByEmailFromDB] Formatted result:', result);
        return result;
    } catch (error) {
        console.error('❌ [getUserByEmailFromDB] Error getting user by email:', error);
        return null;
    }
}

// Convert database user to the format expected by the frontend
export function formatUserForFrontend(dbUser: DatabaseUser, provider: string, avatar?: string) {
    console.log('🎨 [formatUserForFrontend] Formatting user for frontend');
    console.log('🎨 [formatUserForFrontend] Input - dbUser:', dbUser);
    console.log('🎨 [formatUserForFrontend] Input - provider:', provider);
    console.log('🎨 [formatUserForFrontend] Input - avatar:', avatar);

    const result = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        avatar: avatar || null,
        provider: provider,
        isAdmin: dbUser.is_admin,
        lastLogin: new Date()
    };
    console.log('🎨 [formatUserForFrontend] Formatted result:', result);
    return result;
}

// Mock token generation (in production, use proper JWT)
export function generateUserToken(user: DatabaseUser): string {
    console.log('🎫 [generateUserToken] Generating token for user:', user);
    const token = `token_${user.id}_${Date.now()}`;
    console.log('🎫 [generateUserToken] Generated token:', token);
    return token;
}

// Mock token validation (in production, use proper JWT validation)
export function parseUserToken(token: string): { userId: number; timestamp: number } | null {
    console.log('🔍 [parseUserToken] Parsing token:', token);
    try {
        const parts = token.split('_');
        console.log('🔍 [parseUserToken] Token parts:', parts);

        if (parts.length !== 3 || parts[0] !== 'token') {
            console.log('❌ [parseUserToken] Invalid token format');
            return null;
        }

        const userId = parseInt(parts[1]);
        const timestamp = parseInt(parts[2]);
        console.log('🔍 [parseUserToken] Parsed userId:', userId, 'timestamp:', timestamp);

        if (isNaN(userId) || isNaN(timestamp)) {
            console.log('❌ [parseUserToken] Invalid userId or timestamp');
            return null;
        }

        const result = { userId, timestamp };
        console.log('🔍 [parseUserToken] Parse result:', result);
        return result;
    } catch (error) {
        console.error('❌ [parseUserToken] Error parsing token:', error);
        return null;
    }
}

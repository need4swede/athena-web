import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, User, HardDrive, Database, Cloud, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { useUserManagement } from '@/hooks/useUserManagement';
import { useUsers } from '@/hooks/useUsers';
import { UserDetailsDialog } from '@/components/Users/UserDetailsDialog';
import { ChromebookDetailsDialog } from '@/components/Chromebooks/ChromebookDetailsDialog';
import { GoogleUser } from '@/types/user';
import { Chromebook } from '@/types/chromebook';
import { useAuth } from '@/components/sso/SSOProvider';

// Smart loading indicator that detects search intent
const SmartLoadingIndicator: React.FC<{ query: string }> = ({ query }) => {
  const [currentPhase, setCurrentPhase] = useState<'local' | 'google-students' | 'google-devices'>('local');

  // Detect search intent for loading messages
  const detectIntent = (query: string): 'student' | 'device' | 'both' => {
    const trimmed = query.trim();

    // Device patterns
    if (/^NJESD/i.test(trimmed)) return 'device';
    if (/^DCS\d+$/i.test(trimmed)) return 'device';
    if (/^\d{4}$/.test(trimmed)) return 'device';
    if (/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{7}$/i.test(trimmed)) return 'device'; // ABC1234 (exactly 7 mixed alphanumeric)

    // Student patterns
    if (/^\d{6}$/.test(trimmed)) return 'student';
    if (/^[a-zA-Z\s'-]+$/.test(trimmed)) return 'student';

    return 'both';
  };

  const intent = detectIntent(query);

  useEffect(() => {
    // Faster search phases for responsive feel
    const timer1 = setTimeout(() => {
      if (intent === 'student' || intent === 'both') {
        setCurrentPhase('google-students');
      } else if (intent === 'device') {
        setCurrentPhase('google-devices');
      }
    }, 50);

    const timer2 = setTimeout(() => {
      if (intent === 'both' && currentPhase === 'google-students') {
        setCurrentPhase('google-devices');
      }
    }, 200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [query, intent, currentPhase]);

  const getLoadingContent = () => {
    switch (currentPhase) {
      case 'local':
        return (
          <div className="flex items-center space-x-3">
            <Database className="w-4 h-4 text-green-500 animate-pulse" />
            <span className="text-sm text-gray-600 dark:text-gray-300">🔍 Searching local database...</span>
          </div>
        );
      case 'google-students':
        return (
          <div className="flex items-center space-x-3">
            <User className="w-4 h-4 text-green-500 animate-bounce" />
            <span className="text-sm text-gray-600 dark:text-gray-300">☁️ Searching Google for students...</span>
          </div>
        );
      case 'google-devices':
        return (
          <div className="flex items-center space-x-3">
            <HardDrive className="w-4 h-4 text-purple-500 animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              💻 Searching Google for devices...
            </span>
          </div>
        );
      default:
        return (
          <div className="flex items-center space-x-3">
            <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Searching...</span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-2">
      {getLoadingContent()}

      {/* Search intent indicator */}
      <div className="text-xs text-gray-400 flex items-center space-x-2">
        <span>•</span>
        <span>
          {intent === 'student' && 'Searching for students only'}
          {intent === 'device' && 'Searching for devices only'}
          {intent === 'both' && 'Searching both students and devices'}
        </span>
      </div>
    </div>
  );
};

export const GlobalSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const { results, loading, backgroundSyncing, error } = useGlobalSearch(query);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [selectedUser, setSelectedUser] = useState<GoogleUser | null>(null);
  const [selectedChromebook, setSelectedChromebook] = useState<Chromebook | null>(null);

  // Get user role and token for user management
  const { user, token } = useAuth();
  const { users, refetchFromDatabase } = useUsers();
  const userManagement = useUserManagement({ users, token: token || '', refetch: refetchFromDatabase });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleUserClick = (user: GoogleUser) => {
    setSelectedUser(user);
    setIsFocused(false);
    setQuery('');
  };

  const handleChromebookClick = (chromebook: Chromebook) => {
    setSelectedChromebook(chromebook);
    setIsFocused(false);
    setQuery('');
  };

  // User management handlers
  const handleSuspendUser = useCallback(async (userEmail: string) => {
    if (!userManagement) return;
    await userManagement.suspendUser(userEmail, 'Suspended via search');
  }, [userManagement]);

  const handleUnsuspendUser = useCallback(async (userEmail: string) => {
    if (!userManagement) return;
    await userManagement.unsuspendUser(userEmail);
  }, [userManagement]);

  const handleMoveUser = useCallback(async (userId: string) => {
    console.log('Move user functionality not implemented in search context');
  }, []);

  return (
    <div className="relative flex-1 max-w-lg mx-8" ref={searchContainerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        {backgroundSyncing && (
          <div className="absolute right-2.5 top-2.5">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
          </div>
        )}
        <Input
          placeholder="Search by name, email, student ID, asset tag, or serial number..."
          className="pl-10 pr-10 bg-gray-50/80 dark:bg-gray-900/80 border-gray-200/60 dark:border-gray-700/60 focus:bg-white dark:focus:bg-gray-900 transition-all duration-300"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
        />
      </div>

      {isFocused && (query.length > 2 || results.users.length > 0 || results.devices.length > 0) && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-50">
          {loading && (
            <div className="p-4">
              <SmartLoadingIndicator query={query} />
            </div>
          )}
          {error && <div className="p-4 text-center text-red-500">{error}</div>}

          {!loading && !error && (
            <div>
              {results.users.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase p-3">Users</h3>
                  <ul>
                    {results.users.map((user) => (
                      <li
                        key={user.id}
                        className="flex items-center p-3 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                        onClick={() => handleUserClick({
                          id: user.id.toString(),
                          google_id: (user as any).google_id,
                          primaryEmail: (user as any).primary_email || user.primaryEmail,
                          name: {
                            givenName: (user as any).first_name || user.name?.givenName,
                            familyName: (user as any).last_name || user.name?.familyName,
                            fullName: (user as any).full_name || user.name?.fullName
                          },
                          orgUnitPath: (user as any).org_unit_path || user.orgUnitPath,
                          isAdmin: (user as any).is_admin || user.isAdmin,
                          suspended: (user as any).is_suspended || user.suspended,
                          creationTime: (user as any).creation_time || user.creationTime,
                          lastLoginTime: (user as any).last_login_time || user.lastLoginTime,
                          // Transform JSONB fields if they exist
                          organizations: user.organizations || [],
                          emails: user.emails || [],
                          phones: user.phones || [],
                          addresses: user.addresses || [],
                          aliases: user.aliases || [],
                          languages: user.languages || []
                        })}
                      >
                        <User className="w-4 h-4 mr-3 text-gray-500" />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{(user as any).full_name || user.name?.fullName || `${(user as any).first_name || user.name?.givenName} ${(user as any).last_name || user.name?.familyName}`}</p>
                          <p className="text-xs text-gray-500">{(user as any).primary_email || user.primaryEmail}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span title="From local database">
                            <Database className="w-3 h-3 text-green-500" />
                          </span>
                          {results.syncing?.users && (
                            <span title="Syncing with Google...">
                              <Cloud className="w-3 h-3 text-blue-500 animate-pulse" />
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.devices.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase p-3">Devices</h3>
                  <ul>
                    {results.devices.map((device) => (
                      <li
                        key={(device as any).asset_tag || device.assetTag}
                        className="flex items-center p-3 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                        onClick={() => handleChromebookClick({
                          ...device,
                          id: device.id || (device as any).asset_tag || device.assetTag,
                          assetTag: (device as any).asset_tag || device.assetTag,
                          serialNumber: (device as any).serial_number || device.serialNumber,
                          orgUnit: (device as any).org_unit || device.orgUnit || '',
                          model: device.model || '',
                          status: device.status || 'available',
                          currentUser: device.currentUser,
                          checkedOutDate: (device as any).checked_out_date ? new Date((device as any).checked_out_date) : device.checkedOutDate,
                          isInsured: (device as any).is_insured !== undefined ? (device as any).is_insured : device.isInsured,
                          notes: device.notes || [],
                          history: device.history || [],
                          tags: device.tags || [],
                          lastUpdated: device.lastUpdated || new Date()
                        })}
                      >
                        <HardDrive className="w-4 h-4 mr-3 text-gray-500" />
                        <div className="flex-1">
                          <p className="font-medium text-sm">Asset Tag: {(device as any).asset_tag || device.assetTag}</p>
                          <p className="text-xs text-gray-500">Serial: {(device as any).serial_number || device.serialNumber}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span title="From local database">
                            <Database className="w-3 h-3 text-green-500" />
                          </span>
                          {results.syncing?.devices && (
                            <span title="Syncing with Google...">
                              <Cloud className="w-3 h-3 text-blue-500 animate-pulse" />
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {query.length > 2 && results.users.length === 0 && results.devices.length === 0 && (
                <div className="p-4 text-center text-gray-500">No results found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedUser && (
        <UserDetailsDialog
          user={selectedUser}
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          onSuspendUser={handleSuspendUser}
          onUnsuspendUser={handleUnsuspendUser}
          onMoveUser={handleMoveUser}
          userRole={user?.role === 'super_admin' ? 'super-admin' :
                   user?.role === 'admin' ? 'admin' :
                   'user'}
        />
      )}

      {selectedChromebook && (
        <ChromebookDetailsDialog
          chromebook={selectedChromebook}
          isOpen={!!selectedChromebook}
          onClose={() => setSelectedChromebook(null)}
          userRole={user?.role}
        />
      )}
    </div>
  );
};

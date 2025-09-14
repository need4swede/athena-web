import React from 'react';
import { GoogleUser } from '@/types/user';
import StudentFees from './StudentFees';
import UserDeviceHistory from './UserDeviceHistory';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Mail,
  Calendar,
  Building,
  Shield,
  AlertTriangle,
  CheckCircle,
  Phone,
  MapPin,
  UserCheck,
  UserX,
  Key,
  Globe,
  Languages,
  ExternalLink,
  Copy,
  Clock,
  Move,
  UserMinus,
  UserPlus,
  DollarSign
} from 'lucide-react';

interface UserDetailsDialogProps {
  user: GoogleUser | null;
  isOpen: boolean;
  onClose: () => void;
  userRole?: 'user' | 'admin' | 'super-admin';
  onSuspendUser?: (userId: string) => void;
  onUnsuspendUser?: (userId: string) => void;
  onMoveUser?: (userId: string) => void;
}

export const UserDetailsDialog: React.FC<UserDetailsDialogProps> = ({
  user,
  isOpen,
  onClose,
  userRole = 'user',
  onSuspendUser,
  onUnsuspendUser,
  onMoveUser,
}) => {
  if (!user) return null;

  // Debug logging to see user suspension status and student_id
  console.log('UserDetailsDialog - User data:', {
    id: user.id,
    email: user.primaryEmail,
    suspended: user.suspended,
    suspensionReason: user.suspensionReason,
    student_id: user.student_id,
    student_db_id: user.student_db_id,
    full_user_object: user
  });

  // Format date strings
  const formatDate = (dateString?: string) => {
    if (!dateString || dateString === '1970-01-01T00:00:00.000Z') return 'Never';
    try {
      const date = new Date(dateString);
      // Check if the date is valid and not the Unix epoch
      if (isNaN(date.getTime()) || date.getTime() === 0) return 'Never';
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Never';
    }
  };

  // Copy to clipboard function
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Get primary organization
  const primaryOrg = user.organizations?.find(org => org.primary) || user.organizations?.[0];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-700 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {user.name.fullName || 'Unknown User'}
              </DialogTitle>
              <DialogDescription className="flex items-center space-x-2">
                <span>{user.primaryEmail}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(user.primaryEmail)}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            {user.suspended ? (
              <Badge variant="destructive" className="flex items-center space-x-1">
                <UserX className="w-3 h-3" />
                <span>Suspended</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center space-x-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                <UserCheck className="w-3 h-3" />
                <span>Active</span>
              </Badge>
            )}

            {(user.isAdmin || user.isDelegatedAdmin) && (
              <Badge variant="default" className="flex items-center space-x-1">
                <Shield className="w-3 h-3" />
                <span>Admin</span>
              </Badge>
            )}

            {user.isDelegatedAdmin && (
              <Badge variant="secondary" className="flex items-center space-x-1 bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                <Key className="w-3 h-3" />
                <span>Delegated Admin</span>
              </Badge>
            )}

            {user.isEnrolledIn2Sv && (
              <Badge variant="secondary" className="flex items-center space-x-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                <CheckCircle className="w-3 h-3" />
                <span>2FA Enabled</span>
              </Badge>
            )}

            {user.changePasswordAtNextLogin && (
              <Badge variant="secondary" className="flex items-center space-x-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                <AlertTriangle className="w-3 h-3" />
                <span>Password Reset Required</span>
              </Badge>
            )}

            {user.archived && (
              <Badge variant="secondary" className="flex items-center space-x-1 bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400">
                <span>Archived</span>
              </Badge>
            )}
          </div>

          <Separator />

          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <User className="w-5 h-5 mr-2" />
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Full Name</p>
                <p className="text-base">{user.name.fullName || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Given Name</p>
                <p className="text-base">{user.name.givenName || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Family Name</p>
                <p className="text-base">{user.name.familyName || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Google ID</p>
                <p className="text-base font-mono text-sm">{user.id}</p>
              </div>
              {user.student_id && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Student ID</p>
                  <p className="text-base font-mono text-sm">{user.student_id}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Organization Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Building className="w-5 h-5 mr-2" />
              Organization
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Organizational Unit</p>
                <p className="text-base">{user.orgUnitPath || '/'}</p>
              </div>
              {primaryOrg && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Job Title</p>
                    <p className="text-base">{primaryOrg.title || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Department</p>
                    <p className="text-base">{primaryOrg.department || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Location</p>
                    <p className="text-base">{primaryOrg.location || 'Not specified'}</p>
                  </div>
                  {primaryOrg.costCenter && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Cost Center</p>
                      <p className="text-base">{primaryOrg.costCenter}</p>
                    </div>
                  )}
                  {primaryOrg.description && (
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</p>
                      <p className="text-base">{primaryOrg.description}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Mail className="w-5 h-5 mr-2" />
              Contact Information
            </h3>

            {/* Emails */}
            {user.emails && user.emails.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Email Addresses</p>
                <div className="space-y-2">
                  {user.emails.map((email, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-mono">{email.address}</span>
                        {email.primary && (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        )}
                        {email.type && (
                          <Badge variant="outline" className="text-xs">{email.type}</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(email.address)}
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phones */}
            {user.phones && user.phones.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Phone Numbers</p>
                <div className="space-y-2">
                  {user.phones.map((phone, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{phone.value}</span>
                        {phone.primary && (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        )}
                        {phone.type && (
                          <Badge variant="outline" className="text-xs">{phone.type}</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(phone.value)}
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Addresses */}
            {user.addresses && user.addresses.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Addresses</p>
                <div className="space-y-2">
                  {user.addresses.map((address, index) => (
                    <div key={index} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                      <div className="flex items-center space-x-2 mb-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        {address.type && (
                          <Badge variant="outline" className="text-xs">{address.type}</Badge>
                        )}
                        {address.primary && (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        )}
                      </div>
                      <p className="text-sm">{address.formatted || 'No formatted address'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recovery Information */}
            {(user.recoveryEmail || user.recoveryPhone) && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Recovery Information</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {user.recoveryEmail && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recovery Email</p>
                      <p className="text-base font-mono text-sm">{user.recoveryEmail}</p>
                    </div>
                  )}
                  {user.recoveryPhone && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recovery Phone</p>
                      <p className="text-base">{user.recoveryPhone}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Account Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Account Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
                <p className="text-base">{formatDate(user.creationTime)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Login</p>
                <p className="text-base">{formatDate(user.lastLoginTime)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Agreed to Terms</p>
                <p className="text-base">{user.agreedToTerms ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">IP Whitelisted</p>
                <p className="text-base">{user.ipWhitelisted ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Include in Global Address List</p>
                <p className="text-base">{user.includeInGlobalAddressList ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">2-Step Verification Enforced</p>
                <p className="text-base">{user.isEnforcedIn2Sv ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>

          {/* Aliases */}
          {user.aliases && user.aliases.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <ExternalLink className="w-5 h-5 mr-2" />
                  Email Aliases
                </h3>
                <div className="flex flex-wrap gap-2">
                  {user.aliases.map((alias, index) => (
                    <div key={index} className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md">
                      <span className="text-sm font-mono">{alias}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(alias)}
                        className="h-4 w-4 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Languages */}
          {user.languages && user.languages.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Languages className="w-5 h-5 mr-2" />
                  Languages
                </h3>
                <div className="flex flex-wrap gap-2">
                  {user.languages.map((language, index) => (
                    <Badge key={index} variant="outline">
                      {language.languageCode}
                      {language.preference && ` (${language.preference})`}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Suspension Details */}
          {user.suspended && user.suspensionReason && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Suspension Details
                </h3>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Reason</p>
                  <p className="text-base text-red-800 dark:text-red-400">{user.suspensionReason}</p>
                </div>
              </div>
            </>
          )}

          {/* Student Fees */}
          {user.student_db_id && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <DollarSign className="w-5 h-5 mr-2" />
                  Student Fees
                </h3>
                <StudentFees
                  studentId={user.student_db_id}
                  studentName={user.name.fullName}
                  studentIdNumber={user.student_id}
                  userRole={userRole}
                />
              </div>
            </>
          )}

          {/* User Device History */}
          {user.student_db_id && (
            <>
              <Separator />
              <div>
                <UserDeviceHistory studentId={user.student_db_id} />
              </div>
            </>
          )}
        </div>

        {/* Action Buttons Footer */}
        {userRole !== 'user' && (
          <DialogFooter className="flex flex-row justify-end space-x-2">
            {onMoveUser && (
              <Button
                onClick={() => onMoveUser(user.id)}
                variant="outline"
                className="flex items-center space-x-2"
              >
                <Move className="w-4 h-4" />
                <span>Move</span>
              </Button>
            )}

            {user.suspended ? (
              onUnsuspendUser && (
                <Button
                  onClick={() => onUnsuspendUser(user.primaryEmail)}
                  variant="default"
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Reactivate</span>
                </Button>
              )
            ) : (
              !(user.isAdmin || user.isDelegatedAdmin) && onSuspendUser && (
                <Button
                  onClick={() => onSuspendUser(user.primaryEmail)}
                  variant="destructive"
                  className="flex items-center space-x-2"
                >
                  <UserMinus className="w-4 h-4" />
                  <span>Suspend</span>
                </Button>
              )
            )}

            <Button
              onClick={onClose}
              variant="secondary"
            >
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

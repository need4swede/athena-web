import React, { useState } from 'react';
import { Chromebook } from '@/types/chromebook';
import { getInsuranceStatusDisplay, getInsuranceStatusClasses } from '@/lib/insurance-utils';
import DeviceHistory from './DeviceHistory';
import { InsuranceOverrideButton } from './InsuranceOverrideButton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Laptop,
  User,
  Globe,
  Shield,
  Monitor,
  Wifi,
  Users,
  Calendar,
  MapPin,
  Hash,
  Smartphone,
  HardDrive,
  Settings,
  Network,
  UserCheck,
  Zap,
  Activity,
  Database,
  Cpu,
  MemoryStick,
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  History,
  Eye,
  EyeOff,
  Copy,
  Check,
  Printer,
  Loader2
} from 'lucide-react';

// Utility function to format org unit path by removing "/Chromebooks" prefix
const formatOrgUnit = (orgUnit: string | undefined | null): string => {
  if (!orgUnit) return 'Unknown';
  if (orgUnit.startsWith('/Chromebooks')) {
    const remaining = orgUnit.substring('/Chromebooks'.length);
    return remaining || '/';
  }
  return orgUnit;
};

// Format date strings
const formatDate = (date?: Date | string) => {
  if (!date) return 'Never';
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return 'Invalid date';
  }
};

// Format relative time
const formatRelativeTime = (date?: Date | string) => {
  if (!date) return 'Never';
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  } catch (e) {
    return 'Invalid date';
  }
};

// Copy to clipboard component
const CopyButton: React.FC<{ text: string; className?: string }> = ({ text, className = "" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers or when clipboard API is not available
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed: ', fallbackErr);
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={`h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-800 ${className}`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
      )}
    </Button>
  );
};

// Copyable value component
const CopyableValue: React.FC<{
  value: string;
  className?: string;
  children: React.ReactNode;
}> = ({ value, className = "", children }) => {
  return (
    <div className={`flex items-center justify-between group ${className}`}>
      <div className="flex-1">
        {children}
      </div>
      <CopyButton text={value} className="opacity-0 group-hover:opacity-100 transition-opacity ml-2" />
    </div>
  );
};

interface ChromebookDetailsDialogProps {
  chromebook: Chromebook | null;
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
}

export const ChromebookDetailsDialog: React.FC<ChromebookDetailsDialogProps> = ({
  chromebook,
  isOpen,
  onClose,
  userRole
}) => {
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [showRecentUsers, setShowRecentUsers] = useState(false);
  const [showDeviceHistory, setShowDeviceHistory] = useState(false);

  if (!chromebook) return null;

  // Get WAN IP from network information
  const wanIp = chromebook.lastKnownNetwork?.find(network => network.wanIpAddress)?.wanIpAddress;

  // Get recent users from chromebook data (Google API provides this directly)
  const recentUsers = chromebook.recentUsers?.map(user => ({
    email: user.email,
    type: user.type
  })) || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader className="pb-6">
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Laptop className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            {chromebook.assetTag}
          </DialogTitle>
          <DialogDescription className="text-lg text-gray-600 dark:text-gray-400">
            {chromebook.model} • {formatOrgUnit(chromebook.orgUnit)}
          </DialogDescription>
        </DialogHeader>

        {/* Priority Information - At a Glance */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Key Information
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Asset Tag */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 mb-1">
                <Hash className="h-4 w-4" />
                <span className="text-sm font-medium">Asset Tag</span>
              </div>
              <CopyableValue value={chromebook.assetTag}>
                <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{chromebook.assetTag}</p>
              </CopyableValue>
            </div>

            {/* Serial Number */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 mb-1">
                <Smartphone className="h-4 w-4" />
                <span className="text-sm font-medium">Serial Number</span>
              </div>
              <CopyableValue value={chromebook.serialNumber}>
                <p className="text-lg font-bold text-purple-900 dark:text-purple-100 font-mono">{chromebook.serialNumber}</p>
              </CopyableValue>
            </div>

            {/* Model */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 p-4 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-1">
                <Laptop className="h-4 w-4" />
                <span className="text-sm font-medium">Model</span>
              </div>
              <CopyableValue value={chromebook.model}>
                <p className="text-lg font-bold text-green-900 dark:text-green-100">{chromebook.model}</p>
              </CopyableValue>
            </div>

            {/* Status */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950/30 dark:to-gray-900/30 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-1">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Status</span>
              </div>
              <CopyableValue value={chromebook.status}>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    chromebook.status === 'available' ? 'bg-green-500' :
                    chromebook.status === 'checked-out' ? 'bg-blue-500' :
                    chromebook.status === 'maintenance' ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`} />
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100 capitalize">
                    {chromebook.status.replace('-', ' ')}
                  </span>
                </div>
              </CopyableValue>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Organization Unit */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30 p-4 rounded-xl border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300 mb-1">
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-medium">Organization Unit</span>
              </div>
              <CopyableValue value={chromebook.orgUnit}>
                <p className="text-lg font-bold text-orange-900 dark:text-orange-100">{formatOrgUnit(chromebook.orgUnit)}</p>
              </CopyableValue>
            </div>

            {/* Insurance */}
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/30 dark:to-teal-900/30 p-4 rounded-xl border border-teal-200 dark:border-teal-800">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 mb-1">
                <Shield className="h-4 w-4" />
                <span className="text-sm font-medium">Insurance</span>
                <InsuranceOverrideButton
                  chromebook={chromebook}
                  userRole={userRole}
                  onOverrideComplete={() => {
                    // Dialog will be refreshed when chromebook data is invalidated
                  }}
                />
              </div>
              <CopyableValue value={getInsuranceStatusDisplay(chromebook)}>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    chromebook.isInsured || chromebook.insurance_status === 'insured' ? 'bg-green-500' :
                    chromebook.insurance_status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <span className="text-lg font-bold text-teal-900 dark:text-teal-100">
                    {getInsuranceStatusDisplay(chromebook)}
                  </span>
                </div>
              </CopyableValue>
            </div>

            {/* Most Recent User */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/30 dark:to-indigo-900/30 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 mb-1">
                <User className="h-4 w-4" />
                <span className="text-sm font-medium">Most Recent User</span>
              </div>
              <CopyableValue value={
                chromebook.currentUser
                  ? `${chromebook.currentUser.firstName} ${chromebook.currentUser.lastName}`
                  : chromebook.mostRecentUser || 'None'
              }>
                <p className="text-lg font-bold text-indigo-900 dark:text-indigo-100">
                  {chromebook.currentUser
                    ? `${chromebook.currentUser.firstName} ${chromebook.currentUser.lastName}`
                    : chromebook.mostRecentUser || 'None'
                  }
                </p>
              </CopyableValue>
            </div>

            {/* WAN IP */}
            <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/30 dark:to-cyan-900/30 p-4 rounded-xl border border-cyan-200 dark:border-cyan-800">
              <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-300 mb-1">
                <Globe className="h-4 w-4" />
                <span className="text-sm font-medium">WAN IP</span>
              </div>
              <CopyableValue value={wanIp || 'Not Available'}>
                <p className="text-lg font-bold text-cyan-900 dark:text-cyan-100 font-mono">
                  {wanIp || 'Not Available'}
                </p>
              </CopyableValue>
            </div>
          </div>
        </div>

        {/* Current User Details (if checked out) */}
        {chromebook.currentUser && (
          <Card className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <UserCheck className="h-5 w-5" />
                Currently Checked Out
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <CopyableValue value={`${chromebook.currentUser.firstName} ${chromebook.currentUser.lastName}`}>
                    <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                      {chromebook.currentUser.firstName} {chromebook.currentUser.lastName}
                    </p>
                  </CopyableValue>
                  <CopyableValue value={chromebook.currentUser.studentId}>
                    <p className="text-green-600 dark:text-green-400 font-mono">
                      Student ID: {chromebook.currentUser.studentId}
                    </p>
                  </CopyableValue>
                </div>
                {chromebook.checkedOutDate && (
                  <div className="text-right">
                    <p className="text-sm text-green-600 dark:text-green-400">Checked out</p>
                    <CopyableValue value={formatDate(chromebook.checkedOutDate)}>
                      <div>
                        <p className="text-lg font-semibold text-green-800 dark:text-green-200">
                          {formatRelativeTime(chromebook.checkedOutDate)}
                        </p>
                        <p className="text-xs text-green-500 dark:text-green-500">
                          {formatDate(chromebook.checkedOutDate)}
                        </p>
                      </div>
                    </CopyableValue>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes Section */}
        {chromebook.notes && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {typeof chromebook.notes === 'string' ? (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <CopyableValue value={chromebook.notes}>
                    <p className="text-sm">{chromebook.notes}</p>
                  </CopyableValue>
                </div>
              ) : Array.isArray(chromebook.notes) && chromebook.notes.length > 0 ? (
                <div className="space-y-3">
                  {chromebook.notes.map((note, index) => (
                    <div key={note.id || index} className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <CopyableValue value={note.note}>
                        <p className="text-sm mb-2">{note.note}</p>
                      </CopyableValue>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(note.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500">No notes available</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Users Section */}
        <Collapsible open={showRecentUsers} onOpenChange={setShowRecentUsers}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full mb-4 justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Recent Users ({recentUsers.length})
              </div>
              {showRecentUsers ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Last 10 Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentUsers.length > 0 ? (
                  <div className="space-y-3">
                    {recentUsers.map((user, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <CopyableValue value={user.email}>
                              <p className="font-semibold">{user.email}</p>
                            </CopyableValue>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {user.type === 'USER_TYPE_MANAGED' ? 'Managed User' : user.type}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-500">No recent users available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Device History Section */}
        <Collapsible open={showDeviceHistory} onOpenChange={setShowDeviceHistory}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full mb-4 justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Device History
              </div>
              {showDeviceHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <DeviceHistory chromebookId={parseInt(chromebook.id)} />
          </CollapsibleContent>
        </Collapsible>

        {/* Maintenance History Section */}
        {chromebook.maintenanceHistory && chromebook.maintenanceHistory.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full mb-4 justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Maintenance History
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card>
                <CardHeader>
                  <CardTitle>Maintenance Log</CardTitle>
                </CardHeader>
                <CardContent>
                  {chromebook.maintenanceHistory.map((entry) => (
                    <div key={entry.id} className="mb-4">
                      <p><strong>Issue:</strong> {entry.issue}</p>
                      <p><strong>Status:</strong> {entry.status}</p>
                      <p><strong>Reported by:</strong> {entry.reportedBy} on {formatDate(entry.reportedDate)}</p>
                      {entry.completedDate && <p><strong>Completed on:</strong> {formatDate(entry.completedDate)}</p>}
                      {entry.comments && entry.comments.length > 0 && (
                        <div className="ml-4 mt-2">
                          <h4 className="font-semibold">Comments:</h4>
                          <ul className="list-disc pl-5 space-y-2">
                            {entry.comments.map((comment, index) => (
                              <li key={index}>
                                <p className="text-sm">{comment.text}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  - {comment.author} on {formatDate(comment.date)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {entry.photos && entry.photos.length > 0 && (
                        <div className="mt-4">
                          <h4 className="font-semibold">Photos:</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
                            {entry.photos.map((photoUrl, index) => (
                              <a key={index} href={photoUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={photoUrl}
                                  alt={`Maintenance Photo ${index + 1}`}
                                  className="w-full h-auto rounded-lg object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Advanced Details Section */}
        <Collapsible open={showAdvancedDetails} onOpenChange={setShowAdvancedDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full mb-4 justify-between">
              <div className="flex items-center gap-2">
                {showAdvancedDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                Advanced Details
              </div>
              {showAdvancedDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Network Information */}
              {(chromebook.macAddress || chromebook.lastKnownNetwork || chromebook.meid) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-cyan-700 dark:text-cyan-300">
                      <Network className="h-5 w-5" />
                      Network Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {chromebook.macAddress && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Wifi className="h-3 w-3" />
                          MAC Address
                        </div>
                        <CopyableValue value={chromebook.macAddress}>
                          <p className="text-sm font-mono">
                            {chromebook.macAddress}
                          </p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.lastKnownNetwork && chromebook.lastKnownNetwork.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                          <Globe className="h-3 w-3" />
                          Network Details
                        </div>
                        {chromebook.lastKnownNetwork.map((network, index) => (
                          <div key={index} className="space-y-1">
                            {network.ipAddress && (
                              <CopyableValue value={network.ipAddress}>
                                <p className="text-sm"><span className="font-medium">IP:</span> <span className="font-mono">{network.ipAddress}</span></p>
                              </CopyableValue>
                            )}
                            {network.wanIpAddress && (
                              <CopyableValue value={network.wanIpAddress}>
                                <p className="text-sm"><span className="font-medium">WAN IP:</span> <span className="font-mono">{network.wanIpAddress}</span></p>
                              </CopyableValue>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {chromebook.meid && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Smartphone className="h-3 w-3" />
                          MEID
                        </div>
                        <CopyableValue value={chromebook.meid}>
                          <p className="text-sm">
                            {chromebook.meid}
                          </p>
                        </CopyableValue>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* System Information */}
              {(chromebook.platformVersion || chromebook.osVersion || chromebook.firmwareVersion || chromebook.bootMode) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                      <Settings className="h-5 w-5" />
                      System Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {chromebook.platformVersion && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Monitor className="h-3 w-3" />
                          Platform Version
                        </div>
                        <CopyableValue value={chromebook.platformVersion}>
                          <p className="text-sm">{chromebook.platformVersion}</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.osVersion && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Settings className="h-3 w-3" />
                          OS Version
                        </div>
                        <CopyableValue value={chromebook.osVersion}>
                          <p className="text-sm">{chromebook.osVersion}</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.firmwareVersion && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Cpu className="h-3 w-3" />
                          Firmware Version
                        </div>
                        <CopyableValue value={chromebook.firmwareVersion}>
                          <p className="text-sm">{chromebook.firmwareVersion}</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.bootMode && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Zap className="h-3 w-3" />
                          Boot Mode
                        </div>
                        <CopyableValue value={chromebook.bootMode}>
                          <p className="text-sm">{chromebook.bootMode}</p>
                        </CopyableValue>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Hardware Information */}
              {(chromebook.systemRamTotal || chromebook.cpuStatusReports || chromebook.diskVolumeReports) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                      <Cpu className="h-5 w-5" />
                      Hardware Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {chromebook.systemRamTotal && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <MemoryStick className="h-3 w-3" />
                          Total RAM
                        </div>
                        <CopyableValue value={`${(chromebook.systemRamTotal / (1024 * 1024 * 1024)).toFixed(1)} GB`}>
                          <p className="text-sm">{(chromebook.systemRamTotal / (1024 * 1024 * 1024)).toFixed(1)} GB</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.cpuStatusReports && chromebook.cpuStatusReports.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Activity className="h-3 w-3" />
                          CPU Reports
                        </div>
                        <CopyableValue value={`${chromebook.cpuStatusReports.length} report(s) available`}>
                          <p className="text-sm">{chromebook.cpuStatusReports.length} report(s) available</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.diskVolumeReports && chromebook.diskVolumeReports.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <HardDrive className="h-3 w-3" />
                          Disk Reports
                        </div>
                        <CopyableValue value={`${chromebook.diskVolumeReports.length} volume(s) reported`}>
                          <p className="text-sm">{chromebook.diskVolumeReports.length} volume(s) reported</p>
                        </CopyableValue>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Support & Enrollment */}
              {(chromebook.lastEnrollmentTime || chromebook.supportEndDate || chromebook.orderNumber || chromebook.willAutoRenew !== undefined) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
                      <ShoppingCart className="h-5 w-5" />
                      Support & Enrollment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {chromebook.lastEnrollmentTime && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Calendar className="h-3 w-3" />
                          Last Enrollment
                        </div>
                        <CopyableValue value={formatDate(chromebook.lastEnrollmentTime)}>
                          <p className="text-sm">{formatDate(chromebook.lastEnrollmentTime)}</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.supportEndDate && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <AlertCircle className="h-3 w-3" />
                          Support End Date
                        </div>
                        <CopyableValue value={formatDate(chromebook.supportEndDate)}>
                          <p className="text-sm">{formatDate(chromebook.supportEndDate)}</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.orderNumber && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Hash className="h-3 w-3" />
                          Order Number
                        </div>
                        <CopyableValue value={chromebook.orderNumber}>
                          <p className="text-sm">{chromebook.orderNumber}</p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.willAutoRenew !== undefined && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <RefreshCw className="h-3 w-3" />
                          Auto Renew
                        </div>
                        <CopyableValue value={chromebook.willAutoRenew ? 'Enabled' : 'Disabled'}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${chromebook.willAutoRenew ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm">{chromebook.willAutoRenew ? 'Enabled' : 'Disabled'}</span>
                          </div>
                        </CopyableValue>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Additional Information */}
              {(chromebook.deviceId || chromebook.annotatedAssetId || chromebook.etag) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Database className="h-5 w-5" />
                      Additional Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {chromebook.deviceId && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <HardDrive className="h-3 w-3" />
                          Device ID
                        </div>
                        <CopyableValue value={chromebook.deviceId}>
                          <p className="font-mono text-sm">
                            {chromebook.deviceId}
                          </p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.annotatedAssetId && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Hash className="h-3 w-3" />
                          Annotated Asset ID
                        </div>
                        <CopyableValue value={chromebook.annotatedAssetId}>
                          <p className="font-mono text-sm">
                            {chromebook.annotatedAssetId}
                          </p>
                        </CopyableValue>
                      </div>
                    )}
                    {chromebook.etag && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                          <Database className="h-3 w-3" />
                          ETag
                        </div>
                        <CopyableValue value={chromebook.etag}>
                          <p className="font-mono text-sm break-all">
                            {chromebook.etag}
                          </p>
                        </CopyableValue>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </DialogContent>
    </Dialog>
  );
};

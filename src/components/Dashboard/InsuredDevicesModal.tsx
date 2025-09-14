import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChromebookDetailsDialog } from '@/components/Chromebooks/ChromebookDetailsDialog';
import { UserDetailsDialog } from '@/components/Users/UserDetailsDialog';
import { CheckinWorkflow } from '@/components/Checkin/CheckinWorkflow';
import { Chromebook, Checkout } from '@/types/chromebook';
import { GoogleUser } from '@/types/user';
import { useAuth } from '@/components/sso/SSOProvider';
import { Loader2, Printer, ArrowRight, Search, ArrowDown, ArrowUp, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebounce } from '@/hooks/useDebounce';

type SortKey = 'assetTag' | 'serialNumber' | 'studentName' | 'checkedOutDate' | 'insuranceStatus';

interface InsuredDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InsuredDevicesModal: React.FC<InsuredDevicesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [devices, setDevices] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('checkedOutDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedChromebook, setSelectedChromebook] = useState<Chromebook | null>(null);
  const [selectedUser, setSelectedUser] = useState<GoogleUser | null>(null);
  const [isChromebookDetailsOpen, setIsChromebookDetailsOpen] = useState(false);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [chromebookToCheckIn, setChromebookToCheckIn] = useState<Chromebook | null>(null);

  const { token, user } = useAuth();
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const fetchInsuredDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/checkouts/insured', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch insured devices');
      }
      const data = await response.json();
      setDevices(data.insuredDevices);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInsuredDevices();
    }
  }, [isOpen, token]);

  const getSortValue = (device: Checkout, key: SortKey) => {
    switch (key) {
      case 'assetTag':
        return device.chromebook?.assetTag || '';
      case 'serialNumber':
        return device.chromebook?.serialNumber || '';
      case 'studentName':
        return `${device.student?.firstName || ''} ${device.student?.lastName || ''}`;
      case 'checkedOutDate':
        return device.chromebook?.checkedOutDate ? new Date(device.chromebook.checkedOutDate).getTime() : 0;
      case 'insuranceStatus':
        return device.chromebook?.insurance || '';
    }
  };

  const filteredAndSortedDevices = React.useMemo(() => {
    let filtered = devices.filter(
      (device) =>
        (device.chromebook?.assetTag || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (device.chromebook?.serialNumber || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        `${device.student?.firstName || ''} ${device.student?.lastName || ''}`
          .toLowerCase()
          .includes(debouncedSearchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [devices, debouncedSearchTerm, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleChromebookClick = (device: Checkout) => {
    const chromebook: Chromebook = {
      id: (device.chromebook?.id || 'unknown').toString(),
      assetTag: device.chromebook?.assetTag || '',
      serialNumber: device.chromebook?.serialNumber || '',
      model: device.chromebook?.model || '',
      status: 'checked-out',
      orgUnit: '',
      currentUser: device.student ? {
        id: 0,
        studentId: device.student.studentId || '',
        firstName: device.student.firstName || '',
        lastName: device.student.lastName || '',
      } : null,
      checkedOutDate: device.chromebook?.checkedOutDate ? new Date(device.chromebook.checkedOutDate) : new Date(),
      isInsured: device.chromebook?.isInsured || false,
      insurance_status: (device.chromebook?.insurance as 'uninsured' | 'pending' | 'insured') || 'uninsured',
      notes: '',
      lastSync: new Date(),
      history: [],
      tags: [],
      lastUpdated: new Date(),
      lastKnownNetwork: [],
      recentUsers: [],
      supportEndDate: '',
      platformVersion: '',
      osVersion: '',
      firmwareVersion: '',
      macAddress: '',
      bootMode: '',
      deviceId: '',
      willAutoRenew: false,
    };
    setSelectedChromebook(chromebook);
    setIsChromebookDetailsOpen(true);
  };

  const handleUserClick = (device: Checkout) => {
    const user: GoogleUser = {
      id: device.student?.studentId || 'unknown',
      primaryEmail: device.student?.email || '',
      name: {
        fullName: `${device.student?.firstName || ''} ${device.student?.lastName || ''}`,
        givenName: device.student?.firstName || '',
        familyName: device.student?.lastName || '',
      },
      orgUnitPath: '',
      suspended: false,
      lastLoginTime: '',
      creationTime: '',
      thumbnailPhotoUrl: '',
    };
    setSelectedUser(user);
    setIsUserDetailsOpen(true);
  };

  const handleCheckIn = (device: Checkout) => {
    const chromebook: Chromebook = {
      id: (device.chromebook?.id || 'unknown').toString(),
      assetTag: device.chromebook?.assetTag || '',
      serialNumber: device.chromebook?.serialNumber || '',
      model: device.chromebook?.model || '',
      status: 'checked-out',
      orgUnit: '',
      currentUser: device.student ? {
        id: 0,
        studentId: device.student.studentId || '',
        firstName: device.student.firstName || '',
        lastName: device.student.lastName || '',
      } : null,
      checkedOutDate: device.chromebook?.checkedOutDate ? new Date(device.chromebook.checkedOutDate) : new Date(),
      isInsured: device.chromebook?.isInsured || false,
      insurance_status: (device.chromebook?.insurance as 'uninsured' | 'pending' | 'insured') || 'uninsured',
      notes: '',
      lastSync: new Date(),
      history: [],
      tags: [],
      lastUpdated: new Date(),
      lastKnownNetwork: [],
      recentUsers: [],
      supportEndDate: '',
      platformVersion: '',
      osVersion: '',
      firmwareVersion: '',
      macAddress: '',
      bootMode: '',
      deviceId: '',
      willAutoRenew: false,
    };
    setChromebookToCheckIn(chromebook);
  };

  const handlePrintAgreement = (device: Checkout) => {
    const url = `/api/checkouts/${device.id}/agreement?token=${token}`;
    window.open(url, '_blank');
  };

  const handleCheckinComplete = () => {
    setChromebookToCheckIn(null);
    fetchInsuredDevices();
  };

  const getInsuranceStatusDisplay = (insurance: string | undefined) => {
    switch (insurance) {
      case 'insured':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <Shield className="w-3 h-3 mr-1" />
            Insured
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Shield className="w-3 h-3 mr-1" />
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Uninsured
          </span>
        );
    }
  };

  return (
    <>
      <Dialog open={isOpen && !chromebookToCheckIn} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              Insured Devices
            </DialogTitle>
            <DialogDescription>
              List of all devices with insurance coverage (insured or pending).
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Search by asset tag, serial, or student name..."
              className="pl-9 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {loading && (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          {error && <p className="text-red-500">{error}</p>}
          {!loading && !error && (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead onClick={() => handleSort('assetTag')} className="cursor-pointer">
                      Asset Tag {sortKey === 'assetTag' && (sortDirection === 'asc' ? <ArrowUp className="inline h-4 w-4" /> : <ArrowDown className="inline h-4 w-4" />)}
                    </TableHead>
                    <TableHead onClick={() => handleSort('serialNumber')} className="cursor-pointer">
                      Serial Number {sortKey === 'serialNumber' && (sortDirection === 'asc' ? <ArrowUp className="inline h-4 w-4" /> : <ArrowDown className="inline h-4 w-4" />)}
                    </TableHead>
                    <TableHead onClick={() => handleSort('studentName')} className="cursor-pointer">
                      Student {sortKey === 'studentName' && (sortDirection === 'asc' ? <ArrowUp className="inline h-4 w-4" /> : <ArrowDown className="inline h-4 w-4" />)}
                    </TableHead>
                    <TableHead onClick={() => handleSort('insuranceStatus')} className="cursor-pointer">
                      Insurance Status {sortKey === 'insuranceStatus' && (sortDirection === 'asc' ? <ArrowUp className="inline h-4 w-4" /> : <ArrowDown className="inline h-4 w-4" />)}
                    </TableHead>
                    <TableHead onClick={() => handleSort('checkedOutDate')} className="cursor-pointer">
                      Checkout Date {sortKey === 'checkedOutDate' && (sortDirection === 'asc' ? <ArrowUp className="inline h-4 w-4" /> : <ArrowDown className="inline h-4 w-4" />)}
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedDevices.map((device) => (
                    <TableRow key={device.id || `${device.chromebook?.id || 'unknown'}-${device.student?.studentId || 'unknown'}`}>
                      <TableCell
                        className="font-semibold cursor-pointer hover:underline"
                        onClick={() => handleChromebookClick(device)}
                      >
                        {device.chromebook?.assetTag || 'N/A'}
                      </TableCell>
                      <TableCell>{device.chromebook?.serialNumber || 'N/A'}</TableCell>
                      <TableCell
                        className="font-semibold cursor-pointer hover:underline"
                        onClick={() => handleUserClick(device)}
                      >
                        {device.student?.firstName || 'N/A'} {device.student?.lastName || ''}
                      </TableCell>
                      <TableCell>
                        {getInsuranceStatusDisplay(device.chromebook?.insurance)}
                      </TableCell>
                      <TableCell>
                        {device.chromebook?.checkedOutDate ? new Date(device.chromebook.checkedOutDate).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCheckIn(device)}
                          >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Check-In
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintAgreement(device)}
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Print Agreement
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedChromebook && (
        <ChromebookDetailsDialog
          chromebook={selectedChromebook}
          isOpen={isChromebookDetailsOpen}
          onClose={() => setIsChromebookDetailsOpen(false)}
          userRole={user?.role}
        />
      )}

      {selectedUser && (
        <UserDetailsDialog
          user={selectedUser}
          isOpen={isUserDetailsOpen}
          onClose={() => setIsUserDetailsOpen(false)}
          onSuspendUser={() => {}}
          onUnsuspendUser={() => {}}
          onMoveUser={() => {}}
          userRole="admin"
        />
      )}

      {chromebookToCheckIn && (
        <Dialog open={!!chromebookToCheckIn} onOpenChange={() => setChromebookToCheckIn(null)}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Check-In: {chromebookToCheckIn.assetTag}</DialogTitle>
            </DialogHeader>
            <CheckinWorkflow
              chromebook={chromebookToCheckIn}
              onComplete={handleCheckinComplete}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

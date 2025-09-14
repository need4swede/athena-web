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
import { Loader2, Printer, ArrowRight, Search, ArrowDown, ArrowUp } from 'lucide-react';
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

type SortKey = 'assetTag' | 'serialNumber' | 'studentName' | 'checkedOutDate';

interface PendingAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PendingAgreementModal: React.FC<PendingAgreementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
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

  const fetchPendingAgreements = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/checkouts/pending', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch pending agreements');
      }
      const data = await response.json();
      setCheckouts(data.pendingCheckouts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPendingAgreements();
    }
  }, [isOpen, token]);

  const getSortValue = (checkout: Checkout, key: SortKey) => {
    switch (key) {
      case 'assetTag':
        return checkout.chromebook?.assetTag || '';
      case 'serialNumber':
        return checkout.chromebook?.serialNumber || '';
      case 'studentName':
        return `${checkout.student?.firstName || ''} ${checkout.student?.lastName || ''}`;
      case 'checkedOutDate':
        return checkout.chromebook?.checkedOutDate ? new Date(checkout.chromebook.checkedOutDate).getTime() : 0;
    }
  };

  const filteredAndSortedCheckouts = React.useMemo(() => {
    let filtered = checkouts.filter(
      (checkout) =>
        (checkout.chromebook?.assetTag || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (checkout.chromebook?.serialNumber || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        `${checkout.student?.firstName || ''} ${checkout.student?.lastName || ''}`
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
  }, [checkouts, debouncedSearchTerm, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleChromebookClick = (checkout: Checkout) => {
    const chromebook: Chromebook = {
      id: (checkout.chromebook?.id || 'unknown').toString(),
      assetTag: checkout.chromebook?.assetTag || '',
      serialNumber: checkout.chromebook?.serialNumber || '',
      model: checkout.chromebook?.model || '',
      status: 'pending',
      orgUnit: '',
      currentUser: checkout.student ? {
        id: 0,
        studentId: checkout.student.studentId || '',
        firstName: checkout.student.firstName || '',
        lastName: checkout.student.lastName || '',
      } : null,
      checkedOutDate: checkout.chromebook?.checkedOutDate ? new Date(checkout.chromebook.checkedOutDate) : new Date(),
      isInsured: checkout.chromebook?.isInsured || false,
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

  const handleUserClick = (checkout: Checkout) => {
    const user: GoogleUser = {
      id: checkout.student?.studentId || 'unknown',
      primaryEmail: checkout.student?.email || '',
      name: {
        fullName: `${checkout.student?.firstName || ''} ${checkout.student?.lastName || ''}`,
        givenName: checkout.student?.firstName || '',
        familyName: checkout.student?.lastName || '',
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

  const handlePrintAgreement = (checkout: Checkout) => {
    const url = `/api/checkouts/${checkout.id}/agreement?token=${token}`;
    window.open(url, '_blank');
  };

  const handleCheckIn = (checkout: Checkout) => {
    const chromebook: Chromebook = {
      id: (checkout.chromebook?.id || 'unknown').toString(),
      assetTag: checkout.chromebook?.assetTag || '',
      serialNumber: checkout.chromebook?.serialNumber || '',
      model: checkout.chromebook?.model || '',
      status: 'pending',
      orgUnit: '',
      currentUser: checkout.student ? {
        id: 0,
        studentId: checkout.student.studentId || '',
        firstName: checkout.student.firstName || '',
        lastName: checkout.student.lastName || '',
      } : null,
      checkedOutDate: checkout.chromebook?.checkedOutDate ? new Date(checkout.chromebook.checkedOutDate) : new Date(),
      isInsured: checkout.chromebook?.isInsured || false,
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

  const handleCheckinComplete = () => {
    setChromebookToCheckIn(null);
    fetchPendingAgreements();
  };

  return (
    <>
      <Dialog open={isOpen && !chromebookToCheckIn} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Pending Agreement</DialogTitle>
            <DialogDescription>
              List of all devices pending agreement.
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
                    <TableHead onClick={() => handleSort('checkedOutDate')} className="cursor-pointer">
                      Checkout Date {sortKey === 'checkedOutDate' && (sortDirection === 'asc' ? <ArrowUp className="inline h-4 w-4" /> : <ArrowDown className="inline h-4 w-4" />)}
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedCheckouts.map((checkout) => (
                    <TableRow key={checkout.id || `${checkout.chromebook?.id || 'unknown'}-${checkout.student?.studentId || 'unknown'}`}>
                      <TableCell
                        className="font-semibold cursor-pointer hover:underline"
                        onClick={() => handleChromebookClick(checkout)}
                      >
                        {checkout.chromebook?.assetTag || 'N/A'}
                      </TableCell>
                      <TableCell>{checkout.chromebook?.serialNumber || 'N/A'}</TableCell>
                      <TableCell
                        className="font-semibold cursor-pointer hover:underline"
                        onClick={() => handleUserClick(checkout)}
                      >
                        {checkout.student?.firstName || 'N/A'} {checkout.student?.lastName || ''}
                      </TableCell>
                      <TableCell>
                        {checkout.chromebook?.checkedOutDate ? new Date(checkout.chromebook.checkedOutDate).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCheckIn(checkout)}
                          >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Check-In
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintAgreement(checkout)}
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

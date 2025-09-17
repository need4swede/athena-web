import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/database';
import {
  Laptop,
  Users,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Download,
  Search
} from 'lucide-react';

interface ReportChromebook {
  id: number;
  assetTag: string;
  serialNumber: string;
  model: string;
  status: string;
  checkedOutDate: string | null;
  isInsured: boolean | null;
  insuranceStatus: string | null;
}

interface ReportStudent {
  studentId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  orgUnitPath: string | null;
}

interface ReportProcessedBy {
  name: string | null;
  email: string | null;
}

interface ReportCheckout {
  id: number | null;
  date: string | null;
  status: string | null;
  insurance: string | null;
  insuranceStatus: string | null;
}

interface ReportMeta {
  effectiveCheckoutDate: string | null;
  daysOut: number | null;
}

export interface CurrentCheckoutsReportEntry {
  chromebook: ReportChromebook;
  student: ReportStudent;
  processedBy: ReportProcessedBy;
  checkout: ReportCheckout;
  meta: ReportMeta;
}

interface CurrentCheckoutsReportProps {
  school?: string;
  checkoutBy?: string;
  includeSubdirectories?: boolean;
  includePending?: boolean;
}

const CurrentCheckoutsReport: React.FC<CurrentCheckoutsReportProps> = ({
  school = 'all',
  checkoutBy = '',
  includeSubdirectories = false,
  includePending = false
}) => {
  const [rows, setRows] = useState<CurrentCheckoutsReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (school && school !== 'all') {
          params.append('school', school);
        }
        if (checkoutBy) {
          params.append('checkoutBy', checkoutBy);
        }
        if (includeSubdirectories) {
          params.append('includeSubdirectories', 'true');
        }
        if (includePending) {
          params.append('includePending', 'true');
        }

        const query = params.toString();
        const data = await apiRequest(`/reports/current-checkouts${query ? `?${query}` : ''}`);
        setRows(data as CurrentCheckoutsReportEntry[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [school, checkoutBy, includeSubdirectories, includePending]);

  const filteredRows = useMemo(() => {
    let collection = rows;

    if (showPendingOnly) {
      collection = collection.filter((item) =>
        item.chromebook?.status === 'pending_signature' ||
        item.checkout?.status?.toLowerCase() === 'pending'
      );
    }

    if (!searchTerm) {
      return collection;
    }

    const needle = searchTerm.toLowerCase();

    return collection.filter((item) => {
      const studentName = `${item.student?.firstName || ''} ${item.student?.lastName || ''}`.trim();
      return (
        studentName.toLowerCase().includes(needle) ||
        (item.student?.studentId || '').toLowerCase().includes(needle) ||
        (item.student?.email || '').toLowerCase().includes(needle) ||
        (item.student?.orgUnitPath || '').toLowerCase().includes(needle) ||
        (item.chromebook?.assetTag || '').toLowerCase().includes(needle) ||
        (item.chromebook?.serialNumber || '').toLowerCase().includes(needle) ||
        (item.chromebook?.model || '').toLowerCase().includes(needle) ||
        (item.processedBy?.name || '').toLowerCase().includes(needle) ||
        (item.processedBy?.email || '').toLowerCase().includes(needle)
      );
    });
  }, [rows, searchTerm, showPendingOnly]);

  const summaryStats = useMemo(() => {
    const total = filteredRows.length;
    const uniqueStudents = new Set(
      filteredRows
        .map((item) => item.student?.studentId)
        .filter(Boolean)
    ).size;

    const pendingCount = filteredRows.filter((item) =>
      item.chromebook?.status === 'pending_signature' ||
      item.checkout?.status?.toLowerCase() === 'pending'
    ).length;

    const insuredCount = filteredRows.filter((item) => {
      const checkoutStatus = item.checkout?.insuranceStatus || item.checkout?.insurance;
      const chromebookStatus = item.chromebook?.insuranceStatus;
      if (checkoutStatus) {
        return checkoutStatus.toLowerCase() === 'insured';
      }
      if (chromebookStatus) {
        return chromebookStatus.toLowerCase() === 'insured';
      }
      return Boolean(item.chromebook?.isInsured);
    }).length;

    const totalDaysOut = filteredRows.reduce((sum, item) => (
      sum + (item.meta?.daysOut ?? 0)
    ), 0);

    const averageDaysOut = total > 0 ? totalDaysOut / total : 0;

    return {
      total,
      uniqueStudents,
      pendingCount,
      averageDaysOut,
      insuredCount,
      insuredPercent: total === 0 ? 0 : (insuredCount / total) * 100
    };
  }, [filteredRows]);

  const downloadCsv = () => {
    if (filteredRows.length === 0) {
      return;
    }

    const headers = [
      'Student Name',
      'Student ID',
      'Student Email',
      'Org Unit',
      'Asset Tag',
      'Serial Number',
      'Model',
      'Device Status',
      'Checkout Date',
      'Days Out',
      'Processed By',
      'Processed By Email',
      'Insurance Status',
    ];

    const csvRows = filteredRows.map((item) => {
      const studentName = `${item.student?.firstName || ''} ${item.student?.lastName || ''}`.trim();
      const checkoutDate = item.checkout?.date ? new Date(item.checkout.date).toLocaleString() : '';
      const insuranceStatus = (item.checkout?.insuranceStatus || item.checkout?.insurance || item.chromebook?.insuranceStatus || '').toString();

      const values = [
        studentName,
        item.student?.studentId || '',
        item.student?.email || '',
        item.student?.orgUnitPath || '',
        item.chromebook?.assetTag || '',
        item.chromebook?.serialNumber || '',
        item.chromebook?.model || '',
        item.chromebook?.status || '',
        checkoutDate,
        item.meta?.daysOut?.toString() || '',
        item.processedBy?.name || '',
        item.processedBy?.email || '',
        insuranceStatus
      ];

      return values.map((value) => `"${value}"`).join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const schoolName = school === 'all' ? 'all' : school.split('/').pop();
    const checkoutPerson = checkoutBy
      ? ` - ${checkoutBy.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}`
      : '';
    const filename = `Athena Report - Current Checkouts - ${date} - ${schoolName}${checkoutPerson}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatDate = (value: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u2022 ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getStatusBadgeVariant = (status?: string | null) => {
    const normalized = status?.toLowerCase();
    if (normalized === 'pending_signature') return 'secondary';
    return 'default';
  };

  const getInsuranceBadgeVariant = (status?: string | null, isInsured?: boolean | null) => {
    const normalized = status?.toLowerCase();
    if (normalized === 'insured' || isInsured) return 'default';
    if (normalized === 'pending') return 'secondary';
    return 'outline';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[80px]" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[240px]" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <div className="space-y-2">
                {[...Array(6)].map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-red-500 mb-2">Error loading current checkouts</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Devices Checked Out</CardTitle>
            <Laptop className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.uniqueStudents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Days Out</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.averageDaysOut.toFixed(1)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Insured Coverage</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.insuredCount}</div>
            <p className="text-xs text-muted-foreground">{summaryStats.insuredPercent.toFixed(0)}% of active devices</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Current Checkouts</CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="showPendingOnly"
                checked={showPendingOnly}
                onCheckedChange={(checked) => setShowPendingOnly(Boolean(checked))}
              />
              <label htmlFor="showPendingOnly" className="text-sm">Show pending signatures only</label>
            </div>
            <Button onClick={downloadCsv} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by student, device, org unit, or staff..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <span>{searchTerm ? 'No current checkouts match your search.' : 'No active checkouts found with the selected filters.'}</span>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Checkout</TableHead>
                    <TableHead>Processed By</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>Org Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((item, index) => {
                    const studentName = `${item.student?.firstName || ''} ${item.student?.lastName || ''}`.trim() || 'Unknown Student';
                    const insuranceStatus = item.checkout?.insuranceStatus || item.checkout?.insurance || item.chromebook?.insuranceStatus || (item.chromebook?.isInsured ? 'Insured' : 'Uninsured');
                    const statusBadgeVariant = getStatusBadgeVariant(item.chromebook?.status);
                    const insuranceBadgeVariant = getInsuranceBadgeVariant(insuranceStatus, item.chromebook?.isInsured);

                    return (
                      <TableRow key={`${item.chromebook?.id || 'row'}-${index}`}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{studentName}</div>
                            {item.student?.studentId && (
                              <div className="text-xs text-muted-foreground">ID: {item.student.studentId}</div>
                            )}
                            {item.student?.email && (
                              <div className="text-xs text-muted-foreground">{item.student.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{item.chromebook?.assetTag || 'Unknown Asset'}</div>
                            <div className="text-xs text-muted-foreground">SN: {item.chromebook?.serialNumber || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">{item.chromebook?.model || 'N/A'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{formatDate(item.meta?.effectiveCheckoutDate)}</div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(item.checkout?.date)}</div>
                            <div className="text-xs text-muted-foreground">
                              Days out: {item.meta?.daysOut ?? '0'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm">{item.processedBy?.name || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">{item.processedBy?.email || 'N/A'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant={insuranceBadgeVariant} className="w-fit capitalize">
                              {insuranceStatus ? insuranceStatus.replace('_', ' ') : 'Unknown'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground max-w-[180px] truncate" title={item.student?.orgUnitPath || undefined}>
                            {item.student?.orgUnitPath || 'N/A'}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredRows.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredRows.length} of {rows.length} checkouts
              {searchTerm && ` matching "${searchTerm}"`}
              {showPendingOnly && ' (pending signatures only)'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CurrentCheckoutsReport;

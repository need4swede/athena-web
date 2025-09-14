import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Search, DollarSign, FileText, Users, TrendingUp, Receipt } from 'lucide-react';

interface Payment {
  id: number;
  student_name: string;
  student_id: string;
  fee_description: string;
  amount: number;
  payment_method: string;
  transaction_id: string;
  notes: string;
  created_at: string;
  processed_by: string;
}

interface TransactionReportProps {
  school?: string;
  checkoutBy?: string;
  includeSubdirectories?: boolean;
}

const TransactionReport: React.FC<TransactionReportProps> = ({ school, checkoutBy, includeSubdirectories }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchPayments = async () => {
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
        const data = await apiRequest(`/reports/transactions?${params.toString()}`);
        setPayments(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [school, checkoutBy, includeSubdirectories]);

  // Filter payments based on search term
  const filteredPayments = useMemo(() => {
    if (!searchTerm) return payments;

    const lowercaseTerm = searchTerm.toLowerCase();
    return payments.filter(payment =>
      payment.student_name.toLowerCase().includes(lowercaseTerm) ||
      payment.student_id.toLowerCase().includes(lowercaseTerm) ||
      payment.fee_description.toLowerCase().includes(lowercaseTerm) ||
      payment.payment_method.toLowerCase().includes(lowercaseTerm) ||
      payment.transaction_id.toLowerCase().includes(lowercaseTerm) ||
      (payment.notes && payment.notes.toLowerCase().includes(lowercaseTerm))
    );
  }, [payments, searchTerm]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalAmount = filteredPayments.reduce((sum, payment) => {
      const amount = typeof payment.amount === 'string' ? parseFloat(payment.amount) : payment.amount;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    const totalTransactions = filteredPayments.length;
    const uniqueStudents = new Set(filteredPayments.map(p => p.student_id)).size;
    const paymentMethods = [...new Set(filteredPayments.map(p => p.payment_method))];

    return {
      totalAmount,
      totalTransactions,
      uniqueStudents,
      paymentMethods: paymentMethods.length
    };
  }, [filteredPayments]);

  const downloadCsv = () => {
    const headers = [
      'Student Name', 'Student ID', 'Fee Description', 'Amount',
      'Payment Method', 'Transaction ID', 'Notes', 'Processed By', 'Date'
    ];
    const rows = filteredPayments.map(p => [
      `"${p.student_name}"`,
      `"${p.student_id}"`,
      `"${p.fee_description || ''}"`,
      p.amount,
      `"${p.payment_method || ''}"`,
      `"${p.transaction_id}"`,
      `"${p.notes || ''}"`,
      `"${p.processed_by || ''}"`,
      `"${new Date(p.created_at).toLocaleDateString()}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const schoolName = school === 'all' ? 'all' : school?.split('/').pop();
    const checkoutPerson = checkoutBy ? ` - ${checkoutBy.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}` : '';
    const filename = `Athena Report - Transactions - ${date} - ${schoolName}${checkoutPerson}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadReceipts = async () => {
    if (filteredPayments.length === 0) {
      alert('No transactions to export');
      return;
    }

    try {
      const response = await fetch('/api/receipts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions: filteredPayments }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      const date = new Date().toISOString().split('T')[0];
      const schoolName = school === 'all' ? 'all' : school?.split('/').pop();
      const checkoutPerson = checkoutBy ? ` - ${checkoutBy.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}` : '';
      const filename = `Athena Report - Receipts - ${date} - ${schoolName}${checkoutPerson}.pdf`;

      link.href = url;
      link.download = filename;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading receipts:', error);
      alert('Failed to download receipts. Please try again.');
    }
  };

  const getPaymentMethodColor = (method: string) => {
    const methodLower = method?.toLowerCase() || '';
    if (methodLower.includes('cash')) return 'default';
    if (methodLower.includes('check')) return 'secondary';
    if (methodLower.includes('card') || methodLower.includes('credit')) return 'destructive';
    if (methodLower.includes('online')) return 'outline';
    return 'secondary';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[60px]" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[200px]" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
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
            <div className="text-red-500 mb-2">Error loading transaction report</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${summaryStats.totalAmount.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.totalTransactions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students with Payments</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.uniqueStudents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Methods</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.paymentMethods}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Report Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payment Transaction Details</CardTitle>
          <div className="flex gap-2">
            <Button onClick={downloadCsv} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={downloadReceipts} variant="outline" size="sm">
              <Receipt className="mr-2 h-4 w-4" />
              Export Receipts
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by student name, ID, transaction ID, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-muted-foreground">
                {searchTerm ? 'No transactions found matching your search.' : 'No payment transactions found.'}
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Information</TableHead>
                    <TableHead>Fee Details</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Processed By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{payment.student_name}</div>
                          <div className="text-sm text-muted-foreground">ID: {payment.student_id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <div className="font-medium truncate" title={payment.fee_description}>
                            {payment.fee_description || 'N/A'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-green-600">
                          ${typeof payment.amount === 'string' ? parseFloat(payment.amount).toFixed(2) : payment.amount.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPaymentMethodColor(payment.payment_method)}>
                          {payment.payment_method || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm bg-muted px-2 py-1 rounded">
                          {payment.transaction_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {payment.processed_by || 'System'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(payment.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(payment.created_at).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[150px]">
                          {payment.notes ? (
                            <div
                              className="text-sm text-muted-foreground truncate cursor-help"
                              title={payment.notes}
                            >
                              {payment.notes}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">—</div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredPayments.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredPayments.length} of {payments.length} transactions
              {searchTerm && ` matching "${searchTerm}"`}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TransactionReport;

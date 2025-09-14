import React, { useState, useEffect } from 'react';
import { StudentFee } from '@/types/fees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/sso/SSOProvider';
import { format } from 'date-fns';
import { Archive, FileText, PlusCircle, Trash2, XCircle } from 'lucide-react';

interface StudentFeesProps {
    studentId: number;
    userRole?: 'user' | 'admin' | 'super-admin';
    studentName?: string;
    studentIdNumber?: string;
}

const StudentFees: React.FC<StudentFeesProps> = ({ studentId, studentName, studentIdNumber, userRole }) => {
    const [fees, setFees] = useState<StudentFee[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const { token } = useAuth();

    // Super Admin: Delete a payment (transaction) with custom confirmation dialog
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; paymentId?: number }>({ open: false });
    const handleDeletePayment = (paymentId: number) => {
        setDeleteDialog({ open: true, paymentId });
    };
    const confirmDeletePayment = async () => {
        if (!deleteDialog.paymentId) return;
        try {
            const response = await fetch(`/api/payments/${deleteDialog.paymentId}`, {
                method: 'DELETE',
                headers: {
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete payment');
            }
            toast({
                title: 'Success',
                description: 'Payment deleted successfully.',
            });
            fetchFees();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete payment.',
                variant: 'destructive',
            });
        } finally {
            setDeleteDialog({ open: false });
        }
    };
    const cancelDeletePayment = () => setDeleteDialog({ open: false });

    // Super Admin: Archive a payment (convert to credit) with custom confirmation dialog
    const [archiveDialog, setArchiveDialog] = useState<{ open: boolean; paymentId?: number; paymentInfo?: any }>({ open: false });
    const handleArchivePayment = (paymentId: number, paymentInfo: any) => {
        setArchiveDialog({ open: true, paymentId, paymentInfo });
    };
    const confirmArchivePayment = async () => {
        if (!archiveDialog.paymentId) return;
        try {
            const response = await fetch(`/api/payments/${archiveDialog.paymentId}/archive`, {
                method: 'POST',
                headers: {
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to archive payment');
            }
            toast({
                title: 'Success',
                description: 'Payment archived as credit successfully. It can now be applied to future fees.',
            });
            fetchFees();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to archive payment.',
                variant: 'destructive',
            });
        } finally {
            setArchiveDialog({ open: false });
        }
    };
    const cancelArchivePayment = () => setArchiveDialog({ open: false });

    const fetchFees = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/students/${studentId}/fees`, {
                headers: {
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch fees');
            }
            const data = await response.json();
            setFees(data);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to fetch student fees.',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (studentId) {
            fetchFees();
        }
    }, [studentId]);

    const handleAddPayment = async (feeId: number, amount: number, paymentMethod: string, notes: string) => {
        try {
            const response = await fetch(`/api/fees/${feeId}/payments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
                body: JSON.stringify({ amount, payment_method: paymentMethod, notes }),
            });

            if (!response.ok) {
                throw new Error('Failed to add payment');
            }

            toast({
                title: 'Success',
                description: 'Payment added successfully.',
            });
            fetchFees(); // Refresh the fees list
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to add payment.',
                variant: 'destructive',
            });
        }
    };

    const handleAddFee = async (amount: number, description: string) => {
        try {
            const response = await fetch(`/api/students/${studentId}/fees`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
                body: JSON.stringify({ amount, description }),
            });

            if (!response.ok) {
                throw new Error('Failed to add fee');
            }

            toast({
                title: 'Success',
                description: 'Fee added successfully.',
            });
            fetchFees();
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to add fee.',
                variant: 'destructive',
            });
        }
    };

    const handleRemoveFee = async (feeId: number) => {
        try {
            const response = await fetch(`/api/fees/${feeId}`, {
                method: 'DELETE',
                headers: {
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to remove fee');
            }

            toast({
                title: 'Success',
                description: 'Fee removed successfully.',
            });
            fetchFees();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to remove fee.',
                variant: 'destructive',
            });
        }
    };

    const handlePrintReceipt = async () => {
        try {
            // Calculate totals
            const totalOwed = fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
            const totalPaid = fees.reduce((sum, fee) => {
                const payments = fee.payments || [];
                return sum + payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0);
            }, 0);
            const remainingBalance = fees.reduce((sum, fee) => sum + Number(fee.balance), 0);

            const receiptData = {
                student: {
                    name: studentName || 'Unknown Student',
                    studentId: studentIdNumber || 'Unknown ID',
                },
                fees: fees.map(fee => ({
                    id: fee.id,
                    description: fee.description,
                    amount: Number(fee.amount),
                    balance: Number(fee.balance),
                    created_at: fee.created_at,
                    device_asset_tag: fee.device_asset_tag,
                    payments: (fee.payments || []).map(payment => ({
                        id: payment.id,
                        amount: Number(payment.amount),
                        payment_method: payment.payment_method,
                        notes: payment.notes,
                        created_at: payment.created_at,
                        transaction_id: payment.transaction_id,
                    })),
                })),
                totalOwed,
                totalPaid,
                remainingBalance,
                receiptDate: new Date().toISOString(),
            };

            const response = await fetch('/api/receipts/fee', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
                body: JSON.stringify(receiptData),
            });

            if (!response.ok) {
                throw new Error('Failed to generate receipt');
            }

            // Download the PDF
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `fee_receipt_${studentName || 'student'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast({
                title: 'Success',
                description: 'Fee receipt downloaded successfully.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to generate receipt.',
                variant: 'destructive',
            });
        }
    };

    if (loading) {
        return <div>Loading fees...</div>;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Outstanding Fees</h3>
                <div className="flex items-center space-x-2">
                    {(userRole === 'admin' || userRole === 'super-admin') && (
                        <AddFeeDialog onAddFee={handleAddFee} />
                    )}
                    {fees.length > 0 && (
                        <Button
                            onClick={handlePrintReceipt}
                            variant="outline"
                            size="sm"
                            className="flex items-center space-x-2"
                        >
                            <FileText className="w-4 h-4" />
                            <span>Print Receipt</span>
                        </Button>
                    )}
                </div>
            </div>
            {fees.length === 0 ? (
                <p>No outstanding fees.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Balance</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fees.map((fee) => (
                            <TableRow key={fee.id}>
                                <TableCell>{format(new Date(fee.created_at), 'PPP')}</TableCell>
                                <TableCell>{fee.description}</TableCell>
                                <TableCell>${Number(fee.amount).toFixed(2)}</TableCell>
                                <TableCell>${Number(fee.balance).toFixed(2)}</TableCell>
                                <TableCell className="flex flex-col space-y-2">
                                    <AddPaymentDialog fee={fee} onAddPayment={handleAddPayment} onRefresh={fetchFees} />
                                    {(userRole === 'admin' || userRole === 'super-admin') && (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => handleRemoveFee(fee.id)}
                                            className="mt-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                    {/* List payments for this fee */}
                                    {fee.payments && fee.payments.length > 0 && (
                                        <div className="mt-2 border-t pt-2">
                                            <div className="text-xs font-semibold mb-1">Payments</div>
                                            <ul className="space-y-1">
                                                {fee.payments.map((payment) => (
                                                    <li key={payment.id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
                                                        <span>
                                                            ${Number(payment.amount).toFixed(2)}
                                                            {payment.payment_method ? ` (${payment.payment_method})` : ''}
                                                            {payment.transaction_id ? ` | ID: ${payment.transaction_id}` : ''}
                                                            {payment.created_at ? ` | ${format(new Date(payment.created_at), 'MMM d, yyyy')}` : ''}
                                                        </span>
                                                        {userRole === 'super-admin' && (
                                                            <div className="flex items-center space-x-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    title="Archive Payment (Convert to Credit)"
                                                                    onClick={() => handleArchivePayment(payment.id, payment)}
                                                                >
                                                                    <Archive className="w-4 h-4 text-blue-500" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    title="Delete Payment"
                                                                    onClick={() => handleDeletePayment(payment.id)}
                                                                >
                                                                    <XCircle className="w-4 h-4 text-red-500" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        {/* Delete Payment Confirmation Dialog */}
        <Dialog open={deleteDialog.open} onOpenChange={cancelDeletePayment}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete Payment</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p>Are you sure you want to delete this payment? This action cannot be undone.</p>
                </div>
                <DialogFooter>
                    <Button variant="destructive" onClick={confirmDeletePayment}>Delete</Button>
                    <Button variant="outline" onClick={cancelDeletePayment}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Archive Payment Confirmation Dialog */}
        <Dialog open={archiveDialog.open} onOpenChange={cancelArchivePayment}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Archive Payment as Credit</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-3">
                    <p>Are you sure you want to archive this payment as a credit?</p>
                    {archiveDialog.paymentInfo && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-sm font-medium">Payment Details:</p>
                            <p className="text-sm">Amount: ${Number(archiveDialog.paymentInfo.amount).toFixed(2)}</p>
                            <p className="text-sm">Method: {archiveDialog.paymentInfo.payment_method}</p>
                            <p className="text-sm">Transaction ID: {archiveDialog.paymentInfo.transaction_id}</p>
                            {archiveDialog.paymentInfo.created_at && (
                                <p className="text-sm">Date: {format(new Date(archiveDialog.paymentInfo.created_at), 'PPP')}</p>
                            )}
                        </div>
                    )}
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                        <p className="text-sm text-yellow-800 dark:text-yellow-400">
                            <strong>Note:</strong> This payment will be converted to a credit that can be applied to future insurance fees for this student.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="default" onClick={confirmArchivePayment}>Archive as Credit</Button>
                    <Button variant="outline" onClick={cancelArchivePayment}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
    );
};

interface AddPaymentDialogProps {
    fee: StudentFee;
    onAddPayment: (feeId: number, amount: number, paymentMethod: string, notes: string) => void;
    onRefresh: () => void;
}

export const AddPaymentDialog: React.FC<AddPaymentDialogProps> = ({ fee, onAddPayment, onRefresh }) => {
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [notes, setNotes] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [validationError, setValidationError] = useState('');
    const [previousPayments, setPreviousPayments] = useState<any[]>([]);
    const [appliedPreviousPayments, setAppliedPreviousPayments] = useState<any[]>([]);
    const [loadingPreviousPayments, setLoadingPreviousPayments] = useState(false);
    const { token } = useAuth();
    const { toast } = useToast();

    const feeBalance = Number(fee.balance);
    const enteredAmount = parseFloat(amount) || 0;
    const totalApplied = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const isAmountValid = (enteredAmount + totalApplied) > 0 && (enteredAmount + totalApplied) <= feeBalance;

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAmount(value);

        const numericValue = parseFloat(value) || 0;
        if (numericValue <= 0) {
            setValidationError('Amount must be greater than $0');
        } else if (numericValue > feeBalance) {
            setValidationError(`Amount cannot exceed the fee balance of $${feeBalance.toFixed(2)}`);
        } else {
            setValidationError('');
        }
    };

    const handlePayFullBalance = () => {
        setAmount(feeBalance.toFixed(2));
        setValidationError('');
    };

    const handleSubmit = () => {
        if (!isAmountValid) {
            return;
        }
        onAddPayment(fee.id, parseFloat(amount), paymentMethod, notes);
        setIsOpen(false);
        // Reset form
        setAmount('');
        setNotes('');
        setValidationError('');
    };

    // Fetch previous insurance payments for the student when dialog opens
    const fetchPreviousPayments = async () => {
        if (fee.description !== 'Device Insurance Fee' || !fee.student_id) return;

        setLoadingPreviousPayments(true);
        try {
            const response = await fetch(`/api/students/${fee.student_id}/available-credits`, {
                headers: {
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
            });

            if (response.ok) {
                const payments = await response.json();
                setPreviousPayments(payments);
            }
        } catch (error) {
            console.error('Error fetching available credits:', error);
        } finally {
            setLoadingPreviousPayments(false);
        }
    };

    // Apply a previous payment to reduce the current amount owed
    const applyPreviousPayment = async (payment: any) => {
        try {
            const response = await fetch(`/api/fees/${fee.id}/apply-previous-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
                body: JSON.stringify({
                    transaction_id: payment.transaction_id,
                    amount: Number(payment.amount), // Convert to number
                    payment_method: payment.payment_method,
                    notes: payment.notes || '', // Convert null to empty string
                    processed_by_user_id: Number(payment.processed_by_user_id), // Ensure it's a number
                    created_at: payment.created_at
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to apply previous payment');
            }

            toast({
                title: 'Success',
                description: 'Previous payment applied successfully.',
            });

            // Close dialog and refresh fees gracefully
            setIsOpen(false);
            onRefresh(); // Refresh the data gracefully

        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to apply previous payment.',
                variant: 'destructive',
            });
        }
    };

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (open && fee.description === 'Device Insurance Fee') {
            fetchPreviousPayments();
        }
        if (!open) {
            // Reset form when closing
            setAmount('');
            setNotes('');
            setValidationError('');
            setPreviousPayments([]);
            setAppliedPreviousPayments([]);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm">Add Payment</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Payment for {fee.description}</DialogTitle>
                    <DialogDescription>
                        Outstanding Balance: ${Number(fee.balance).toFixed(2)}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    {/* Previous Payments Section for Insurance Fees */}
                    {fee.description === 'Device Insurance Fee' && (
                        <div>
                            {loadingPreviousPayments ? (
                                <div className="text-center text-sm text-gray-600 dark:text-gray-400 py-4">
                                    Loading previous payments...
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <Label className="text-sm font-medium">Previous Insurance Payments</Label>
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                        {previousPayments.length > 0 ? (
                                            <>
                                                <p className="text-xs text-blue-800 dark:text-blue-400 mb-3">
                                                    Previous insurance payments from this student are available. Click "Apply" to use them toward this fee.
                                                </p>
                                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                                    {previousPayments.map((payment) => (
                                                        <div key={payment.id || payment.transaction_id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border text-xs">
                                                            <div className="flex-1">
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="font-medium">${Number(payment.amount).toFixed(2)} - {payment.payment_method}</span>
                                                                    <span className="text-gray-500 dark:text-gray-400">
                                                                        {format(new Date(payment.created_at), 'MMM d, yyyy')}
                                                                    </span>
                                                                </div>
                                                                {payment.original_asset_tag && (
                                                                    <p className="text-gray-700 dark:text-gray-300">Asset Tag: {payment.original_asset_tag}</p>
                                                                )}
                                                                {payment.notes && (
                                                                    <p className="text-gray-600 dark:text-gray-400">{payment.notes}</p>
                                                                )}
                                                                {payment.transaction_id && (
                                                                    <p className="text-gray-500 dark:text-gray-500">ID: {payment.transaction_id}</p>
                                                                )}
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                onClick={() => applyPreviousPayment(payment)}
                                                                className="ml-2 h-6 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                                                            >
                                                                Apply
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-xs text-blue-800 dark:text-blue-400 mb-3">
                                                No previous insurance payments available to apply.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="amount" className="text-right">
                            Amount
                        </Label>
                        <div className="col-span-3 space-y-2">
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0"
                                max={feeBalance}
                                value={amount}
                                onChange={handleAmountChange}
                                className={validationError ? "border-red-500" : ""}
                                placeholder="0.00"
                            />
                            {feeBalance > 0 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handlePayFullBalance}
                                    className="w-full"
                                >
                                    Pay Full Balance (${feeBalance.toFixed(2)})
                                </Button>
                            )}
                            {validationError && (
                                <p className="text-sm text-red-500">{validationError}</p>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="paymentMethod" className="text-right">
                            Payment Method
                        </Label>
                        <Input
                            id="paymentMethod"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="col-span-3"
                            placeholder="e.g., Cash, Check, Card"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="notes" className="text-right">
                            Notes
                        </Label>
                        <Input
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="col-span-3"
                            placeholder="Optional notes"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isAmountValid || !amount}
                    >
                        Save Payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

interface AddFeeDialogProps {
    onAddFee: (amount: number, description: string) => void;
}

const AddFeeDialog: React.FC<AddFeeDialogProps> = ({ onAddFee }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const handleSubmit = () => {
        onAddFee(parseFloat(amount), description);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="flex items-center space-x-2">
                    <PlusCircle className="w-4 h-4" />
                    <span>Add Fee</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add New Fee</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">
                            Description
                        </Label>
                        <Input
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="amount" className="text-right">
                            Amount
                        </Label>
                        <Input
                            id="amount"
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit}>Save Fee</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default StudentFees;

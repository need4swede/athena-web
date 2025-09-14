import express from 'express';
import { PDFService } from '../services/pdfService';
import { SandboxOverlay } from '../services/sandboxOverlay';
import { query } from '../database';

const router = express.Router();

import { SandboxMetrics } from '../services/sandboxMetrics';

router.post('/checkin', async (req: any, res) => {
    try {
        const receiptData = req.body;
        const pdfBuffer = await PDFService.generateCheckinReceipt(receiptData, { sandbox: !!req.sandbox });

        res.setHeader('Content-Type', 'application/pdf');
        const filename = `receipt${req.sandbox ? '_SBX' : ''}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(pdfBuffer);
        if (req.sandbox && req.user?.id) SandboxOverlay.incReceipts(req.user.id);
        if (req.sandbox) SandboxMetrics.incPdfGenerated();
    } catch (error) {
        console.error('Failed to generate checkin receipt:', error);
        res.status(500).send('Failed to generate receipt');
    }
});

router.post('/maintenance', async (req: any, res) => {
    try {
        const receiptData = req.body;
        console.log('📄 Receipt request data:', JSON.stringify(receiptData, null, 2));

        let pdfBuffer: Buffer;
        let filename: string;

        if (req.sandbox) {
            // In sandbox: always generate fresh, never read/write disk
            pdfBuffer = await PDFService.generateMaintenanceReceipt(receiptData, { sandbox: true });
            filename = PDFService.generateMaintenanceReceiptFilename(receiptData).replace('.pdf', '_SBX.pdf');
        } else {
            try {
                // Check if a receipt already exists for this maintenance record
                const existingReceiptPath = await PDFService.findExistingMaintenanceReceipt(receiptData);

                if (existingReceiptPath) {
                    // Use existing receipt
                    filename = PDFService.generateMaintenanceReceiptFilename(receiptData);
                    pdfBuffer = await PDFService.readMaintenanceReceipt(filename);
                    console.log(`📄 Using existing receipt: ${filename}`);
                } else {
                    // Generate new receipt
                    pdfBuffer = await PDFService.generateMaintenanceReceipt(receiptData, { sandbox: false });
                    filename = PDFService.generateMaintenanceReceiptFilename(receiptData);
                    console.log(`📄 Generated new receipt: ${filename}`);
                }
            } catch (fileError) {
                console.error('📄 File operations failed, falling back to direct generation:', fileError);
                // Fallback to direct generation without file checking
                pdfBuffer = await PDFService.generateMaintenanceReceipt(receiptData, { sandbox: false });
                filename = PDFService.generateMaintenanceReceiptFilename(receiptData);
                console.log('📄 Generated fallback receipt');
            }
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
        if (req.sandbox && req.user?.id) SandboxOverlay.incReceipts(req.user.id);
        if (req.sandbox) SandboxMetrics.incPdfGenerated();
    } catch (error) {
        console.error('Failed to generate maintenance receipt:', error);
        res.status(500).send('Failed to generate receipt');
    }
});

router.post('/fee', async (req: any, res) => {
    try {
        const receiptData = req.body;
        console.log('📄 Fee receipt request data:', JSON.stringify(receiptData, null, 2));

        const pdfBuffer = await PDFService.generateFeeReceipt(receiptData, { sandbox: !!req.sandbox });
        const filename = PDFService.generateFeeReceiptFilename(receiptData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${req.sandbox ? filename.replace('.pdf','_SBX.pdf') : filename}"`);
        res.send(pdfBuffer);
        if (req.sandbox && req.user?.id) SandboxOverlay.incReceipts(req.user.id);
        if (req.sandbox) SandboxMetrics.incPdfGenerated();
    } catch (error) {
        console.error('Failed to generate fee receipt:', error);
        res.status(500).send('Failed to generate receipt');
    }
});

router.post('/checkout', async (req: any, res) => {
    try {
        const receiptData = req.body;
        console.log('📄 Checkout receipt request data:', JSON.stringify(receiptData, null, 2));

        // Map transactionId to paymentTransactionId for backwards compatibility
        if (receiptData.transactionId && !receiptData.paymentTransactionId) {
            receiptData.paymentTransactionId = receiptData.transactionId;
        }

        const pdfBuffer = await PDFService.generateCheckoutReceipt(receiptData, { sandbox: !!req.sandbox });
        const filename = PDFService.generateCheckoutReceiptFilename(receiptData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${req.sandbox ? filename.replace('.pdf','_SBX.pdf') : filename}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Failed to generate checkout receipt:', error);
        res.status(500).send('Failed to generate receipt');
    }
});

router.post('/bulk', async (req: any, res) => {
    try {
        const { transactions } = req.body;
        console.log('📄 Bulk receipt request for', transactions.length, 'transactions');

        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ error: 'No transactions provided' });
        }

        // Group transactions by student_id to get unique students
        const studentIds = [...new Set(transactions.map(t => t.student_id))];
        console.log('📄 Processing receipts for', studentIds.length, 'unique students');

        // Use the existing working getStudentFees function that already has proper device lookup
        const { getStudentFees } = await import('../services/feeService');
        const studentReceiptData = await Promise.all(
            studentIds.map(async (studentIdNumber) => {
                try {
                    // Find the student by student_id number
                    const studentResult = await query(`
                        SELECT id, student_id, first_name, last_name, email
                        FROM students
                        WHERE student_id = $1
                    `, [studentIdNumber]);

                    if (studentResult.rows.length === 0) {
                        console.warn(`Student not found: ${studentIdNumber}`);
                        return null;
                    }

                    const student = studentResult.rows[0];

                    // Use the existing working function that already handles device lookup correctly
                    const fees = await getStudentFees(student.id);

                    if (fees.length === 0) {
                        console.warn(`No fees found for student: ${studentIdNumber}`);
                        return null;
                    }

                    // Calculate totals using the same logic as StudentFees component
                    const totalOwed = fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
                    const totalPaid = fees.reduce((sum, fee) => {
                        const payments = fee.payments || [];
                        return sum + payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0);
                    }, 0);
                    const remainingBalance = fees.reduce((sum, fee) => sum + Number(fee.balance), 0);

                    return {
                        student: {
                            name: `${student.first_name} ${student.last_name}`,
                            studentId: student.student_id
                        },
                        fees: fees.map(fee => ({
                            id: fee.id!,
                            description: fee.description,
                            amount: Number(fee.amount),
                            balance: Number(fee.balance),
                            created_at: typeof fee.created_at === 'string' ? fee.created_at : fee.created_at?.toISOString() || new Date().toISOString(),
                            device_asset_tag: fee.device_asset_tag,
                            payments: (fee.payments || []).map(payment => ({
                                id: payment.id!,
                                amount: Number(payment.amount),
                                payment_method: payment.payment_method,
                                notes: payment.notes,
                                created_at: typeof payment.created_at === 'string' ? payment.created_at : payment.created_at?.toISOString() || new Date().toISOString(),
                                transaction_id: payment.transaction_id,
                            })),
                        })),
                        totalOwed,
                        totalPaid,
                        remainingBalance,
                        receiptDate: new Date().toISOString()
                    };
                } catch (error) {
                    console.error(`Error fetching data for student ${studentIdNumber}:`, error);
                    return null;
                }
            })
        );

        // Filter out any null results and generate receipts
        const validReceiptData = studentReceiptData.filter(data => data !== null);

        if (validReceiptData.length === 0) {
            return res.status(400).json({ error: 'No valid student data found for receipt generation' });
        }

        console.log('📄 Generating receipts for', validReceiptData.length, 'students');
        const pdfBuffer = await PDFService.generateBulkReceipts(validReceiptData, { sandbox: !!req.sandbox });

        const date = new Date().toISOString().split('T')[0];
        const filename = `Transaction_Receipts_${date}${req.sandbox ? '_SBX' : ''}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        if (req.sandbox) SandboxMetrics.incPdfGenerated();
        return res.send(pdfBuffer);
    } catch (error) {
        console.error('Failed to generate bulk receipts:', error);
        return res.status(500).send('Failed to generate bulk receipts');
    }
});

export default router;

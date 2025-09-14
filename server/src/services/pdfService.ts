import { PDFDocument, PDFTextField, PDFCheckBox, rgb, StandardFonts } from 'pdf-lib';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import QRCode from 'qrcode';
import sharp from 'sharp';

interface CheckinReceiptData {
    chromebook: {
        assetTag: string;
        serialNumber: string;
        model: string;
    };
    student: {
        name: string;
        studentId: string;
    };
    checkinDate: string;
    damageLocations: { area: string; damageType: string; severity: string; description?: string }[];
    repairRecommendations: { item: string; cost: number; priority: string; description: string }[];
    totalCost: number;
    newStatus: string;
    notes?: string;
    specialInstructions?: string;
}

interface MaintenanceReceiptData {
    chromebook: {
        assetTag: string;
        serialNumber: string;
        model: string;
    };
    student: {
        name: string;
        studentId: string;
    };
    maintenanceDate: string;
    isInsured: boolean;
    damageLocations: { area: string; damageType: string; severity: string; description?: string }[];
    repairRecommendations: { item: string; cost: number; priority: string; description: string }[];
    totalCost: number;
    notes?: string;
    specialInstructions?: string;
}

interface FeeReceiptData {
    student: {
        name: string;
        studentId: string;
    };
    fees: {
        id: number;
        description: string;
        amount: number;
        balance: number;
        created_at: string;
        device_asset_tag?: string;
        payments: {
            id: number;
            amount: number;
            payment_method?: string;
            notes?: string;
            created_at: string;
            transaction_id?: string;
        }[];
    }[];
    totalOwed: number;
    totalPaid: number;
    remainingBalance: number;
    receiptDate: string;
}

interface CheckoutReceiptData {
    student: {
        name: string;
        studentId: string;
    };
    chromebook: {
        assetTag: string;
        serialNumber: string;
        model: string;
    };
    checkoutDate: string;
    insuranceStatus: 'uninsured' | 'pending' | 'insured';
    paymentMethod?: string;
    insuranceFee?: number;
    paymentAmount?: number;
    paymentNotes?: string;
    paymentTransactionId?: string;
    appliedCredits?: {
        transaction_id: string;
        amount: number;
        payment_method: string;
        original_asset_tag?: string;
        notes?: string;
    }[];
    notes?: string;
}

interface CheckoutAgreementData {
    studentName: string;
    studentId: string;
    deviceSerial: string;
    deviceAssetTag: string;
    isInsured: boolean;
    checkoutDate: Date;
    signature?: string;
    parentSignature?: string;
    isPending?: boolean;
}

export class PDFService {
    private static readonly AGREEMENT_TEMPLATE_PATH = 'public/agreement.pdf';
    private static readonly RECEIPT_TEMPLATE_PATH = 'public/template.pdf';
    private static readonly OUTPUT_DIR_ACTIVE = 'files/agreements/active';
    private static readonly OUTPUT_DIR_PENDING = 'files/agreements/pending';
    private static readonly OUTPUT_DIR_ARCHIVE = 'files/agreements/archive';
    private static readonly OUTPUT_DIR_RECEIPTS = 'files/receipts';

    private static async watermarkIfSandbox(pdfDoc: PDFDocument, sandbox?: boolean) {
        if (!sandbox) return;
        const pages = pdfDoc.getPages();
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        for (const page of pages) {
            const { width, height } = page.getSize();
            const fontSize = Math.min(width, height) / 4;
            page.drawText('SANDBOX', {
                x: width * 0.15,
                y: height * 0.4,
                size: fontSize,
                font,
                color: rgb(0.85, 0.1, 0.1),
                rotate: { type: 'degrees', angle: 30 },
                opacity: 0.15,
            } as any);
        }
    }

    // Check if running in Docker
    private static getBasePath(): string {
        const dockerPath = '/app';
        const isDocker = process.cwd() === dockerPath;
        return isDocker ? dockerPath : process.cwd();
    }

    private static getFullPath(relativePath: string): string {
        return path.join(this.getBasePath(), relativePath);
    }

    private static async createCustomQrCode(serialNumber?: string, studentId?: string): Promise<Buffer> {
        // --- Configuration ---
        let url = 'https://athena.njesdit.net/mydevice';
        if (serialNumber && studentId) {
            url += `?serial=${serialNumber}&id=${studentId}`;
        }
        const logoPath = this.getFullPath('public/logo.png');

        const logoSize = 65;
        const qrCodeSize = 200;
        const textHeight = 30;

        const canvasSize = 240;
        const contentHeight = qrCodeSize + textHeight;
        const topMargin = (canvasSize - contentHeight) / 2;
        const leftMargin = (canvasSize - qrCodeSize) / 2;

        const qrCodeBuffer = await QRCode.toBuffer(url, {
            errorCorrectionLevel: 'H',
            width: qrCodeSize,
            margin: 1,
            // ---> THIS IS THE CHANGE: Set the QR code color
            color: {
                dark: '#072e49',  // The color of the QR code modules
                light: '#0000'   // A fully transparent background
            }
        });

        const logoPadding = 4;
        const circleSize = logoSize + logoPadding * 2;
        const whiteCircleSvg = `<svg><circle cx="${circleSize / 2}" cy="${circleSize / 2}" r="${circleSize / 2}" fill="white"/></svg>`;
        const whiteCircleBuffer = Buffer.from(whiteCircleSvg);

        const resizedLogoBuffer = await sharp(logoPath)
            .resize({
                width: logoSize,
                height: logoSize,
                fit: 'inside',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toBuffer();

        const qrWithLogoBuffer = await sharp(qrCodeBuffer)
            .composite([
                { input: whiteCircleBuffer, gravity: 'center' },
                { input: resizedLogoBuffer, gravity: 'center' }
            ])
            .toBuffer();

        const textSvg = `
      <svg width="${qrCodeSize}" height="${textHeight}" xmlns="http://www.w3.org/2000/svg">
      </svg>`;

        return sharp({
            create: {
                width: canvasSize,
                height: canvasSize,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 0 },
            }
        })
            .composite([
                { input: qrWithLogoBuffer, top: topMargin, left: leftMargin },
                { input: Buffer.from(textSvg), top: topMargin + qrCodeSize, left: leftMargin }
            ])
            .png()
            .toBuffer();
    }

    static sanitizeFilename(filename: string): string {
        // Replace spaces with underscores and remove special characters
        return filename
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_\-]/g, '')
            .substring(0, 100); // Limit length to prevent issues
    }

    static generateFilename(data: CheckoutAgreementData): string {
        const dateStr = format(data.checkoutDate, 'yyyy-MM-dd');
        const sanitizedName = this.sanitizeFilename(data.studentName);
        return `${dateStr}_${data.deviceAssetTag}_${data.deviceSerial}_${sanitizedName}_${data.studentId}.pdf`;
    }

    static async findExistingAgreement(data: CheckoutAgreementData): Promise<string | null> {
        const filename = this.generateFilename(data);

        // Check active directory first
        try {
            const activePath = await this.getAgreementPath(filename, false);
            await access(activePath);
            return activePath;
        } catch {
            // Check pending directory
            try {
                const pendingPath = await this.getAgreementPath(filename, true);
                await access(pendingPath);
                return pendingPath;
            } catch {
                return null; // File doesn't exist in either location
            }
        }
    }

    static async generateCheckoutAgreement(data: CheckoutAgreementData, opts: { sandbox?: boolean } = {}): Promise<string> {
        try {
            const outputDir = data.isPending
                ? this.getFullPath(this.OUTPUT_DIR_PENDING)
                : this.getFullPath(this.OUTPUT_DIR_ACTIVE);
            if (!opts.sandbox) {
                await mkdir(outputDir, { recursive: true });
            }

            const templateBytes = await readFile(this.getFullPath(this.AGREEMENT_TEMPLATE_PATH));
            const pdfDoc = await PDFDocument.load(templateBytes);

            // Get the form
            const form = pdfDoc.getForm();

            // Generate and embed the QR Code
            try {
                const qrImageBuffer = await this.createCustomQrCode(data.deviceSerial, data.studentId);
                const qrCodeImage = await pdfDoc.embedPng(qrImageBuffer);
                const qrCodeField = form.getButton('qr_code');
                qrCodeField.setImage(qrCodeImage);
            } catch (error) {
                console.warn('⚠️ Could not generate or embed custom QR code:', error);
            }

            // Handle the student signature
            if (data.signature) {
                try {
                    const signatureBase64 = data.signature.replace(/^data:image\/png;base64,/, '');
                    const signatureImage = await pdfDoc.embedPng(signatureBase64);
                    const signatureField = form.getButton('student_signature');
                    signatureField.setImage(signatureImage);
                } catch (error) {
                    console.warn('⚠️ Could not embed student signature:', error instanceof Error ? error.message : 'Unknown error');
                }
            }

            // Handle the parent signature
            if (data.parentSignature) {
                try {
                    const signatureBase64 = data.parentSignature.replace(/^data:image\/png;base64,/, '');
                    const signatureImage = await pdfDoc.embedPng(signatureBase64);
                    const signatureField = form.getButton('parent_signature');
                    signatureField.setImage(signatureImage);
                } catch (error) {
                    console.warn('⚠️ Could not embed parent signature:', error instanceof Error ? error.message : 'Unknown error');
                }
            }

            // Fill in the text fields
            try {
                // Student information
                const studentNameField = form.getTextField('student_name');
                studentNameField.setText(data.studentName);

                const studentIdField = form.getTextField('student_id');
                studentIdField.setText(data.studentId);

                // Device information
                const deviceSerialField = form.getTextField('device_serial');
                deviceSerialField.setText(data.deviceSerial);

                const deviceAssetTagField = form.getTextField('device_asset_tag');
                deviceAssetTagField.setText(data.deviceAssetTag);

                // Dates
                const formattedDate = format(data.checkoutDate, 'MM/dd/yyyy');

                const studentDateField = form.getTextField('student_signature_date');
                studentDateField.setText(formattedDate);

                const guardianDateField = form.getTextField('parent_signature_date');
                guardianDateField.setText(formattedDate);

                // Insurance checkboxes
                const insuredTrueField = form.getCheckBox('insured_true');
                const insuredFalseField = form.getCheckBox('insured_false');

                if (data.isInsured) {
                    insuredTrueField.check();
                    insuredFalseField.uncheck();
                } else {
                    insuredFalseField.check();
                    insuredTrueField.uncheck();
                }
            } catch (fieldError) {
                console.error('Error filling PDF fields:', fieldError);
                // Continue even if some fields fail
            }

            // Flatten the form to prevent further editing
            form.flatten();

            // Generate filename
            const filename = this.generateFilename(data);
            await this.watermarkIfSandbox(pdfDoc, opts.sandbox);
            const pdfBytes = await pdfDoc.save();
            if (!opts.sandbox) {
                const outputPath = path.join(outputDir, filename);
                await writeFile(outputPath, pdfBytes);
                console.log(`✅ PDF agreement generated: ${filename}`);
            } else {
                console.log(`✅ PDF agreement generated (sandbox, not saved): ${filename}`);
            }
            return filename;
        } catch (error) {
            console.error('❌ Error generating PDF agreement:', error);
            throw new Error(`Failed to generate PDF agreement: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static async generateCheckoutAgreementBuffer(data: CheckoutAgreementData, opts: { sandbox?: boolean } = {}): Promise<Buffer> {
        try {
            const templateBytes = await readFile(this.getFullPath(this.AGREEMENT_TEMPLATE_PATH));
            const pdfDoc = await PDFDocument.load(templateBytes);

            const form = pdfDoc.getForm();

            try {
                const qrImageBuffer = await this.createCustomQrCode(data.deviceSerial, data.studentId);
                const qrCodeImage = await pdfDoc.embedPng(qrImageBuffer);
                const qrCodeField = form.getButton('qr_code');
                qrCodeField.setImage(qrCodeImage);
            } catch (error) {
                console.warn('⚠️ Could not generate or embed custom QR code:', error);
            }

            if (data.signature) {
                try {
                    const signatureBase64 = data.signature.replace(/^data:image\/png;base64,/, '');
                    const signatureImage = await pdfDoc.embedPng(signatureBase64);
                    const signatureField = form.getButton('student_signature');
                    signatureField.setImage(signatureImage);
                } catch (error) {
                    console.warn('⚠️ Could not embed student signature:', error instanceof Error ? error.message : 'Unknown error');
                }
            }

            if (data.parentSignature) {
                try {
                    const signatureBase64 = data.parentSignature.replace(/^data:image\/png;base64,/, '');
                    const signatureImage = await pdfDoc.embedPng(signatureBase64);
                    const signatureField = form.getButton('parent_signature');
                    signatureField.setImage(signatureImage);
                } catch (error) {
                    console.warn('⚠️ Could not embed parent signature:', error instanceof Error ? error.message : 'Unknown error');
                }
            }

            try {
                const studentNameField = form.getTextField('student_name');
                studentNameField.setText(data.studentName);

                const studentIdField = form.getTextField('student_id');
                studentIdField.setText(data.studentId);

                const deviceSerialField = form.getTextField('device_serial');
                deviceSerialField.setText(data.deviceSerial);

                const deviceAssetTagField = form.getTextField('device_asset_tag');
                deviceAssetTagField.setText(data.deviceAssetTag);

                const formattedDate = format(data.checkoutDate, 'MM/dd/yyyy');

                const studentDateField = form.getTextField('student_signature_date');
                studentDateField.setText(formattedDate);

                const guardianDateField = form.getTextField('parent_signature_date');
                guardianDateField.setText(formattedDate);

                const insuredTrueField = form.getCheckBox('insured_true');
                const insuredFalseField = form.getCheckBox('insured_false');

                if (data.isInsured) {
                    insuredTrueField.check();
                    insuredFalseField.uncheck();
                } else {
                    insuredFalseField.check();
                    insuredTrueField.uncheck();
                }
            } catch (fieldError) {
                console.error('Error filling PDF fields:', fieldError);
            }

            form.flatten();
            await this.watermarkIfSandbox(pdfDoc, opts.sandbox);
            const pdfBytes = await pdfDoc.save();
            return Buffer.from(pdfBytes);
        } catch (error) {
            console.error('❌ Error generating PDF agreement buffer:', error);
            throw new Error(`Failed to generate PDF agreement buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static async getAgreementPath(filename: string, isPending: boolean = false, isArchived: boolean = false): Promise<string> {
        let dir = this.OUTPUT_DIR_ACTIVE;
        if (isPending) {
            dir = this.OUTPUT_DIR_PENDING;
        } else if (isArchived) {
            dir = this.OUTPUT_DIR_ARCHIVE;
        }
        return this.getFullPath(path.join(dir, filename));
    }

    static async readAgreement(filename: string): Promise<Buffer> {
        try {
            // Try reading from active first
            const activePath = await this.getAgreementPath(filename, false);
            return await readFile(activePath);
        } catch (error) {
            // If it fails, try reading from pending
            const pendingPath = await this.getAgreementPath(filename, true);
            return await readFile(pendingPath);
        }
    }

    static async moveAgreementToCompleted(filename: string): Promise<void> {
        const pendingPath = await this.getAgreementPath(filename, true);
        const activePath = await this.getAgreementPath(filename, false);
        await mkdir(this.getFullPath(this.OUTPUT_DIR_ACTIVE), { recursive: true });

        // Read the pending file and regenerate with parent signature
        const pendingBuffer = await readFile(pendingPath);
        await writeFile(activePath, pendingBuffer);

        // Remove from pending directory
        const { rm } = await import('fs/promises');
        try {
            await rm(pendingPath);
        } catch (error) {
            console.warn('⚠️ Could not remove pending agreement file:', error);
        }
    }

    static async archiveAgreement(filename: string): Promise<void> {
        const activePath = await this.getAgreementPath(filename, false);
        const archivePath = await this.getAgreementPath(filename, false, true);
        await mkdir(this.getFullPath(this.OUTPUT_DIR_ARCHIVE), { recursive: true });

        try {
            const { rename } = await import('fs/promises');
            await rename(activePath, archivePath);
        } catch (error) {
            console.warn(`⚠️ Could not move agreement to archive: ${filename}`, error);
        }
    }

    static async generateCheckinReceipt(data: CheckinReceiptData, opts: { sandbox?: boolean } = {}): Promise<Buffer> {
        try {
            const outputDir = this.getFullPath(this.OUTPUT_DIR_RECEIPTS);
            if (!opts.sandbox) {
                await mkdir(outputDir, { recursive: true });
            }

            const templateBytes = await readFile(this.getFullPath(this.RECEIPT_TEMPLATE_PATH));
            const pdfDoc = await PDFDocument.load(templateBytes);
            const page = pdfDoc.getPages()[0];
            const { width, height } = page.getSize();

            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const black = rgb(0, 0, 0);
            const gray = rgb(0.3, 0.3, 0.3);
            const red = rgb(0.9, 0.3, 0.3);

            let y = height - 200; // Starting Y position, lowered
            const leftMargin = 60;
            const rightMargin = width - 60;
            const lineheight = 22; // Increased line height
            const sectionSpacing = 35; // Increased section spacing

            const drawLine = (yPos: number) => {
                page.drawLine({
                    start: { x: leftMargin, y: yPos },
                    end: { x: rightMargin, y: yPos },
                    thickness: 0.5,
                    color: rgb(0.8, 0.8, 0.8),
                });
            };

            // Title
            page.drawText('Chromebook Check-in Receipt', {
                x: leftMargin,
                y,
                font: boldFont,
                size: 20,
                color: black,
            });
            y -= lineheight * 1.5;
            page.drawText(`Date: ${data.checkinDate}`, {
                x: leftMargin,
                y,
                font,
                size: 12,
                color: gray,
            });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Student & Device Info
            page.drawText('Student Information', { x: leftMargin, y, font: boldFont, size: 14 });
            page.drawText('Device Information', { x: width / 2, y, font: boldFont, size: 14 });
            y -= lineheight;
            page.drawText(`${data.student.name}`, { x: leftMargin, y, font, size: 12 });
            page.drawText(`Asset Tag: ${data.chromebook.assetTag}`, { x: width / 2, y, font, size: 12 });
            y -= lineheight;
            page.drawText(`ID: ${data.student.studentId}`, { x: leftMargin, y, font, size: 12 });
            page.drawText(`Serial: ${data.chromebook.serialNumber}`, { x: width / 2, y, font, size: 12 });
            y -= lineheight;
            const displayStatus = data.newStatus === 'available' ? 'Returned' : 'Needs Repair';
            page.drawText(`Status: ${displayStatus}`, { x: width / 2, y, font, size: 12 });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Damage Report
            if (data.damageLocations.length > 0) {
                page.drawText('Damage Report', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;
                data.damageLocations.forEach(d => {
                    page.drawText(`- [${d.severity}] ${d.area}: ${d.damageType}`, { x: leftMargin, y, font, size: 12 });
                    if (d.description) {
                        y -= lineheight * 0.8;
                        page.drawText(`  ${d.description}`, { x: leftMargin + 10, y, font, size: 10, color: gray });
                    }
                    y -= lineheight;
                });
                y -= sectionSpacing * 0.5;
                drawLine(y + 25);
            }

            // Repair Plan
            if (data.repairRecommendations.length > 0) {
                page.drawText('Repair Plan', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;
                data.repairRecommendations.forEach(r => {
                    page.drawText(`- [${r.priority}] ${r.item}: $${r.cost.toFixed(2)}`, { x: leftMargin, y, font, size: 12 });
                    y -= lineheight;
                });
                const totalCost = typeof data.totalCost === 'string' ? parseFloat(data.totalCost) : data.totalCost;
                page.drawText(`Total Estimated Cost: $${totalCost.toFixed(2)}`, {
                    x: rightMargin - 225,
                    y,
                    font: boldFont,
                    size: 14,
                    color: totalCost > 0 ? red : black,
                });
                y -= sectionSpacing;
                drawLine(y + 25);
            }

            // Notes
            if (data.notes) {
                page.drawText('Notes', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;

                // Handle multi-line notes by splitting on newlines
                const noteLines = data.notes.split('\n');
                noteLines.forEach(line => {
                    if (line.trim()) {
                        page.drawText(line, { x: leftMargin, y, font, size: 10, maxWidth: width - leftMargin * 2 });
                        y -= lineheight * 0.8;
                    } else {
                        y -= lineheight * 0.5; // Half spacing for empty lines
                    }
                });
                y -= sectionSpacing * 0.5;
                drawLine(y + 25);
            }

            // Special Instructions
            if (data.specialInstructions) {
                page.drawText('Special Instructions', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;
                page.drawText(data.specialInstructions, { x: leftMargin, y, font, size: 12, maxWidth: width - leftMargin * 2 });
                y -= sectionSpacing;
            }

            await this.watermarkIfSandbox(pdfDoc, opts.sandbox);
            const pdfBytes = await pdfDoc.save();
            const pdfBuffer = Buffer.from(pdfBytes);
            if (!opts.sandbox) {
                const filename = `${format(new Date(), 'yyyy-MM-dd_HHmm')}_${this.sanitizeFilename(data.student.name)}_checkin_receipt.pdf`;
                const outputPath = path.join(outputDir, filename);
                await writeFile(outputPath, pdfBuffer);
                console.log(`✅ Receipt generated: ${filename}`);
            } else {
                console.log('✅ Receipt generated (sandbox, not saved)');
            }
            return pdfBuffer;
        } catch (error) {
            console.error('❌ Error generating PDF receipt:', error);
            throw new Error(`Failed to generate PDF receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static generateMaintenanceReceiptFilename(data: MaintenanceReceiptData): string {
        let dateStr: string;
        try {
            // Try to parse the maintenance date, fallback to current date if it fails
            const date = new Date(data.maintenanceDate);
            if (isNaN(date.getTime())) {
                // If date is invalid, use current date
                dateStr = format(new Date(), 'yyyy-MM-dd');
                console.warn('Invalid maintenance date, using current date:', data.maintenanceDate);
            } else {
                dateStr = format(date, 'yyyy-MM-dd');
            }
        } catch (error) {
            // Fallback to current date if date parsing fails
            dateStr = format(new Date(), 'yyyy-MM-dd');
            console.warn('Failed to parse maintenance date, using current date:', data.maintenanceDate, error);
        }

        const sanitizedName = this.sanitizeFilename(data.student.name);
        return `${dateStr}_${sanitizedName}_maintenance_receipt.pdf`;
    }

    static async findExistingMaintenanceReceipt(data: MaintenanceReceiptData): Promise<string | null> {
        const filename = this.generateMaintenanceReceiptFilename(data);
        const receiptPath = this.getFullPath(path.join(this.OUTPUT_DIR_RECEIPTS, filename));

        try {
            await access(receiptPath);
            return receiptPath;
        } catch {
            return null; // File doesn't exist
        }
    }

    static async readMaintenanceReceipt(filename: string): Promise<Buffer> {
        const receiptPath = this.getFullPath(path.join(this.OUTPUT_DIR_RECEIPTS, filename));
        return await readFile(receiptPath);
    }

    static async generateMaintenanceReceipt(data: MaintenanceReceiptData, opts: { sandbox?: boolean } = {}): Promise<Buffer> {
        try {
            const outputDir = this.getFullPath(this.OUTPUT_DIR_RECEIPTS);
            if (!opts.sandbox) {
                await mkdir(outputDir, { recursive: true });
            }

            const templateBytes = await readFile(this.getFullPath(this.RECEIPT_TEMPLATE_PATH));
            const pdfDoc = await PDFDocument.load(templateBytes);
            const page = pdfDoc.getPages()[0];
            const { width, height } = page.getSize();

            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const black = rgb(0, 0, 0);
            const gray = rgb(0.3, 0.3, 0.3);
            const red = rgb(0.9, 0.3, 0.3);

            let y = height - 200;
            const leftMargin = 60;
            const rightMargin = width - 60;
            const lineheight = 22;
            const sectionSpacing = 35;

            const drawLine = (yPos: number) => {
                page.drawLine({
                    start: { x: leftMargin, y: yPos },
                    end: { x: rightMargin, y: yPos },
                    thickness: 0.5,
                    color: rgb(0.8, 0.8, 0.8),
                });
            };

            // Title
            page.drawText('Maintenance Work Order', {
                x: leftMargin,
                y,
                font: boldFont,
                size: 20,
                color: black,
            });
            y -= lineheight * 1.5;
            page.drawText(`Date: ${data.maintenanceDate}`, {
                x: leftMargin,
                y,
                font,
                size: 12,
                color: gray,
            });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Student & Device Info
            page.drawText('Student Information', { x: leftMargin, y, font: boldFont, size: 14 });
            page.drawText('Device Information', { x: width / 2, y, font: boldFont, size: 14 });
            y -= lineheight;
            page.drawText(`${data.student.name}`, { x: leftMargin, y, font, size: 12 });
            page.drawText(`Asset Tag: ${data.chromebook.assetTag}`, { x: width / 2, y, font, size: 12 });
            y -= lineheight;
            page.drawText(`ID: ${data.student.studentId}`, { x: leftMargin, y, font, size: 12 });
            page.drawText(`Serial: ${data.chromebook.serialNumber}`, { x: width / 2, y, font, size: 12 });
            y -= lineheight;
            page.drawText(`Insured: ${data.isInsured ? 'Yes' : 'No'}`, { x: width / 2, y, font, size: 12 });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Damage Report
            if (data.damageLocations.length > 0) {
                page.drawText('Damage Report', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;
                data.damageLocations.forEach(d => {
                    page.drawText(`- [${d.severity}] ${d.area}: ${d.damageType}`, { x: leftMargin, y, font, size: 12 });
                    if (d.description) {
                        y -= lineheight * 0.8;
                        page.drawText(`  ${d.description}`, { x: leftMargin + 10, y, font, size: 10, color: gray });
                    }
                    y -= lineheight;
                });
                y -= sectionSpacing * 0.5;
                drawLine(y + 25);
            }

            // Repair Plan
            if (data.repairRecommendations.length > 0) {
                page.drawText('Repair Plan', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;
                data.repairRecommendations.forEach(r => {
                    page.drawText(`- [${r.priority}] ${r.item}: $${r.cost.toFixed(2)}`, { x: leftMargin, y, font, size: 12 });
                    y -= lineheight;
                });
                const totalCost = typeof data.totalCost === 'string' ? parseFloat(data.totalCost) : data.totalCost;
                page.drawText(`Total Estimated Cost: $${totalCost.toFixed(2)}`, {
                    x: rightMargin - 225,
                    y,
                    font: boldFont,
                    size: 14,
                    color: totalCost > 0 ? red : black,
                });
                y -= sectionSpacing;
                drawLine(y + 25);
            }

            // Notes
            if (data.notes) {
                page.drawText('Notes', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;

                // Handle multi-line notes by splitting on newlines
                const noteLines = data.notes.split('\n');
                noteLines.forEach(line => {
                    if (line.trim()) {
                        page.drawText(line, { x: leftMargin, y, font, size: 10, maxWidth: width - leftMargin * 2 });
                        y -= lineheight * 0.8;
                    } else {
                        y -= lineheight * 0.5; // Half spacing for empty lines
                    }
                });
                y -= sectionSpacing * 0.5;
                drawLine(y + 25);
            }

            // Special Instructions
            if (data.specialInstructions) {
                page.drawText('Special Instructions', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;
                page.drawText(data.specialInstructions, { x: leftMargin, y, font, size: 12, maxWidth: width - leftMargin * 2 });
                y -= sectionSpacing;
            }

            await this.watermarkIfSandbox(pdfDoc, opts.sandbox);
            const pdfBytes = await pdfDoc.save();
            const pdfBuffer = Buffer.from(pdfBytes);
            if (!opts.sandbox) {
                const filename = `${format(new Date(), 'yyyy-MM-dd')}_${this.sanitizeFilename(data.student.name)}_maintenance_receipt.pdf`;
                const outputPath = path.join(outputDir, filename);
                await writeFile(outputPath, pdfBuffer);
                console.log(`✅ Receipt generated: ${filename}`);
            } else {
                console.log('✅ Receipt generated (sandbox, not saved)');
            }
            return pdfBuffer;
        } catch (error) {
            console.error('❌ Error generating PDF receipt:', error);
            throw new Error(`Failed to generate PDF receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static generateFeeReceiptFilename(data: FeeReceiptData): string {
        let dateStr: string;
        try {
            const date = new Date(data.receiptDate);
            if (isNaN(date.getTime())) {
                dateStr = format(new Date(), 'yyyy-MM-dd');
                console.warn('Invalid receipt date, using current date:', data.receiptDate);
            } else {
                dateStr = format(date, 'yyyy-MM-dd');
            }
        } catch (error) {
            dateStr = format(new Date(), 'yyyy-MM-dd');
            console.warn('Failed to parse receipt date, using current date:', data.receiptDate, error);
        }

        const sanitizedName = this.sanitizeFilename(data.student.name);
        return `${dateStr}_${sanitizedName}_fee_receipt.pdf`;
    }

    static async generateFeeReceipt(data: FeeReceiptData, opts: { sandbox?: boolean } = {}): Promise<Buffer> {
        try {
            const outputDir = this.getFullPath(this.OUTPUT_DIR_RECEIPTS);
            if (!opts.sandbox) {
                await mkdir(outputDir, { recursive: true });
            }

            const templateBytes = await readFile(this.getFullPath(this.RECEIPT_TEMPLATE_PATH));
            const pdfDoc = await PDFDocument.load(templateBytes);
            const page = pdfDoc.getPages()[0];
            const { width, height } = page.getSize();

            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const black = rgb(0, 0, 0);
            const gray = rgb(0.3, 0.3, 0.3);
            const red = rgb(0.9, 0.3, 0.3);
            const green = rgb(0.2, 0.6, 0.2);

            let y = height - 200;
            const leftMargin = 60;
            const rightMargin = width - 60;
            const lineheight = 22;
            const sectionSpacing = 35;

            const drawLine = (yPos: number) => {
                page.drawLine({
                    start: { x: leftMargin, y: yPos },
                    end: { x: rightMargin, y: yPos },
                    thickness: 0.5,
                    color: rgb(0.8, 0.8, 0.8),
                });
            };

            // Title
            page.drawText('Student Fee Receipt', {
                x: leftMargin,
                y,
                font: boldFont,
                size: 20,
                color: black,
            });
            y -= lineheight * 1.5;
            page.drawText(`Date: ${data.receiptDate}`, {
                x: leftMargin,
                y,
                font,
                size: 12,
                color: gray,
            });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Student Information
            page.drawText('Student Information', { x: leftMargin, y, font: boldFont, size: 14 });
            y -= lineheight;
            page.drawText(`${data.student.name}`, { x: leftMargin, y, font, size: 12 });
            y -= lineheight;
            page.drawText(`Student ID: ${data.student.studentId}`, { x: leftMargin, y, font, size: 12 });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Fee Summary
            page.drawText('Fee Summary', { x: leftMargin, y, font: boldFont, size: 14 });
            y -= lineheight;
            page.drawText(`Total Amount Owed: $${data.totalOwed.toFixed(2)}`, { x: leftMargin, y, font, size: 12 });
            y -= lineheight;
            page.drawText(`Total Payments Made: $${data.totalPaid.toFixed(2)}`, { x: leftMargin, y, font, size: 12, color: green });
            y -= lineheight;
            page.drawText(`Remaining Balance: $${data.remainingBalance.toFixed(2)}`, {
                x: leftMargin,
                y,
                font: boldFont,
                size: 14,
                color: data.remainingBalance > 0 ? red : green,
            });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Transaction Details Table
            // Table Headers
            const col1X = leftMargin;
            const col2X = leftMargin + 100;
            const col3X = leftMargin + 160;
            const col4X = leftMargin + 280;
            const col5X = leftMargin + 380;
            const col6X = leftMargin + 450;

            // Draw table header background
            page.drawRectangle({
                x: leftMargin - 5,
                y: y - 15,
                width: rightMargin - leftMargin + 10,
                height: 20,
                color: rgb(0.95, 0.95, 0.95),
            });

            // Table headers
            page.drawText('Transaction ID', { x: col1X, y: y - 10, font: boldFont, size: 9 });
            page.drawText('Amount', { x: col2X, y: y - 10, font: boldFont, size: 9 });
            page.drawText('Payment Type', { x: col3X, y: y - 10, font: boldFont, size: 9 });
            page.drawText('Fee Type', { x: col4X, y: y - 10, font: boldFont, size: 9 });
            page.drawText('Device', { x: col5X, y: y - 10, font: boldFont, size: 9 });
            page.drawText('Date', { x: col6X, y: y - 10, font: boldFont, size: 9 });
            y -= lineheight + 5;

            // Collect all transactions
            interface Transaction {
                transactionId: string;
                amount: number;
                paymentType: string;
                feeType: string;
                deviceTag: string;
                date: string;
                notes?: string;
            }

            const transactions: Transaction[] = [];

            // Process each fee and its payments
            data.fees.forEach(fee => {
                // Determine fee type from description
                const feeType = fee.description.toLowerCase().includes('insurance') ? 'Insurance' :
                    fee.description.toLowerCase().includes('repair') ? 'Repair' :
                        fee.description.toLowerCase().includes('damage') ? 'Damage' : 'Other';

                // Use device tag from fee data, fallback to extracting from description
                let deviceTag = fee.device_asset_tag || '-';
                if (deviceTag === '-') {
                    // Try to extract from description as fallback
                    const deviceMatch = fee.description.match(/(?:DCS|NJESD)\d+|\b\d{4}\b/i);
                    deviceTag = deviceMatch ? deviceMatch[0] : '-';
                }

                fee.payments.forEach(payment => {
                    transactions.push({
                        transactionId: payment.transaction_id || 'N/A',
                        amount: Number(payment.amount),
                        paymentType: payment.payment_method || 'Unknown',
                        feeType: feeType,
                        deviceTag: deviceTag,
                        date: format(new Date(payment.created_at), 'MM-dd-yyyy'),
                        notes: payment.notes
                    });
                });
            });

            // Draw transactions
            transactions.forEach((transaction, index) => {
                // Alternate row colors
                if (index % 2 === 0) {
                    page.drawRectangle({
                        x: leftMargin - 5,
                        y: y - 15,
                        width: rightMargin - leftMargin + 10,
                        height: 18,
                        color: rgb(0.98, 0.98, 0.98),
                    });
                }

                // Transaction data
                page.drawText(transaction.transactionId, { x: col1X, y: y - 10, font, size: 8 });
                page.drawText(`$${transaction.amount.toFixed(2)}`, { x: col2X, y: y - 10, font, size: 8 });

                // Payment type with notes
                let paymentTypeText = transaction.paymentType;
                if (transaction.notes) {
                    // For receipt display, shorten "Applied from previous payment:" to just "Credit:"
                    const displayNotes = transaction.notes.replace(/Applied from previous payment/g, 'Credit');
                    paymentTypeText += ` [${displayNotes}]`;
                }
                page.drawText(paymentTypeText, { x: col3X, y: y - 10, font, size: 8, maxWidth: 115 });

                page.drawText(transaction.feeType, { x: col4X, y: y - 10, font, size: 8 });
                page.drawText(transaction.deviceTag, { x: col5X, y: y - 10, font, size: 8 });
                page.drawText(transaction.date, { x: col6X, y: y - 10, font, size: 8 });

                y -= lineheight * 0.8;
            });

            // If no transactions, show a message
            if (transactions.length === 0) {
                page.drawText('No payments have been made yet.', { x: leftMargin, y: y - 10, font, size: 10, color: gray });
                y -= lineheight;
            }

            await this.watermarkIfSandbox(pdfDoc, opts.sandbox);
            const pdfBytes = await pdfDoc.save();
            const pdfBuffer = Buffer.from(pdfBytes);
            if (!opts.sandbox) {
                const filename = this.generateFeeReceiptFilename(data);
                const outputPath = path.join(outputDir, filename);
                await writeFile(outputPath, pdfBuffer);
                console.log(`✅ Fee receipt generated: ${filename}`);
            } else {
                console.log('✅ Fee receipt generated (sandbox, not saved)');
            }
            return pdfBuffer;
        } catch (error) {
            console.error('❌ Error generating PDF fee receipt:', error);
            throw new Error(`Failed to generate PDF fee receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static generateCheckoutReceiptFilename(data: CheckoutReceiptData): string {
        let dateStr: string;
        try {
            const date = new Date(data.checkoutDate);
            if (isNaN(date.getTime())) {
                dateStr = format(new Date(), 'yyyy-MM-dd');
                console.warn('Invalid checkout date, using current date:', data.checkoutDate);
            } else {
                dateStr = format(date, 'yyyy-MM-dd');
            }
        } catch (error) {
            dateStr = format(new Date(), 'yyyy-MM-dd');
            console.warn('Failed to parse checkout date, using current date:', data.checkoutDate, error);
        }

        const sanitizedName = this.sanitizeFilename(data.student.name);
        return `${dateStr}_${sanitizedName}_checkout_receipt.pdf`;
    }

    static async generateCheckoutReceipt(data: CheckoutReceiptData, opts: { sandbox?: boolean } = {}): Promise<Buffer> {
        try {
            const outputDir = this.getFullPath(this.OUTPUT_DIR_RECEIPTS);
            if (!opts.sandbox) {
                await mkdir(outputDir, { recursive: true });
            }

            const templateBytes = await readFile(this.getFullPath(this.RECEIPT_TEMPLATE_PATH));
            const pdfDoc = await PDFDocument.load(templateBytes);
            const page = pdfDoc.getPages()[0];
            const { width, height } = page.getSize();

            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const black = rgb(0, 0, 0);
            const gray = rgb(0.3, 0.3, 0.3);
            const blue = rgb(0.2, 0.4, 0.8);
            const green = rgb(0.2, 0.6, 0.2);
            const red = rgb(0.9, 0.3, 0.3);
            const yellow = rgb(0.8, 0.6, 0.0);

            let y = height - 200;
            const leftMargin = 60;
            const rightMargin = width - 60;
            const lineheight = 22;
            const sectionSpacing = 35;

            const drawLine = (yPos: number) => {
                page.drawLine({
                    start: { x: leftMargin, y: yPos },
                    end: { x: rightMargin, y: yPos },
                    thickness: 0.5,
                    color: rgb(0.8, 0.8, 0.8),
                });
            };

            // Title
            page.drawText('Chromebook Checkout Receipt', {
                x: leftMargin,
                y,
                font: boldFont,
                size: 20,
                color: black,
            });
            y -= lineheight * 1.5;
            page.drawText(`Date: ${format(new Date(data.checkoutDate), 'PPP')}`, {
                x: leftMargin,
                y,
                font,
                size: 12,
                color: gray,
            });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Student & Device Info
            page.drawText('Student Information', { x: leftMargin, y, font: boldFont, size: 14 });
            page.drawText('Device Information', { x: width / 2, y, font: boldFont, size: 14 });
            y -= lineheight;
            page.drawText(`${data.student.name}`, { x: leftMargin, y, font, size: 12 });
            page.drawText(`Asset Tag: ${data.chromebook.assetTag}`, { x: width / 2, y, font, size: 12 });
            y -= lineheight;
            page.drawText(`Student ID: ${data.student.studentId}`, { x: leftMargin, y, font, size: 12 });
            page.drawText(`Serial: ${data.chromebook.serialNumber}`, { x: width / 2, y, font, size: 12 });
            y -= lineheight;
            page.drawText(`Model: ${data.chromebook.model}`, { x: width / 2, y, font, size: 12 });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Checkout Details
            page.drawText('Checkout Details', { x: leftMargin, y, font: boldFont, size: 14 });
            y -= lineheight;
            page.drawText(`Checkout Date: ${format(new Date(data.checkoutDate), 'PPP')}`, { x: leftMargin, y, font, size: 12 });
            y -= lineheight;
            page.drawText('Parent/Guardian Present: Yes', { x: leftMargin, y, font, size: 12 });
            y -= sectionSpacing;
            drawLine(y + 25);

            // Insurance Coverage
            page.drawText('Insurance Coverage', { x: leftMargin, y, font: boldFont, size: 14 });
            y -= lineheight;

            let statusText: string;
            let statusColor = black;

            switch (data.insuranceStatus) {
                case 'uninsured':
                    statusText = 'Insurance: Declined';
                    statusColor = red;
                    // Draw status text first
                    page.drawText(statusText, { x: leftMargin, y, font: boldFont, size: 12, color: statusColor });
                    y -= lineheight;
                    page.drawText('No insurance fee applies.', { x: leftMargin, y, font, size: 11, color: gray });
                    y -= lineheight;
                    page.drawText('Device is not covered against accidental damage.', { x: leftMargin, y, font, size: 11, color: gray });
                    break;
                case 'pending':
                    const totalFee = 40; // Standard insurance fee
                    const paymentMade = data.paymentAmount || 0;
                    const remainingBalance = totalFee - paymentMade;

                    if (paymentMade > 0) {
                        statusText = 'Insurance: Partial Payment Made';
                        statusColor = yellow;
                        // Draw status text first
                        page.drawText(statusText, { x: leftMargin, y, font: boldFont, size: 12, color: statusColor });
                        y -= lineheight;
                        page.drawText(`Total Fee Amount: $${totalFee.toFixed(2)}`, { x: leftMargin, y, font, size: 12 });
                        y -= lineheight;
                        page.drawText(`Remaining Balance: $${remainingBalance.toFixed(2)}`, { x: leftMargin, y, font, size: 12, color: red });
                        y -= lineheight;
                        page.drawText('Payment Due: Within 5 days of checkout', { x: leftMargin, y, font, size: 11, color: gray });
                        y -= lineheight;
                        page.drawText('Device protection will be activated upon full payment.', { x: leftMargin, y, font, size: 11, color: gray });
                    } else {
                        statusText = 'Insurance: Selected - Payment Pending';
                        statusColor = yellow;
                        // Draw status text first
                        page.drawText(statusText, { x: leftMargin, y, font: boldFont, size: 12, color: statusColor });
                        y -= lineheight;
                        page.drawText(`Fee Amount: $${data.insuranceFee || 40}.00`, { x: leftMargin, y, font, size: 12 });
                        y -= lineheight;
                        page.drawText('Payment Status: Outstanding', { x: leftMargin, y, font, size: 12, color: red });
                        y -= lineheight;
                        page.drawText('Payment Due: Within 5 days of checkout', { x: leftMargin, y, font, size: 11, color: gray });
                        y -= lineheight;
                        page.drawText('Device protection will be activated upon payment.', { x: leftMargin, y, font, size: 11, color: gray });
                    }
                    break;
                case 'insured':
                    statusText = 'Insurance: Paid and Active';
                    statusColor = green;
                    // Draw status text first
                    page.drawText(statusText, { x: leftMargin, y, font: boldFont, size: 12, color: statusColor });
                    y -= lineheight;
                    page.drawText(`Fee Amount: $${data.insuranceFee || 40}.00`, { x: leftMargin, y, font, size: 12 });
                    y -= lineheight;
                    page.drawText('Device is fully protected against accidental damage.', { x: leftMargin, y, font, size: 11, color: green });
                    break;
            }
            y -= sectionSpacing;
            drawLine(y + 25);

            // Transaction Details (if payment was made or credits were applied)
            const hasNewPayment = data.paymentAmount && data.paymentAmount > 0;
            const hasAppliedCredits = data.appliedCredits && data.appliedCredits.length > 0;

            if (hasNewPayment || hasAppliedCredits || data.insuranceStatus === 'insured') {
                page.drawText('Transaction Details', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;

                // Table Headers
                const col1X = leftMargin;
                const col2X = leftMargin + 100;
                const col3X = leftMargin + 160;
                const col4X = leftMargin + 280;
                const col5X = leftMargin + 380;
                const col6X = leftMargin + 450;

                // Draw table header background
                page.drawRectangle({
                    x: leftMargin - 5,
                    y: y - 15,
                    width: rightMargin - leftMargin + 10,
                    height: 20,
                    color: rgb(0.95, 0.95, 0.95),
                });

                // Table headers
                page.drawText('Transaction ID', { x: col1X, y: y - 10, font: boldFont, size: 9 });
                page.drawText('Amount', { x: col2X, y: y - 10, font: boldFont, size: 9 });
                page.drawText('Payment Type', { x: col3X, y: y - 10, font: boldFont, size: 9 });
                page.drawText('Fee Type', { x: col4X, y: y - 10, font: boldFont, size: 9 });
                page.drawText('Device', { x: col5X, y: y - 10, font: boldFont, size: 9 });
                page.drawText('Date', { x: col6X, y: y - 10, font: boldFont, size: 9 });
                y -= lineheight + 5;

                let rowIndex = 0;

                // Draw new payment transaction if it exists
                if (hasNewPayment) {
                    // Alternate row colors
                    if (rowIndex % 2 === 0) {
                        page.drawRectangle({
                            x: leftMargin - 5,
                            y: y - 15,
                            width: rightMargin - leftMargin + 10,
                            height: 18,
                            color: rgb(0.98, 0.98, 0.98),
                        });
                    }

                    const transactionId = data.paymentTransactionId || 'N/A';
                    const amount = data.paymentAmount || 0;
                    const paymentType = data.paymentMethod || 'Cash';
                    let paymentTypeText = paymentType;
                    // Include original payment notes if present (e.g., check number)
                    if (data.paymentNotes && String(data.paymentNotes).trim().length > 0) {
                        paymentTypeText += ` [${data.paymentNotes}]`;
                    }
                    // If credits were applied in addition to the new payment, append a concise credit summary
                    if (hasAppliedCredits) {
                        const creditSummaries = (data.appliedCredits || []).map(c => {
                            const tagPart = c.original_asset_tag ? `Credit from ${c.original_asset_tag}` : 'Credit';
                            const notePart = c.notes && String(c.notes).trim().length > 0
                                ? `: ${String(c.notes).replace(/Applied from previous payment/g, 'Credit').trim()}`
                                : '';
                            return `${tagPart}${notePart}`;
                        });
                        if (creditSummaries.length > 0) {
                            paymentTypeText += ` [${creditSummaries.join('; ')}]`;
                        }
                    }

                    page.drawText(transactionId, { x: col1X, y: y - 10, font, size: 8 });
                    page.drawText(`$${amount.toFixed(2)}`, { x: col2X, y: y - 10, font, size: 8 });
                    page.drawText(paymentTypeText, { x: col3X, y: y - 10, font, size: 8, maxWidth: 115 });
                    page.drawText('Insurance', { x: col4X, y: y - 10, font, size: 8 });
                    page.drawText(data.chromebook.assetTag, { x: col5X, y: y - 10, font, size: 8 });
                    page.drawText(format(new Date(data.checkoutDate), 'MM-dd-yyyy'), { x: col6X, y: y - 10, font, size: 8 });

                    y -= lineheight * 0.8;
                    rowIndex++;
                }

                // Draw applied credit transactions if they exist
                if (hasAppliedCredits) {
                    data.appliedCredits!.forEach((credit) => {
                        // Alternate row colors
                        if (rowIndex % 2 === 0) {
                            page.drawRectangle({
                                x: leftMargin - 5,
                                y: y - 15,
                                width: rightMargin - leftMargin + 10,
                                height: 18,
                                color: rgb(0.98, 0.98, 0.98),
                            });
                        }

                        // Payment type with credit indication: always include original device when available,
                        // and append original notes if present (e.g., "Credit from 6143: #101").
                        let paymentTypeText = credit.payment_method;
                        let detail = '';
                        if (credit.original_asset_tag) {
                            detail = `Credit from ${credit.original_asset_tag}`;
                        }
                        if (credit.notes && String(credit.notes).trim().length > 0) {
                            const cleaned = String(credit.notes).replace(/Applied from previous payment/g, 'Credit').trim();
                            detail = detail ? `${detail}: ${cleaned}` : cleaned;
                        }
                        if (detail) {
                            paymentTypeText += ` [${detail}]`;
                        }

                        page.drawText(credit.transaction_id, { x: col1X, y: y - 10, font, size: 8 });
                        page.drawText(`$${credit.amount.toFixed(2)}`, { x: col2X, y: y - 10, font, size: 8 });
                        page.drawText(paymentTypeText, { x: col3X, y: y - 10, font, size: 8, maxWidth: 115 });
                        page.drawText('Insurance', { x: col4X, y: y - 10, font, size: 8 });
                        page.drawText(data.chromebook.assetTag, { x: col5X, y: y - 10, font, size: 8 });
                        page.drawText(format(new Date(data.checkoutDate), 'MM-dd-yyyy'), { x: col6X, y: y - 10, font, size: 8 });

                        y -= lineheight * 0.8;
                        rowIndex++;
                    });
                }

                // If no transactions but status is insured, show placeholder
                if (!hasNewPayment && !hasAppliedCredits && data.insuranceStatus === 'insured') {
                    page.drawRectangle({
                        x: leftMargin - 5,
                        y: y - 15,
                        width: rightMargin - leftMargin + 10,
                        height: 18,
                        color: rgb(0.98, 0.98, 0.98),
                    });

                    page.drawText('N/A', { x: col1X, y: y - 10, font, size: 8 });
                    page.drawText(`$${data.insuranceFee || 40}.00`, { x: col2X, y: y - 10, font, size: 8 });
                    page.drawText('Paid', { x: col3X, y: y - 10, font, size: 8 });
                    page.drawText('Insurance', { x: col4X, y: y - 10, font, size: 8 });
                    page.drawText(data.chromebook.assetTag, { x: col5X, y: y - 10, font, size: 8 });
                    page.drawText(format(new Date(data.checkoutDate), 'MM-dd-yyyy'), { x: col6X, y: y - 10, font, size: 8 });

                    y -= lineheight * 0.8;
                }

                y -= lineheight;
                drawLine(y + 25);
            }

            // Notes
            if (data.notes) {
                page.drawText('Additional Notes', { x: leftMargin, y, font: boldFont, size: 14 });
                y -= lineheight;

                // Handle multi-line notes by splitting on newlines
                const noteLines = data.notes.split('\n');
                noteLines.forEach(line => {
                    if (line.trim()) {
                        page.drawText(line, { x: leftMargin, y, font, size: 11, maxWidth: rightMargin - leftMargin });
                        y -= lineheight * 0.9;
                    } else {
                        y -= lineheight * 0.5; // Half spacing for empty lines
                    }
                });
                y -= sectionSpacing * 0.5;
                drawLine(y + 25);
            }

            // Footer
            if (data.insuranceStatus === 'pending') {
                y -= lineheight;
                page.drawText('Outstanding insurance payment must be made in person.', {
                    x: leftMargin,
                    y,
                    font,
                    size: 10,
                    color: blue,
                });
            }

            await this.watermarkIfSandbox(pdfDoc, opts.sandbox);
            const pdfBytes = await pdfDoc.save();
            const pdfBuffer = Buffer.from(pdfBytes);
            if (!opts.sandbox) {
                const filename = this.generateCheckoutReceiptFilename(data);
                const outputPath = path.join(outputDir, filename);
                await writeFile(outputPath, pdfBuffer);
                console.log(`✅ Checkout receipt generated: ${filename}`);
            } else {
                console.log('✅ Checkout receipt generated (sandbox, not saved)');
            }
            return pdfBuffer;
        } catch (error) {
            console.error('❌ Error generating PDF checkout receipt:', error);
            throw new Error(`Failed to generate PDF checkout receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static async generateBulkReceipts(studentReceiptDataArray: FeeReceiptData[], opts: { sandbox?: boolean } = {}): Promise<Buffer> {
        try {
            const outputDir = this.getFullPath(this.OUTPUT_DIR_RECEIPTS);
            if (!opts.sandbox) {
                await mkdir(outputDir, { recursive: true });
            }

            // Create a new PDF document for the bulk receipts
            const bulkPdfDoc = await PDFDocument.create();

            // Process each student's complete fee receipt data
            for (const feeReceiptData of studentReceiptDataArray) {
                try {
                    // Generate individual receipt using the complete fee data
                    const individualReceiptBuffer = await this.generateFeeReceipt(feeReceiptData, { sandbox: opts.sandbox });

                    // Load the individual receipt PDF and copy its pages to the bulk PDF
                    const individualPdf = await PDFDocument.load(individualReceiptBuffer);
                    const copiedPages = await bulkPdfDoc.copyPages(individualPdf, individualPdf.getPageIndices());

                    // Add the copied pages to the bulk PDF
                    copiedPages.forEach((page) => bulkPdfDoc.addPage(page));

                } catch (error) {
                    console.error(`Failed to generate receipt for student ${feeReceiptData.student.studentId}:`, error);
                    // Continue with the next student instead of failing the entire batch
                }
            }

            // If no pages were added successfully, create an error page
            if (bulkPdfDoc.getPageCount() === 0) {
                const page = bulkPdfDoc.addPage();
                const { width, height } = page.getSize();
                const font = await bulkPdfDoc.embedFont(StandardFonts.Helvetica);

                page.drawText('No receipts could be generated', {
                    x: 50,
                    y: height - 100,
                    size: 20,
                    font,
                    color: rgb(0.8, 0.2, 0.2)
                });

                page.drawText('Please check the transaction data and try again.', {
                    x: 50,
                    y: height - 130,
                    size: 12,
                    font,
                    color: rgb(0.5, 0.5, 0.5)
                });
            }

            await this.watermarkIfSandbox(bulkPdfDoc, opts.sandbox);
            const pdfBytes = await bulkPdfDoc.save();
            const pdfBuffer = Buffer.from(pdfBytes);
            if (!opts.sandbox) {
                const filename = `${format(new Date(), 'yyyy-MM-dd_HHmm')}_bulk_receipts.pdf`;
                const outputPath = path.join(outputDir, filename);
                await writeFile(outputPath, pdfBuffer);
                console.log(`✅ Bulk receipts generated: ${filename}`);
            } else {
                console.log('✅ Bulk receipts generated (sandbox, not saved)');
            }
            return pdfBuffer;
        } catch (error) {
            console.error('❌ Error generating bulk receipts:', error);
            throw new Error(`Failed to generate bulk receipts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

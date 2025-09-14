import axios from 'axios';
import { formatDateForGoogleNotes } from '../utils/timezone';
import { googleNotesConfig } from '../config';

interface NotesUpdateResult {
    success: boolean;
    error?: string;
    deviceId?: string;
    identifier?: string;
}

export class GoogleNotesService {
    private static baseUrl = process.env.API_BASE_URL || 'http://localhost:36464';

    static async updateDeviceNotes(
        assetTag: string,
        notesContent: string,
        authToken: string
    ): Promise<NotesUpdateResult> {
        // Check if Google notes posting is enabled
        if (!googleNotesConfig.enabled) {
            console.log(`📝 [Notes Service] Google notes posting disabled for asset: ${assetTag}`);
            return {
                success: true,
                identifier: assetTag
            };
        }

        console.log(`🔄 [Notes Service] Updating notes for asset: ${assetTag}`);
        console.log(`📝 [Notes Service] Content: ${notesContent}`);

        try {
            const response = await axios.post(
                `${this.baseUrl}/api/google/devices/${assetTag}/notes`,
                { notes: notesContent },
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                }
            );

            if (response.data.success) {
                console.log(`✅ [Notes Service] Notes updated successfully for asset: ${assetTag}`);
                return response.data;
            } else {
                console.error(`❌ [Notes Service] Notes update failed for asset: ${assetTag} - ${response.data.error}`);
                return response.data;
            }

        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
            console.error(`❌ [Notes Service] HTTP request failed for asset: ${assetTag} - ${errorMessage}`);

            return {
                success: false,
                error: `HTTP request failed: ${errorMessage}`,
                identifier: assetTag
            };
        }
    }

    static formatCheckoutNote(
        studentName: string,
        studentEmail: string,
        adminName: string,
        isInsured: boolean,
        timestamp: Date = new Date()
    ): string {
        const formattedDate = formatDateForGoogleNotes(timestamp);
        const insuranceStatus = isInsured ? 'INSURED' : 'UNINSURED';
        return `ASSIGNED • ${studentName} (${studentEmail}) • ${insuranceStatus} • ${formattedDate} • by ${adminName}`;
    }

    static formatCheckinNote(
        studentName: string,
        studentEmail: string,
        adminName: string,
        isInsured: boolean,
        timestamp: Date = new Date()
    ): string {
        const formattedDate = formatDateForGoogleNotes(timestamp);
        const insuranceStatus = isInsured ? 'INSURED' : 'UNINSURED';
        return `RETURNED • ${studentName} (${studentEmail}) • ${insuranceStatus} • ${formattedDate} • by ${adminName}`;
    }

    static formatReassignmentNote(
        newStudentName: string,
        newStudentEmail: string,
        previousStudentName: string,
        adminName: string,
        isInsured: boolean,
        timestamp: Date = new Date()
    ): string {
        const formattedDate = formatDateForGoogleNotes(timestamp);
        const insuranceStatus = isInsured ? 'INSURED' : 'UNINSURED';
        return `${newStudentName} (${newStudentEmail}) • ${insuranceStatus} • ${formattedDate} • by ${adminName} (Reassigned from ${previousStudentName})`;
    }
}

/**
 * Utility functions for handling insurance status display throughout the application
 */

export interface InsuranceStatusData {
    isInsured?: boolean | null;
    insurance_status?: string | null;
    insuranceStatus?: string | null; // For backwards compatibility
}

/**
 * Get the display text for insurance status based on chromebook data
 * @param chromebook - The chromebook object containing insurance information
 * @returns A formatted string for display
 */
export const getInsuranceStatusDisplay = (chromebook: InsuranceStatusData): string => {
    // If device is marked as insured or insurance status is 'insured', show as insured
    if (chromebook.isInsured || chromebook.insurance_status === 'insured') {
        return 'Insured';
    }

    // Check for pending insurance payment (new field or legacy field)
    const insuranceStatus = chromebook.insurance_status || chromebook.insuranceStatus;
    if (insuranceStatus === 'pending') {
        return 'Not Insured (Payment Pending)';
    }

    // Default to uninsured for denied coverage or no insurance
    return 'Not Insured';
};

/**
 * Get the badge variant for insurance status styling
 * @param chromebook - The chromebook object containing insurance information
 * @returns Badge variant string for UI components
 */
export const getInsuranceStatusVariant = (chromebook: InsuranceStatusData): 'default' | 'secondary' | 'destructive' => {
    if (chromebook.isInsured || chromebook.insurance_status === 'insured') {
        return 'default'; // Green styling for insured
    }

    const insuranceStatus = chromebook.insurance_status || chromebook.insuranceStatus;
    if (insuranceStatus === 'pending') {
        return 'secondary'; // Yellow/warning styling for pending
    }

    return 'destructive'; // Red styling for not insured
};

/**
 * Get the CSS classes for insurance status styling
 * @param chromebook - The chromebook object containing insurance information
 * @returns CSS class string for styling
 */
export const getInsuranceStatusClasses = (chromebook: InsuranceStatusData): string => {
    if (chromebook.isInsured || chromebook.insurance_status === 'insured') {
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }

    const insuranceStatus = chromebook.insurance_status || chromebook.insuranceStatus;
    if (insuranceStatus === 'pending') {
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }

    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
};

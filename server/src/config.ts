export const feeAndCostConfig = {
    ltcFee: 40,
    replacementCharger: 40,
    replacementKeyboard: 40,
    replacementScreen: 100,
    replacementDevice: 350,
};

export const googleNotesConfig = {
    enabled: process.env.ENABLE_GOOGLE_NOTES !== 'false', // Default to true unless explicitly set to 'false'
};

export const reportsConfig = {
    hiddenOrgs: process.env.HIDE_ORG_FROM_REPORTS?.split(',').map(org => org.trim()) || []
};

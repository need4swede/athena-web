export const feeAndCostConfig = {
    ltcFee: 40,
    replacementCharger: 40,
    replacementKeyboard: 40,
    replacementScreen: 100,
    replacementDevice: 350,
};

export const apiConfig = {
    // Get the base API URL and remove the /api suffix to get the backend base URL
    backendBaseUrl: (import.meta.env.VITE_API_URL || 'http://localhost:36464/api').replace('/api', ''),
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:36464/api'
};

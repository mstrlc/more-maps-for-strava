/**
 * Route Recon for Strava - Strings (English)
 *
 * This file centralises all user‑visible text strings.
 */

if (typeof RouteReconConfig !== 'undefined') {
    RouteReconConfig.STRINGS = {
        UI: {
            PANORAMA_TOOLTIP: 'Panorama Mode',
            SETTINGS_LABEL: 'Route Recon Settings',
            SETTINGS_TITLE: 'Route Recon Settings',
            API_KEYS_NOTICE: "API keys are stored exclusively in your browser's local storage and never leave your machine.",
            SAVE_BUTTON: 'Save Settings',
            RESET_BUTTON: 'Delete All Extension Data',
            DELETE_DATA_CONFIRM: 'Are you sure you want to delete all extension data? This will remove all API keys and reset all settings. This action cannot be undone.',
            STYLING_HEADER: 'Map Styling',
            STYLING_EXPLAINER: 'Only applies to custom layers.',
            OPACITY_LABEL: 'Opacity',
            SATURATION_LABEL: 'Saturation'
        },
        PANORAMA: {
            LOADING: 'Loading Panorama...',
            NO_PANO_TITLE: 'No Panorama available',
            NO_PANO_TEXT: "Couldn't find a Panorama image at this location.<br>Try clicking closer to a road.",
            ERROR_TITLE: 'Error',
            CLOSE_TOOLTIP: 'Close Panorama'
        },
        SETTINGS: {
            INSTRUCTIONS_TITLE: 'API Keys Required (Free Tiers Available)',
            INSTRUCTIONS_TEXT: 'To enable all features, please obtain free API keys from:',
            MAPY_LABEL: 'Mapy.cz',
            GOOGLE_LABEL: 'Google Maps',
            TF_LABEL: 'Thunderforest (for Cycle Map)',
            MAPY_PLACEHOLDER: 'Enter Mapy.cz API key...',
            GOOGLE_PLACEHOLDER: 'Enter Google Maps API key...',
            TF_PLACEHOLDER: 'Enter Thunderforest API key...',
            PROVIDER_MAPY: 'Mapy.cz',
            PROVIDER_GOOGLE: 'Google Street View',
            API_KEYS_HEADER: 'API Keys',
            GET_KEY: 'Get API key',
            TRY_PROVIDER_PREFIX: 'Try ',
            API_LINKS: {
                MAPY: 'https://developer.mapy.com/account/projects',
                GOOGLE: 'https://console.cloud.google.com/google/maps-apis/credentials',
                TF: 'https://manage.thunderforest.com/'
            }
        }
    };
}

/**
 * Strava More Maps - Strings (English)
 *
 * This file centralises all user‑visible text strings.
 */

if (typeof StravaMoreMapsConfig !== 'undefined') {
    StravaMoreMapsConfig.STRINGS = {
        UI: {
            PANORAMA_TOOLTIP: 'Panorama Mode',
            SETTINGS_LABEL: 'More Maps',
            SETTINGS_TITLE: 'More Maps Settings',
            API_KEYS_NOTICE: "API keys are stored exclusively in your browser's local storage and never leave your machine.",
            SAVE_BUTTON: 'Save Settings',
            STYLING_HEADER: 'Map Styling',
            STYLING_EXPLAINER: 'Only applies to "More Maps" layers.',
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
            MAPY_LABEL: 'Mapy.cz API Key',
            GOOGLE_LABEL: 'Google Maps API Key',
            TF_LABEL: 'Thunderforest API Key (for Cycle Map)',
            MAPY_PLACEHOLDER: 'Enter Mapy.cz API key...',
            GOOGLE_PLACEHOLDER: 'Enter Google Maps API key...',
            TF_PLACEHOLDER: 'Enter Thunderforest API key...',
            PROVIDER_LABEL: 'Panorama Provider',
            PROVIDER_MAPY: 'Mapy.cz',
            PROVIDER_GOOGLE: 'Google Street View'
        }
    };
}

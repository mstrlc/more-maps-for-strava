/**
 * More Maps for Strava - Strings (English)
 *
 * This file centralises all user‑visible text strings.
 */

if (typeof MoreMapsConfig !== 'undefined') {
    MoreMapsConfig.STRINGS = {
        UI: {
            PANORAMA_TOOLTIP: 'Panorama Mode',
            SETTINGS_LABEL: 'More Maps Settings',
            SETTINGS_TITLE: 'More Maps Settings',
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
            NO_GOOGLE_PANO_TEXT: "Couldn't find Google Street View at this location.<br>Try clicking closer to a road.",
            ERROR_TITLE: 'Error',
            CLOSE_TOOLTIP: 'Close Panorama'
        },
        SETTINGS: {
            INSTRUCTIONS_TITLE: 'A free API key is needed',
            INSTRUCTIONS_TEXT: 'Takes about a minute — create a free account and paste your key below.',
            MAPY_LABEL: 'Mapy.cz API key',
            GOOGLE_LABEL: 'Google Maps API key',
            TF_LABEL: 'Thunderforest API key',
            MAPY_PLACEHOLDER: 'Paste your Mapy.cz API key here...',
            GOOGLE_PLACEHOLDER: 'Paste your Google Maps API key here...',
            TF_PLACEHOLDER: 'Paste your Thunderforest API key here...',
            PROVIDER_MAPY: 'Mapy.cz',
            PROVIDER_GOOGLE: 'Google Street View',
            API_KEYS_HEADER: 'API Keys',
            API_KEYS_EXPLAINER: 'To keep this extension free, each user provides their own API keys. Providers charge per request, so the key needs to be linked to your account. The free tiers are generous — <strong>no credit card required</strong>, and <strong>personal use won\'t cost you anything</strong>.',
            GET_KEY: 'Get free key (~1 min)',
            GET_KEY_GOOGLE: 'Get free key (~3 min)',
            TRY_PROVIDER_PREFIX: 'Try ',
            API_LINKS: {
                MAPY: 'https://developer.mapy.com/account/projects',
                GOOGLE: 'https://console.cloud.google.com/google/maps-apis/credentials',
                TF: 'https://manage.thunderforest.com/'
            }
        }
    };
}

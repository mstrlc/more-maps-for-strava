/**
 * More Maps for Strava - Configuration
 */
var MoreMapsConfig = {
    SELECTORS: {
        CONTAINER: '[class*="MapDisplayControl_options"]',
        BUTTON: 'MapDisplayControl_optionButton',
        IMAGE: 'MapDisplayControl_option',
        TEXT: ['element_body1', 'element_fontSize2xs'],
        SELECTED_CLASS: 'MapDisplayControl_selected',
        NAV_MENU: '.react-horizontal-scrolling-menu--scroll-container'
    },

    MAP_OPTIONS: [
        { id: 'mapycz-regular', label: 'Standard', img: 'assets/mapycom/standard.png' },
        { id: 'mapycz-outdoor', label: 'Outdoor', img: 'assets/mapycom/outdoor.png' },
        { id: 'mapycz-winter', label: 'Winter', img: 'assets/mapycom/winter.png' },
        { id: 'mapycz-satellite', label: 'Satellite', img: 'assets/mapycom/satellite.png' }
    ],

    OSM_OPTIONS: [
        { id: 'osm-regular', label: 'Standard', img: 'assets/osm/standard.png' },
        { id: 'osm-cyclosm', label: 'CyclOSM', img: 'assets/osm/cyclosm.png' },
        { id: 'osm-cycle', label: 'Cycle Map', img: 'assets/osm/cycle.png' }
    ],

    GOOGLE_OPTIONS: [
        { id: 'google-regular', label: 'Standard', img: 'assets/google/standard.png' },
        { id: 'google-satellite', label: 'Satellite', img: 'assets/google/satellite.png' },
        { id: 'google-terrain', label: 'Terrain', img: 'assets/google/terrain.png' },
        { id: 'google-hybrid', label: 'Hybrid', img: 'assets/google/hybrid.png' }
    ],

    STORAGE_KEYS: {
        MAPY_KEY: 'moremaps_mapy_api_key',
        GOOGLE_KEY: 'moremaps_google_api_key',
        TF_KEY: 'moremaps_tf_api_key',
        OPACITY: 'moremaps_opacity',
        SATURATION_MAPBOX: 'moremaps_saturation_mapbox',
        SATURATION_SLIDER: 'moremaps_saturation_slider',
        ACTIVE_ID: 'moremaps_active_id',
        PANO_PROVIDER: 'moremaps_pano_provider',
        GOOGLE_SESSION_ROADMAP: 'moremaps_google_session_roadmap',
        GOOGLE_SESSION_SATELLITE: 'moremaps_google_session_satellite',
        GOOGLE_SESSION_TERRAIN: 'moremaps_google_session_terrain',
        GOOGLE_SESSION_HYBRID: 'moremaps_google_session_hybrid'
    }
};

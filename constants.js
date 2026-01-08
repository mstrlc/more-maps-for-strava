/**
 * Route Recon for Strava - Configuration
 */
var RouteReconConfig = {
    SELECTORS: {
        CONTAINER: '.MapDisplayControl_options__6iIQA',
        BUTTON: 'MapDisplayControl_optionButton___nsae',
        IMAGE: 'MapDisplayControl_option__KwK84',
        TEXT: ['element_body1__VB3SZ', 'element_fontSize2xs__tRJQR'],
        SELECTED_CLASS: 'MapDisplayControl_selected__tEGV8',
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
        MAPY_KEY: 'routerecon_mapy_api_key',
        GOOGLE_KEY: 'routerecon_google_api_key',
        TF_KEY: 'routerecon_tf_api_key',
        OPACITY: 'routerecon_opacity',
        SATURATION_MAPBOX: 'routerecon_saturation_mapbox',
        SATURATION_SLIDER: 'routerecon_saturation_slider',
        ACTIVE_ID: 'routerecon_active_id',
        PANO_PROVIDER: 'routerecon_pano_provider'
    }
};

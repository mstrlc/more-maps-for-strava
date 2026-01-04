/**
 * Strava More Maps - Configuration
 */
var StravaMoreMapsConfig = {
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

    STORAGE_KEYS: {
        MAPY_KEY: 'strava_more_maps_mapy_api_key',
        GOOGLE_KEY: 'strava_more_maps_google_api_key',
        TF_KEY: 'strava_more_maps_tf_api_key',
        OPACITY: 'strava_more_maps_opacity',
        SATURATION_MAPBOX: 'strava_more_maps_saturation_mapbox',
        SATURATION_SLIDER: 'strava_more_maps_saturation_slider',
        ACTIVE_ID: 'strava_more_maps_active_id',
        PANO_PROVIDER: 'strava_more_maps_pano_provider'
    }
};

/**
 * More Maps for Strava - Configuration
 */
var MoreMapsConfig = {
    // Strava's /maps now uses a proprietary WebGL vector engine (FATMAP CoreMap),
    // not Mapbox. The extension mounts its control into the map's top-left UI
    // controls and drives the engine directly (see inject.js).
    SELECTORS: {
        MAP_CANVAS: '#canvas',
        MAP_CONTAINER: '[class*="CoreMap_coreMap"]',
        UI_CONTROLS_TOP_LEFT: '[class*="UIControls_topLeft"]'
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

    // One map layer that draws every Zwift world.
    ZWIFT_OPTIONS: [
        { id: 'zwift-worlds', label: 'All Worlds', img: 'assets/zwift/zwift.svg' }
    ],

    // Where Zwift places each world in the real world: Zwift's own minimap image,
    // stretched (in Web Mercator) over these [north-west, south-east] corners.
    // Bounds from the MIT-licensed zwift-data package, which zwiftmap.com uses.
    // Images live under ZWIFT_IMAGE_BASE and are downloaded from Zwift by each
    // user's browser, never bundled. Listed in the "Go to world" picker's order.
    // `fictional` worlds sit on unrelated real terrain, which is flattened under them.
    // `region` is where the world sits on the real map. Ids match zwiftmap.com's paths.
    // `turnedClockwise` images are stored a quarter turn off north-up; inject.js turns them back.
    ZWIFT_IMAGE_BASE: 'https://cdn.zwift.com/static/images/maps/',
    ZWIFT_WORLDS: [
        { id: 'watopia', name: 'Watopia', region: 'South Pacific', bounds: [[-11.62597, 166.87747], [-11.74087, 167.03255]], image: 'MiniMap_Watopia_2.png', fictional: true },
        { id: 'makuri-islands', name: 'Makuri Islands', region: 'South Pacific', bounds: [[-10.73746, 165.76591], [-10.85234, 165.88222]], image: 'MiniMap_Japan.png', fictional: true, turnedClockwise: true },
        { id: 'france', name: 'France', region: 'New Caledonia', bounds: [[-21.64155, 166.1384], [-21.7564, 166.26125]], image: 'MiniMap_France.png', fictional: true, turnedClockwise: true },
        { id: 'crit-city', name: 'Crit City', region: 'South Pacific', bounds: [[-10.3657, 165.7824], [-10.4038, 165.8207]], image: 'MiniMap_CritCity.png', fictional: true },
        { id: 'london', name: 'London', region: 'London, UK', bounds: [[51.5362, -0.1776], [51.4601, -0.0555]], image: 'MiniMap_London.png' },
        { id: 'new-york', name: 'New York', region: 'New York, USA', bounds: [[40.817257, -74.022655], [40.587913, -73.922165]], image: 'MiniMap_NewYork_2.png' },
        { id: 'richmond', name: 'Richmond', region: 'Richmond, Virginia, USA', bounds: [[37.5774, -77.48954], [37.5014, -77.394]], image: 'MiniMap_Richmond.png' },
        { id: 'innsbruck', name: 'Innsbruck', region: 'Innsbruck, Austria', bounds: [[47.2947, 11.3501], [47.2055, 11.4822]], image: 'MiniMap_Innsbruck.png' },
        { id: 'bologna', name: 'Bologna', region: 'Bologna, Italy', bounds: [[44.5308037, 11.26261748], [44.45463821, 11.36991729102076]], image: 'MiniMap_Bologna.png' },
        { id: 'yorkshire', name: 'Yorkshire', region: 'Harrogate, UK', bounds: [[54.0254, -1.632], [53.9491, -1.5022]], image: 'MiniMap_Yorkshire.png' },
        { id: 'paris', name: 'Paris', region: 'Paris, France', bounds: [[48.9058, 2.2561], [48.82945, 2.3722]], image: 'MiniMap_Champs.png', turnedClockwise: true },
        { id: 'scotland', name: 'Scotland', region: 'Isle of Arran, UK', bounds: [[55.67595, -5.2802], [55.61845, -5.17798]], image: 'MiniMap_Scotland.png', turnedClockwise: true }
    ],

    STORAGE_KEYS: {
        MAPY_KEY: 'moremaps_mapy_api_key',
        GOOGLE_KEY: 'moremaps_google_api_key',
        TF_KEY: 'moremaps_tf_api_key',
        TILE_BRIGHTNESS: 'moremaps_tile_brightness',
        TILE_SATURATION: 'moremaps_tile_saturation',
        ACTIVE_ID: 'moremaps_active_id',
        FAVORITE_ID: 'moremaps_favorite_id',
        COLLAPSED_SECTIONS: 'moremaps_collapsed_sections',
        PANO_PROVIDER: 'moremaps_pano_provider',
        GOOGLE_SESSION_ROADMAP: 'moremaps_google_session_roadmap',
        GOOGLE_SESSION_SATELLITE: 'moremaps_google_session_satellite',
        GOOGLE_SESSION_TERRAIN: 'moremaps_google_session_terrain',
        GOOGLE_SESSION_HYBRID: 'moremaps_google_session_hybrid'
    }
};

// Storage key holding the API key a map needs, or null if it needs none.
MoreMapsConfig.requiredKeyFor = function (mapId) {
    const { STORAGE_KEYS } = MoreMapsConfig;
    if (mapId.startsWith('mapycz-')) return STORAGE_KEYS.MAPY_KEY;
    if (mapId === 'osm-cycle') return STORAGE_KEYS.TF_KEY;
    return null;
};

MoreMapsConfig.isZwiftMap = function (mapId) {
    return MoreMapsConfig.ZWIFT_OPTIONS.some(o => o.id === mapId);
};

// The map to show on page load: the user's favorite, provided it still exists
// and its API key is set (otherwise the carrier would render blank tiles).
MoreMapsConfig.getFavoriteMap = function () {
    const { STORAGE_KEYS, MAP_OPTIONS, OSM_OPTIONS, GOOGLE_OPTIONS, ZWIFT_OPTIONS } = MoreMapsConfig;
    const id = localStorage.getItem(STORAGE_KEYS.FAVORITE_ID);
    if (!id || ![...MAP_OPTIONS, ...OSM_OPTIONS, ...GOOGLE_OPTIONS, ...ZWIFT_OPTIONS].some(o => o.id === id)) {
        return 'strava-default';
    }
    const key = MoreMapsConfig.requiredKeyFor(id);
    if (key && !localStorage.getItem(key)) return 'strava-default';
    return id;
};

// Brightness/saturation applied to our provider tiles, in percent. Brightness
// runs from -100 (black) to +100 (white); 0 and saturation 100 leave tiles untouched.
MoreMapsConfig.TILE_FILTER_DEFAULTS = { brightness: 0, saturation: 100 };

MoreMapsConfig.getTileFilter = function () {
    const { STORAGE_KEYS, TILE_FILTER_DEFAULTS } = MoreMapsConfig;
    const read = (key, fallback) => {
        const v = parseFloat(localStorage.getItem(key));
        return Number.isFinite(v) ? v : fallback;
    };
    return {
        brightness: read(STORAGE_KEYS.TILE_BRIGHTNESS, TILE_FILTER_DEFAULTS.brightness),
        saturation: read(STORAGE_KEYS.TILE_SATURATION, TILE_FILTER_DEFAULTS.saturation)
    };
};

MoreMapsConfig.isNeutralTileFilter = function (filter) {
    const { TILE_FILTER_DEFAULTS } = MoreMapsConfig;
    return filter.brightness === TILE_FILTER_DEFAULTS.brightness &&
        filter.saturation === TILE_FILTER_DEFAULTS.saturation;
};

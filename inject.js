(function () {
    const { STORAGE_KEYS } = MoreMapsConfig;
    const getApiKey = () => localStorage.getItem(STORAGE_KEYS.MAPY_KEY) || '';
    const getTFKey = () => localStorage.getItem(STORAGE_KEYS.TF_KEY) || '';

    // The FATMAP carrier source expects 256px tiles. Retina (@2x / 512px) tiles
    // render blank, so all providers must use plain 256 templates.

    // The raster "carrier" source we hijack. Strava's map is a proprietary WebGL
    // vector engine (FATMAP SDK) with no Mapbox-style addLayer API. Several map
    // types register a full-coverage raster tile source whose URL template we can
    // repoint at any {z}/{x}/{y} raster provider.
    //
    // We use the TOPO_WINTER_HYBRID map type + its "winter-overlay-imagery" source:
    // unlike the SATELLITE_SUMMER carrier, this one renders the raster FLAT (no
    // aggressive terrain hillshade), so custom flat maps (Mapy/OSM/Google) look
    // clean, and Strava's heatmap/route overlays still composite on top.
    const CARRIER_SOURCE = 'winter-overlay-imagery';
    const CARRIER_MAP_TYPE = 2; // STRAVA_PLANET_TOPO_WINTER_HYBRID
    // Default template Strava ships (fallback for restore if we can't read it live).
    const CARRIER_DEFAULT_URL = '{STRAVA_TILE_SERVER_URL}/winter-imagery/{quadkey}.png?groupId={groupId}';

    // Map the ?style= URL param to a FATMAP MapType enum value. Use the plain
    // (non-EXPERIMENT) types: the EXPERIMENT variants (5-9) render blank in some
    // browsers (e.g. Firefox), whereas 0-4 render reliably (our carrier is 2).
    const STYLE_TO_MAPTYPE = {
        standard: 0, // STRAVA_PLANET_TOPO_LIGHT
        dark: 1,     // STRAVA_PLANET_TOPO_DARK
        winter: 2,   // STRAVA_PLANET_TOPO_WINTER_HYBRID
        hybrid: 3,   // STRAVA_PLANET_HYBRID
        satellite: 4 // STRAVA_PLANET_SATELLITE_SUMMER
    };

    /**
     * Provider tile sources. Each resolves to a single {z}/{x}/{y} raster template.
     * The FATMAP engine substitutes {x}/{y}/{z} just like Mapbox raster sources.
     */
    const MAP_SOURCES = {
        'mapycz-regular': {
            url: 'https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${API_KEY}'
        },
        'mapycz-outdoor': {
            url: 'https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=${API_KEY}'
        },
        'mapycz-winter': {
            url: `https://api.mapy.com/v1/maptiles/winter/256/{z}/{x}/{y}?apikey=\${API_KEY}`
        },
        'mapycz-satellite': {
            url: `https://api.mapy.com/v1/maptiles/aerial/256/{z}/{x}/{y}?apikey=\${API_KEY}`
        },
        'osm-regular': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        },
        'osm-cyclosm': {
            url: 'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'
        },
        'osm-cycle': {
            url: 'https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=\${API_KEY}'
        },
        'google-regular': {
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
        },
        'google-satellite': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
        },
        'google-terrain': {
            url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
        },
        'google-hybrid': {
            url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
        }
    };

    /**
     * Drives Strava's FATMAP (CoreMap) engine to swap base tiles and run panorama.
     */
    class MoreMapsManager {
        constructor() {
            this.engine = null;
            this.poller = null;
            this.currentMapType = 'strava-default';
            this.savedCarrierUrl = null;   // Strava's original carrier template
            this.viewListener = null;      // re-assert listener while a custom map is active
            this.desiredUrl = null;        // provider URL we expect the carrier to hold
        }

        start() {
            window.addEventListener('message', this.handleMessage.bind(this));
            this.poller = setInterval(() => this.findEngine(), 2000);
            this.findEngine();
        }

        // --- Engine discovery (React Fiber) ---

        getReactFiber(dom) {
            for (const key in dom) {
                if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
                    return dom[key];
                }
            }
            return null;
        }

        isEngine(o) {
            try {
                return o && typeof o === 'object' &&
                    typeof o.setMapType === 'function' &&
                    typeof o.getTileSources === 'function' &&
                    typeof o.switchToCustomStyleUrl === 'function';
            } catch (e) {
                return false;
            }
        }

        /**
         * Locate the live FATMAP engine instance by BFS-ing the React Fiber tree
         * rooted at the CoreMap container (props, hooks, stateNode).
         */
        findEngine(force) {
            // React can remount the map (soft nav, popover), leaving our cached
            // handle pointing at a dead engine that still has the methods. On user
            // actions we force a fresh scan so we always drive the LIVE engine.
            if (!force && this.isEngine(this.engine)) return this.engine;
            const prevEngine = this.engine;
            this.engine = null;

            // /maps & route builder use CoreMap_coreMap / Map_map; the activity
            // detail page wraps the map in #map-canvas (a fiber-less <div>) — there
            // the fiber lives on the inner <canvas> (id="canvas"), NOT the wrapper.
            // So gather ALL candidate roots and start from the first that actually
            // yields a React fiber (self or parent), rather than the first that
            // merely exists in the DOM.
            const candidates = [
                document.querySelector('[class*="CoreMap_coreMap"]'),
                document.querySelector('[class*="Map_map"]'),
                document.querySelector('#canvas'),
                document.querySelector('canvas'),
                document.querySelector('#map-canvas'),
            ].filter(Boolean);

            let start = null;
            for (const el of candidates) {
                start = this.getReactFiber(el) ||
                    (el.parentElement && this.getReactFiber(el.parentElement));
                if (start) break;
            }
            if (!start) return null;

            const objSeen = new Set();
            const rec = (o) => {
                if (this.engine || !o || (typeof o !== 'object' && typeof o !== 'function') || objSeen.has(o)) return;
                objSeen.add(o);
                if (this.isEngine(o)) this.engine = o;
            };

            const fSeen = new Set();
            const queue = [start];
            let steps = 0;
            while (queue.length && steps < 9000 && !this.engine) {
                const c = queue.shift();
                steps++;
                if (!c || fSeen.has(c)) continue;
                fSeen.add(c);
                try {
                    if (c.memoizedProps) for (const k in c.memoizedProps) {
                        rec(c.memoizedProps[k]);
                        const v = c.memoizedProps[k];
                        if (v && typeof v === 'object') for (const k2 in v) { try { rec(v[k2]); } catch (e) {} }
                    }
                } catch (e) {}
                try {
                    if (c.stateNode && typeof c.stateNode === 'object') {
                        rec(c.stateNode);
                        for (const k in c.stateNode) { try { rec(c.stateNode[k]); } catch (e) {} }
                    }
                } catch (e) {}
                try {
                    if (c.memoizedState) {
                        let h = c.memoizedState, hi = 0;
                        while (h && hi < 120) {
                            if (h.memoizedState) {
                                rec(h.memoizedState);
                                if (h.memoizedState.current) rec(h.memoizedState.current);
                                if (typeof h.memoizedState === 'object') for (const k in h.memoizedState) { try { rec(h.memoizedState[k]); } catch (e) {} }
                            }
                            h = h.next; hi++;
                        }
                    }
                } catch (e) {}
                if (c.child) queue.push(c.child);
                if (c.sibling) queue.push(c.sibling);
                if (c.return && !fSeen.has(c.return)) queue.push(c.return);
            }

            if (this.engine) {
                // Only re-apply the active custom map when we captured a genuinely
                // NEW engine instance (a remount) — not on every forced re-scan.
                // Re-applying calls clearCache() and would reload all tiles, which
                // is why toggling panorama used to flash a full reload.
                if (this.engine !== prevEngine) {
                    console.log('%cMore Maps: FATMAP engine CAPTURED', 'color: green', this.engine);
                    if (this.currentMapType !== 'strava-default') {
                        this.applyMapStyle(this.currentMapType);
                    }
                }
            }
            return this.engine;
        }

        // --- Message handling ---

        handleMessage(event) {
            if (event.source !== window || !event.data) return;
            const data = event.data;

            if (data.type === 'MOREMAPS_MAP_SWITCH') {
                this.currentMapType = data.mapType;
                this.findEngine(true);
                this.applyMapStyle(data.mapType);
            } else if (data.type === 'MOREMAPS_MAP_CLEAR') {
                // Strava's native style button does the map-type switch itself.
                // We only clean up passively — NO setMapType (crashes Firefox's
                // WASM), NO clearCache/requestRender (would fight Strava's switch).
                this.currentMapType = 'strava-default';
                this.findEngine(true);
                this.softClear();
            } else if (data.type === 'MOREMAPS_API_KEY_UPDATED') {
                if (this.currentMapType !== 'strava-default') {
                    this.findEngine(true);
                    this.applyMapStyle(this.currentMapType);
                }
            } else if (data.type === 'MOREMAPS_PANORAMA_TOGGLE') {
                this.handlePanoramaToggle(data.active);
            }
            // Opacity/saturation are unsupported by the FATMAP engine; ignored.
        }

        // --- Tile swapping ---

        getTileSourcesApi() {
            try { return this.engine.getTileSources(); } catch (e) { return null; }
        }

        readCarrierUrl(tsApi) {
            try {
                const list = JSON.parse(JSON.stringify(tsApi.getTileSources()));
                const s = list.find(x => x.name === CARRIER_SOURCE);
                return s ? s.templateUrl : null;
            } catch (e) { return null; }
        }

        resolveUrl(mapType) {
            const config = MAP_SOURCES[mapType];
            if (!config) return null;
            let apiKey = '';
            if (mapType === 'osm-cycle') apiKey = getTFKey();
            else if (mapType.startsWith('mapycz-')) apiKey = getApiKey();
            return config.url.replace('${API_KEY}', apiKey || '');
        }

        applyMapStyle(mapType) {
            if (!this.isEngine(this.engine)) return;

            if (mapType === 'strava-default') {
                this.restore();
                return;
            }

            const url = this.resolveUrl(mapType);
            if (!url) return;

            try {
                // Activate the raster carrier map type (registers the carrier source).
                this.engine.setMapType(CARRIER_MAP_TYPE);

                const tsApi = this.getTileSourcesApi();
                if (!tsApi) return;

                // Capture Strava's original carrier template once, so reset can restore it.
                if (this.savedCarrierUrl === null) {
                    this.savedCarrierUrl = this.readCarrierUrl(tsApi) || CARRIER_DEFAULT_URL;
                }

                console.log('More Maps: switching base tiles to', mapType);
                tsApi.setTileSourceTemplateUrl(CARRIER_SOURCE, url);
                this.desiredUrl = url;

                // Hide Strava's own labels/POI so they don't double up with the
                // provider's baked-in labels. (Terrain hillshade cannot be safely
                // removed — setIsTerrain3dEnabled freezes the engine's next render.)
                try { this.engine.setEnableScreenSymbols(false); } catch (e) {}

                try { this.engine.getDebugApi().clearCache(); } catch (e) {}
                try { this.engine.requestRender(); } catch (e) {}

                // Safety net: re-assert the override shortly after activation, in
                // case switching the map type let the carrier's default tiles (the
                // "winter" base) win the initial render race.
                setTimeout(() => {
                    if (this.desiredUrl !== url || !this.isEngine(this.engine)) return;
                    try {
                        const ts = this.getTileSourcesApi();
                        if (ts && this.readCarrierUrl(ts) !== url) {
                            ts.setTileSourceTemplateUrl(CARRIER_SOURCE, url);
                            this.engine.getDebugApi().clearCache();
                            this.engine.requestRender();
                        }
                    } catch (e) {}
                }, 400);
            } catch (e) {
                console.error('More Maps: error applying tiles', e);
            }
        }

        // Passive cleanup when the user clicks a native Strava style button.
        // Strava's own handler switches the map type; we just re-enable labels and
        // restore the carrier's original tile template. No setMapType (Firefox WASM
        // crash) and no clearCache/requestRender (would fight Strava's switch).
        softClear() {
            this.desiredUrl = null;
            if (!this.isEngine(this.engine)) return;
            try { this.engine.setEnableScreenSymbols(true); } catch (e) {}
            try {
                const tsApi = this.getTileSourcesApi();
                if (tsApi && this.savedCarrierUrl) {
                    tsApi.setTileSourceTemplateUrl(CARRIER_SOURCE, this.savedCarrierUrl);
                }
            } catch (e) {}
        }

        // Drop our override, restoring Strava's original carrier tiles, without
        // touching the map type (Strava's own click handler sets it).
        clearOverride() {
            this.removeReassert();
            this.desiredUrl = null;
            if (!this.isEngine(this.engine)) return;
            try { this.engine.setEnableScreenSymbols(true); } catch (e) {}
            try {
                const tsApi = this.getTileSourcesApi();
                if (tsApi && this.savedCarrierUrl) {
                    tsApi.setTileSourceTemplateUrl(CARRIER_SOURCE, this.savedCarrierUrl);
                    try { this.engine.getDebugApi().clearCache(); } catch (e) {}
                    try { this.engine.requestRender(); } catch (e) {}
                }
            } catch (e) {
                console.error('More Maps: error clearing override', e);
            }
        }

        restore() {
            this.removeReassert();
            this.desiredUrl = null;
            if (!this.isEngine(this.engine)) return;
            try { this.engine.setEnableScreenSymbols(true); } catch (e) {}
            try {
                const tsApi = this.getTileSourcesApi();
                if (tsApi && this.savedCarrierUrl) {
                    tsApi.setTileSourceTemplateUrl(CARRIER_SOURCE, this.savedCarrierUrl);
                }
                // Restore the map type Strava had (best-effort from the URL ?style=).
                const style = new URLSearchParams(location.search).get('style') || 'standard';
                const mt = STYLE_TO_MAPTYPE[style] != null ? STYLE_TO_MAPTYPE[style] : 0;
                this.engine.setMapType(mt);
                try { this.engine.getDebugApi().clearCache(); } catch (e) {}
                try { this.engine.requestRender(); } catch (e) {}
            } catch (e) {
                console.error('More Maps: error restoring', e);
            }
        }

        /**
         * Strava's React layer owns the map type and can re-assert it (e.g. after a
         * soft navigation). A lightweight view-update listener re-applies our carrier
         * override if it detects the template drifting back to Strava's.
         */
        installReassert() {
            if (this.viewListener || !this.isEngine(this.engine)) return;
            const self = this;
            this.viewListener = {
                onViewUpdated: () => {
                    if (!self.desiredUrl || !self.isEngine(self.engine)) return;
                    try {
                        const tsApi = self.getTileSourcesApi();
                        if (!tsApi) return;
                        const cur = self.readCarrierUrl(tsApi);
                        if (cur !== self.desiredUrl) {
                            self.engine.setMapType(CARRIER_MAP_TYPE);
                            tsApi.setTileSourceTemplateUrl(CARRIER_SOURCE, self.desiredUrl);
                        }
                    } catch (e) {}
                }
            };
            try { this.engine.addViewUpdateListener(this.viewListener); } catch (e) { this.viewListener = null; }
        }

        removeReassert() {
            if (this.viewListener && this.isEngine(this.engine)) {
                try { this.engine.removeViewUpdateListener(this.viewListener); } catch (e) {}
            }
            this.viewListener = null;
        }

        // --- Panorama ---

        handlePanoramaToggle(active) {
            this.findEngine(true);
            if (!this.engine) {
                console.warn('More Maps: no engine for panorama');
                return;
            }
            const engine = this.engine;
            const tryToggle = (attempts = 0) => {
                if (typeof window.MoreMapsPanorama !== 'undefined') {
                    if (active) window.MoreMapsPanorama.enable(engine);
                    else window.MoreMapsPanorama.disable(engine);
                } else if (attempts < 20) {
                    setTimeout(() => tryToggle(attempts + 1), 200);
                } else {
                    console.error('More Maps: panorama module failed to load');
                }
            };
            tryToggle();
        }
    }

    const manager = new MoreMapsManager();
    manager.start();
    // Debug handle for diagnosing issues from the console (harmless in prod).
    window.__mmManager = manager;
})();

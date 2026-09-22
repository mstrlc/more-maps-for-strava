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

    // On load, poll for the engine this often (instead of every 2s) for this
    // long, so a favorite map replaces Strava's own map before it's visible.
    const FAST_POLL_INTERVAL_MS = 100;
    const FAST_POLL_DURATION_MS = 20000;
    // While a favorite map is loading the canvas stays hidden, so Strava's own
    // map doesn't flash first. Reveal shortly after the swap (the engine needs
    // a moment to fetch the new tiles), or after a timeout as a safety net.
    const REVEAL_DELAY_MS = 300;
    const COVER_TIMEOUT_MS = 8000;
    // A freshly created engine isn't initialised yet: switching its map type
    // right away can break it (white canvas until reload). Wait until it has
    // registered its tile sources, then let Strava's own startup settle.
    const READY_POLL_MS = 100;
    const READY_MAX_ATTEMPTS = 50;
    const ENGINE_SETTLE_MS = 500;
    // Repointing the carrier's tile template or clearing the tile cache while
    // tiles are in flight corrupts the engine's memory ("memory access out of
    // bounds" in the render loop): the map freezes until reload. Strava never
    // does either, so we only do them once tile loading has been quiet for a
    // moment — which in practice is a few hundred ms.
    const IDLE_QUIET_MS = 100;
    const IDLE_POLL_MS = 50;

    // Background tabs (e.g. middle-click from the dashboard) pause rendering
    // and throttle timers, so the engine doesn't finish initialising until the
    // tab is shown. Driving it before that leaves it stuck on a white canvas.
    const whenVisible = (fn) => {
        if (!document.hidden) { fn(); return; }
        const onChange = () => {
            if (document.hidden) return;
            document.removeEventListener('visibilitychange', onChange);
            fn();
        };
        document.addEventListener('visibilitychange', onChange);
    };

    /**
     * Drives Strava's FATMAP (CoreMap) engine to swap base tiles and run panorama.
     */
    class MoreMapsManager {
        constructor() {
            this.engine = null;
            this.poller = null;
            // Start on the user's favorite map (if any); findEngine applies it as
            // soon as the engine is captured.
            this.currentMapType = MoreMapsConfig.getFavoriteMap();
            this.savedCarrierUrl = null;   // Strava's original carrier template
            this.desiredUrl = null;        // provider URL we expect the carrier to hold
            this.carrierActive = false;    // is the engine on the carrier map type?
            this.cachedUrl = null;         // provider whose tiles the carrier cache may hold
            this.tilesLoading = false;     // from the engine's tile-loading listener
            this.lastTileEvent = 0;
            this.idleQueue = [];           // engine calls waiting for tile loading to settle
            this.idleTimer = null;
            this.coverObserver = null;     // hides the canvas until the favorite is applied
            this.pendingApply = null;      // engine we're waiting on before applying
        }

        start() {
            window.addEventListener('message', this.handleMessage.bind(this));
            if (this.currentMapType !== 'strava-default') this.coverMap();
            this.poller = setInterval(() => this.findEngine(), 2000);
            this.fastPoll();
        }

        // The regular 2s poll could leave Strava's own map on screen for up to
        // 2s before the favorite kicks in. Poll quickly until the engine appears.
        fastPoll() {
            if (document.hidden) { whenVisible(() => this.fastPoll()); return; }
            const t0 = Date.now();
            const tick = () => {
                if (this.findEngine()) return;
                if (Date.now() - t0 > FAST_POLL_DURATION_MS) { this.uncoverMap(0); return; }
                setTimeout(tick, FAST_POLL_INTERVAL_MS);
            };
            tick();
        }

        // Hide the map canvas as soon as it's created, until uncoverMap().
        coverMap() {
            const hide = () => {
                const c = document.querySelector('#canvas');
                if (c && !c.dataset.mmCovered) {
                    c.dataset.mmCovered = '1';
                    c.style.opacity = '0';
                }
            };
            this.coverObserver = new MutationObserver(hide);
            this.coverObserver.observe(document.documentElement, { childList: true, subtree: true });
            hide();
            whenVisible(() => setTimeout(() => this.uncoverMap(0), COVER_TIMEOUT_MS));
        }

        uncoverMap(delay) {
            if (!this.coverObserver) return;
            this.coverObserver.disconnect();
            this.coverObserver = null;
            setTimeout(() => {
                document.querySelectorAll('canvas[data-mm-covered]').forEach(c => {
                    c.style.transition = 'opacity 150ms ease';
                    c.style.opacity = '';
                    delete c.dataset.mmCovered;
                });
            }, delay);
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
                    this.attachEngine(this.engine);
                    if (this.currentMapType !== 'strava-default') {
                        this.applyWhenReady(this.engine);
                    }
                }
            }
            return this.engine;
        }

        // Fresh engine: nothing of ours in its cache, and it's on whatever map
        // type Strava started it with (the carrier only if that's Winter).
        attachEngine(engine) {
            this.carrierActive = this.stravaStyle() === 'winter';
            this.cachedUrl = null;
            this.tilesLoading = false;
            this.lastTileEvent = Date.now();
            this.idleQueue = [];
            try {
                engine.addTileLoadingListener({
                    onTilesLoadingStarted: () => { this.tilesLoading = true; this.lastTileEvent = Date.now(); },
                    onTilesLoaded: () => { this.tilesLoading = false; this.lastTileEvent = Date.now(); }
                });
            } catch (e) {}
        }

        stravaStyle() {
            return new URLSearchParams(location.search).get('style') || 'standard';
        }

        // Run fn once tile loading has settled (see IDLE_QUIET_MS). Dropped if
        // the engine is replaced in the meantime.
        whenTilesIdle(fn) {
            const engine = this.engine;
            this.idleQueue.push(() => { if (this.engine === engine) fn(); });
            if (this.idleTimer) return;
            this.idleTimer = setInterval(() => {
                if (this.tilesLoading || Date.now() - this.lastTileEvent < IDLE_QUIET_MS) return;
                clearInterval(this.idleTimer);
                this.idleTimer = null;
                const queue = this.idleQueue;
                this.idleQueue = [];
                queue.forEach(f => { try { f(); } catch (e) { console.error('More Maps:', e); } });
            }, IDLE_POLL_MS);
        }

        clearTileCache() {
            try { this.engine.getDebugApi().clearCache(); } catch (e) {}
            try { this.engine.requestRender(); } catch (e) {}
        }

        engineReady(engine) {
            try {
                const list = JSON.parse(JSON.stringify(engine.getTileSources().getTileSources()));
                return Array.isArray(list) && list.length > 0;
            } catch (e) {
                return false;
            }
        }

        // Apply the current (favorite / pre-remount) map once a new engine is
        // initialised. A user action in the meantime cancels this.
        applyWhenReady(engine) {
            this.pendingApply = engine;
            let attempts = 0;
            const check = () => {
                if (this.pendingApply !== engine || this.engine !== engine) return;
                if (!this.engineReady(engine) && ++attempts < READY_MAX_ATTEMPTS) {
                    setTimeout(check, READY_POLL_MS);
                    return;
                }
                setTimeout(() => {
                    if (this.pendingApply !== engine || this.engine !== engine) return;
                    this.pendingApply = null;
                    if (this.currentMapType !== 'strava-default') this.applyMapStyle(this.currentMapType);
                    else this.uncoverMap(0);
                }, ENGINE_SETTLE_MS);
            };
            whenVisible(check);
        }

        // --- Message handling ---

        handleMessage(event) {
            if (event.source !== window || !event.data) return;
            const data = event.data;

            if (data.type === 'MOREMAPS_MAP_SWITCH' || data.type === 'MOREMAPS_MAP_CLEAR') {
                this.pendingApply = null;
                this.uncoverMap(0);
            }

            if (data.type === 'MOREMAPS_MAP_SWITCH') {
                this.currentMapType = data.mapType;
                this.findEngine(true);
                this.applyMapStyle(data.mapType);
            } else if (data.type === 'MOREMAPS_MAP_CLEAR') {
                // Strava's native style button does the map-type switch itself.
                // We only clean up passively — NO setMapType (crashes Firefox's
                // WASM), and tile changes wait until Strava's switch has loaded.
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
            const url = this.resolveUrl(mapType);
            if (!url) return;

            try {
                const tsApi = this.getTileSourcesApi();
                if (!tsApi) return;

                // Capture Strava's original carrier template once, so reset can restore it.
                if (this.savedCarrierUrl === null) {
                    this.savedCarrierUrl = this.readCarrierUrl(tsApi) || CARRIER_DEFAULT_URL;
                }

                console.log('More Maps: switching base tiles to', mapType);
                this.desiredUrl = url;

                // Hide Strava's own labels/POI so they don't double up with the
                // provider's baked-in labels. (Terrain hillshade cannot be safely
                // removed — setIsTerrain3dEnabled freezes the engine's next render.)
                try { this.engine.setEnableScreenSymbols(false); } catch (e) {}

                // Everything else waits until tile loading has settled, e.g. from
                // a Strava style switch the user just made.
                this.whenTilesIdle(() => {
                    if (this.desiredUrl !== url) return; // superseded meanwhile
                    const ts = this.getTileSourcesApi();
                    if (!ts) return;
                    if (this.readCarrierUrl(ts) !== url) {
                        // Template first, so the carrier never shows Strava's winter tiles.
                        ts.setTileSourceTemplateUrl(CARRIER_SOURCE, url);
                    }
                    if (!this.carrierActive) {
                        this.engine.setMapType(CARRIER_MAP_TYPE);
                        this.carrierActive = true;
                    }
                    // The cache is keyed by source, not URL: another provider's
                    // tiles would linger if the reset's cache clear didn't run.
                    if (this.cachedUrl && this.cachedUrl !== url) this.clearTileCache();
                    this.cachedUrl = url;
                    this.uncoverMap(REVEAL_DELAY_MS);
                });
            } catch (e) {
                console.error('More Maps: error applying tiles', e);
            }
        }

        // Cleanup when the user clicks a native Strava style button. Strava's own
        // handler switches the map type (we must not: setMapType crashes Firefox's
        // WASM). Once its tiles have loaded, restore the carrier's original
        // template and drop our tiles from the cache, so the next custom map
        // starts clean.
        softClear() {
            this.desiredUrl = null;
            this.carrierActive = false;
            if (!this.isEngine(this.engine)) return;
            try { this.engine.setEnableScreenSymbols(true); } catch (e) {}
            this.whenTilesIdle(() => {
                if (this.desiredUrl !== null) return; // back on a custom map already
                this.carrierActive = this.stravaStyle() === 'winter';
                const tsApi = this.getTileSourcesApi();
                if (tsApi && this.savedCarrierUrl) {
                    tsApi.setTileSourceTemplateUrl(CARRIER_SOURCE, this.savedCarrierUrl);
                }
                if (this.cachedUrl) {
                    this.cachedUrl = null;
                    this.clearTileCache();
                }
            });
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

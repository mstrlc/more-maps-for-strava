(function () {
    const { STORAGE_KEYS } = MoreMapsConfig;
    const getApiKey = () => localStorage.getItem(STORAGE_KEYS.MAPY_KEY) || '';
    const getTFKey = () => localStorage.getItem(STORAGE_KEYS.TF_KEY) || '';

    // Config: Use @2x tiles if pixel ratio > 1 for supported layers
    const isRetina = window.devicePixelRatio > 1;
    const retinaTiles = isRetina ? '256@2x' : '256';

    /**
     * Configuration for Mapy.cz sources.
     */
    const MAP_SOURCES = {
        'mapycz-regular': {
            // Basic supports @2x
            url: `https://api.mapy.com/v1/maptiles/basic/${retinaTiles}/{z}/{x}/{y}?apikey=\${API_KEY}`,
            attribution: ''
        },
        'mapycz-outdoor': {
            // Outdoor supports @2x
            url: `https://api.mapy.com/v1/maptiles/outdoor/${retinaTiles}/{z}/{x}/{y}?apikey=\${API_KEY}`,
            attribution: ''
        },
        'mapycz-winter': {
            // Winter does NOT support @2x
            url: `https://api.mapy.com/v1/maptiles/winter/256/{z}/{x}/{y}?apikey=\${API_KEY}`,
            attribution: ''
        },
        'mapycz-satellite': {
            // Aerial does NOT support @2x
            url: `https://api.mapy.com/v1/maptiles/aerial/256/{z}/{x}/{y}?apikey=\${API_KEY}`,
            attribution: ''
        },
        'osm-regular': {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '&copy; OpenStreetMap contributors'
        },
        'osm-cyclosm': {
            url: [
                'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'
            ],
            attribution: '&copy; CyclOSM contributors, OpenStreetMap'
        },
        'osm-cycle': {
            url: [
                'https://a.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=\${API_KEY}',
                'https://b.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=\${API_KEY}',
                'https://c.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=\${API_KEY}'
            ],
            attribution: '&copy; Thunderforest, OpenStreetMap'
        },
        'google-regular': {
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            attribution: '&copy; Google'
        },
        'google-satellite': {
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            attribution: '&copy; Google'
        },
        'google-terrain': {
            url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
            attribution: '&copy; Google'
        },
        'google-hybrid': {
            url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
            attribution: '&copy; Google'
        }
    };

    /**
     * Manages Strava map instances and layer manipulation.
     */
    class MoreMapsManager {
        constructor() {
            this.maps = [];
            this.poller = null;

            // Load persisted visuals or use defaults
            const savedOpacity = localStorage.getItem(STORAGE_KEYS.OPACITY);
            const savedSaturation = localStorage.getItem(STORAGE_KEYS.SATURATION_MAPBOX);

            this.visuals = {
                grayscale: false,
                opacity: savedOpacity !== null ? parseFloat(savedOpacity) : 1,
                saturation: savedSaturation !== null ? parseFloat(savedSaturation) : 0
            };
            this.currentMapType = 'strava-default';
        }

        /**
         * Start the manager.
         */
        start() {
            // Listen for internal messages from the content script
            window.addEventListener('message', this.handleMessage.bind(this));

            // Poll for new map instances
            this.poller = setInterval(() => this.findMaps(), 2000);

            // Initial scan
            this.findMaps();
        }

        /**
         * Handle incoming map switch (and modification) requests.
         */
        handleMessage(event) {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'MOREMAPS_MAP_SWITCH') {
                const { mapType } = event.data;
                this.currentMapType = mapType;
                this.findMaps(); // Ensure we have latest maps
                this.maps.forEach(map => this.applyMapStyle(map, mapType));
            } else if (event.data.type === 'MOREMAPS_MAP_MOD_GRAYSCALE') {
                this.visuals.grayscale = event.data.value;
                this.updateAllVisuals();
            } else if (event.data.type === 'MOREMAPS_MAP_MOD_OPACITY') {
                this.visuals.opacity = event.data.value;
                this.updateAllVisuals();
            } else if (event.data.type === 'MOREMAPS_MAP_MOD_SATURATION') {
                this.visuals.saturation = event.data.value;
                this.updateAllVisuals();
            } else if (event.data.type === 'MOREMAPS_PANORAMA_TOGGLE') {
                this.handlePanoramaToggle(event.data.active);
            } else if (event.data.type === 'MOREMAPS_API_KEY_UPDATED') {
                // Key changed, refresh active layer
                if (this.currentMapType !== 'strava-default') {
                    this.findMaps();
                    this.maps.forEach(map => this.applyMapStyle(map, this.currentMapType));
                }
            }
        }

        /**
         * Apply the selected map style to a map instance.
         */
        applyMapStyle(map, mapType) {
            try {
                // Clean up existing custom layers
                if (map.getLayer('mapycz-layer')) map.removeLayer('mapycz-layer');
                if (map.getSource('mapycz-source')) map.removeSource('mapycz-source');

                // Handle Reset
                if (mapType === 'strava-default') {
                    this.setStravaVisibility(map, true);
                    return;
                }

                // Handle Mapy.cz types
                const config = MAP_SOURCES[mapType];
                if (!config) return;

                console.log('More Maps: Switching to', mapType);

                // Hide Strava's composite layers (buildings, roads, labels)
                this.setStravaVisibility(map, false);

                // Add Custom Source
                const apiKey = mapType.startsWith('osm-cycle') ? getTFKey() : getApiKey();
                const rawTiles = Array.isArray(config.url) ? config.url : [config.url];
                const finalTiles = rawTiles.map(t => t.replace('${API_KEY}', apiKey));

                map.addSource('mapycz-source', {
                    'type': 'raster',
                    'tiles': finalTiles,
                    'tileSize': 256,
                    'attribution': config.attribution
                });

                // Add Mapy.cz Layer
                const beforeId = this.findInsertionPoint(map);
                map.addLayer({
                    'id': 'mapycz-layer',
                    'type': 'raster',
                    'source': 'mapycz-source',
                    'paint': {
                        'raster-opacity': parseFloat(this.visuals.opacity),
                        'raster-saturation': this.visuals.grayscale ? -1 : parseFloat(this.visuals.saturation)
                    }
                }, beforeId);

            } catch (e) {
                console.error('More Maps: Error applying layer', e);
            }
        }

        updateAllVisuals() {
            this.maps.forEach(map => {
                if (map.getLayer('mapycz-layer')) {
                    map.setPaintProperty('mapycz-layer', 'raster-opacity', parseFloat(this.visuals.opacity));
                    map.setPaintProperty('mapycz-layer', 'raster-saturation', this.visuals.grayscale ? -1 : parseFloat(this.visuals.saturation));
                }
            });
        }

        /**
         * Handle panorama mode toggle
         */
        handlePanoramaToggle(active) {


            // Ensure we have the latest maps
            this.findMaps();

            // Get the first map instance (usually there's only one)
            const map = this.maps[0];

            if (!map) {
                console.warn('No map instance found for panorama');
                return;
            }

            // Wait for panorama module to load if needed
            const tryToggle = (attempts = 0) => {
                if (typeof window.MoreMapsPanorama !== 'undefined') {

                    if (active) {
                        window.MoreMapsPanorama.enable(map);
                    } else {
                        window.MoreMapsPanorama.disable(map);
                    }
                } else if (attempts < 20) {
                    // Retry after a short delay (increased to 20 attempts)
                    if (attempts === 0) {
                        console.log('Waiting for panorama module to load...');
                    }
                    setTimeout(() => tryToggle(attempts + 1), 200);
                } else {
                    console.error('Panorama module failed to load. window.MoreMapsPanorama is:', typeof window.MoreMapsPanorama);
                    console.error('Available window properties:', Object.keys(window).filter(k => k.includes('Strava')));
                }
            };

            tryToggle();
        }

        /**
         * Toggle visibility of Strava's base vector layers.
         */
        setStravaVisibility(map, visible) {
            const style = map.getStyle();
            if (!style || !style.layers) return;

            style.layers.forEach(layer => {
                // We want to hide the BASE map (Strava's map) but KEEP the overlays (Heatmap, Routes, etc.)
                // Previously we only checked for source === 'composite'.
                // Now we strictly hide everything unless it matches our "keep" keywords.

                const id = layer.id.toLowerCase();
                const isMapyCz = id === 'mapycz-layer';

                // Keywords that definitely indicate it's NOT a base map layer
                const hasOverlayKeyword = id.includes('heat') ||
                    id.includes('route') ||
                    id.includes('segment') ||
                    id.includes('marker') ||
                    id.includes('selected') ||
                    id.includes('polyline') ||
                    id.includes('waypoint') ||
                    id.includes('direction') ||
                    id.includes('builder') ||
                    id.includes('active') ||
                    id.includes('draw') ||
                    id.includes('origin') ||
                    id.includes('destination') ||
                    id.includes('ghost') ||
                    id.includes('personal');

                // Keywords that indicate it's a BASE map layer (even if it matches keywords above)
                const isBaseMapKeyword = id.includes('surface') ||
                    id.includes('road') ||
                    id.includes('bridge') ||
                    id.includes('tunnel') ||
                    id.includes('admin') ||
                    id.includes('boundary') ||
                    id.includes('water') ||
                    id.includes('land') ||
                    id.includes('building');

                const isOverlay = hasOverlayKeyword && !isBaseMapKeyword;

                if (!isMapyCz && !isOverlay) {
                    map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
                }
            });
        }

        /**
         * Find the optimal layer ID to insert our raster tiles before.
         * We want to be below heatmaps, routes, markers, etc.
         */
        findInsertionPoint(map) {
            const style = map.getStyle();
            if (!style || !style.layers) return undefined;

            for (const layer of style.layers) {
                const id = layer.id.toLowerCase();

                const hasOverlayKeyword = id.includes('heat') ||
                    id.includes('route') ||
                    id.includes('segment') ||
                    id.includes('marker') ||
                    id.includes('selected') ||
                    id.includes('polyline') ||
                    id.includes('waypoint') ||
                    id.includes('direction') ||
                    id.includes('active') ||
                    id.includes('draw') ||
                    id.includes('origin') ||
                    id.includes('destination') ||
                    id.includes('suggested') ||
                    id.includes('editor') ||
                    id.includes('ghost');

                const isBaseMapKeyword = id.includes('surface') ||
                    id.includes('road') ||
                    id.includes('bridge') ||
                    id.includes('tunnel') ||
                    id.includes('admin') ||
                    id.includes('boundary');

                const isOverlay = (hasOverlayKeyword && !isBaseMapKeyword) ||
                    layer.type === 'symbol' ||
                    (layer.source && layer.source !== 'composite' && layer.source !== 'mapbox' && !id.includes('label'));

                if (isOverlay && id !== 'mapycz-layer') {
                    return id;
                }
            }
            return undefined;
        }

        /**
         * Scan the DOM for Mapbox canvases and extract the Map instance via React Fiber.
         */
        findMaps() {
            const canvases = document.querySelectorAll('.mapboxgl-canvas');
            if (canvases.length === 0) return;

            canvases.forEach(canvas => {
                // Traverse up from canvas to find React Fiber
                let domNode = canvas;
                let attempts = 0;
                while (domNode && attempts < 10) {
                    const fiber = this.getReactFiber(domNode);
                    if (fiber) {
                        const map = this.scanFiberForMap(fiber);
                        if (map && !this.maps.includes(map)) {
                            console.log('%cMore Maps: Map CAPTURED!', 'color: green', map);
                            this.maps.push(map);
                        }
                        if (map) return;
                    }
                    domNode = domNode.parentElement;
                    attempts++;
                }
            });
        }

        // --- React Fiber Helpers ---

        getReactFiber(dom) {
            for (const key in dom) {
                if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
                    return dom[key];
                }
            }
            return null;
        }

        /**
         * Heuristically scan a Fiber node for a Mapbox GL Map instance.
         */
        scanFiberForMap(fiber) {
            let curr = fiber;
            let attempts = 0;

            while (curr && attempts < 50) {
                // Check Props
                if (curr.memoizedProps) {
                    const map = this.checkProps(curr.memoizedProps);
                    if (map) return map;
                }

                // Check StateNode
                if (curr.stateNode) {
                    if (this.isMapInstance(curr.stateNode)) return curr.stateNode;
                    // Shallow check of properties on stateNode
                    if (typeof curr.stateNode === 'object') {
                        // Try/Catch for restricted access properties
                        try {
                            for (const key in curr.stateNode) {
                                if (this.isMapInstance(curr.stateNode[key])) return curr.stateNode[key];
                            }
                        } catch (e) { }
                    }
                }

                // Check Hooks (useRef, useState)
                if (curr.memoizedState) {
                    let hook = curr.memoizedState;
                    while (hook) {
                        if (hook.memoizedState) {
                            if (hook.memoizedState.current && this.isMapInstance(hook.memoizedState.current)) return hook.memoizedState.current;
                            if (this.isMapInstance(hook.memoizedState)) return hook.memoizedState;
                        }
                        hook = hook.next;
                    }
                }

                // Check Context
                if (curr.dependencies) {
                    let dep = curr.dependencies.firstContext;
                    while (dep) {
                        if (dep.context && dep.context._currentValue) {
                            const val = dep.context._currentValue;
                            if (this.isMapInstance(val)) return val;
                            if (val && typeof val === 'object' && this.isMapInstance(val.map)) return val.map;
                        }
                        dep = dep.next;
                    }
                }

                curr = curr.return;
                attempts++;
            }
            return null;
        }

        checkProps(props) {
            for (const key in props) {
                const val = props[key];
                if (this.isMapInstance(val)) return val;
                if (val && typeof val === 'object' && this.isMapInstance(val.map)) return val.map;
            }
            return null;
        }

        isMapInstance(obj) {
            return obj &&
                typeof obj.addLayer === 'function' &&
                typeof obj.addSource === 'function' &&
                (typeof obj.getStyle === 'function' || typeof obj.style !== 'undefined');
        }
    }

    // Instantiate and start
    const manager = new MoreMapsManager();
    manager.start();
})();

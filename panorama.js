/**
 * Route Recon for Strava - Panorama Module
 * 
 * Handles Mapy.cz panorama integration with a small corner window.
 * Runs in the page context.
 */

(() => {
    const { STRINGS, STORAGE_KEYS } = RouteReconConfig;

    const state = {
        apiReady: false,
        googleApiReady: false,
        active: false,
        expanded: false,
        window: null,
        panorama: null, // Holds Mapy.cz pano or Google pano
        marker: null,
        map: null,
        ratios: { width: 0.4, height: 0.4 },
        docked: { bottom: true, right: true },
        handleClickBound: null,
        domClickBound: null,
        lastYaw: 0, // Stored in radians
        provider: localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy'
    };

    /**
     * UI Components and Styles
     */
    const PanoramaUI = {
        injectStyles() {
            if (document.getElementById('routerecon-panorama-styles')) return;
            const style = document.createElement('style');
            style.id = 'routerecon-panorama-styles';
            style.textContent = `
                #routerecon-panorama-window {
                    position: fixed; bottom: 20px; right: 20px;
                    width: 600px; height: 450px; min-width: 300px; min-height: 200px;
                    max-width: calc(100vw - 40px); max-height: calc(100vh - 145px);
                    background: #1a1a1a; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                    z-index: 10001; display: flex; flex-direction: column; overflow: hidden;
                }
                #routerecon-panorama-window.error-state { background: rgba(0, 0, 0, 0.2) !important; backdrop-filter: blur(4px); }
                .pano-handle { position: absolute; z-index: 10005; }
                .handle-t { top: 0; left: 0; right: 0; height: 10px; cursor: ns-resize; }
                .handle-l { top: 0; left: 0; bottom: 0; width: 10px; cursor: ew-resize; }
                .handle-tl { top: 0; left: 0; width: 20px; height: 20px; cursor: nwse-resize; z-index: 10006; }
                #routerecon-panorama-close, #routerecon-panorama-switch {
                    position: absolute; top: 12px;
                    background: rgba(255, 255, 255, 0.9); border: none; color: #333;
                    height: 28px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10010; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                    transition: all 0.2s;
                }
                #routerecon-panorama-close { right: 12px; width: 28px; border-radius: 50%; font-size: 24px; }
                #routerecon-panorama-switch { 
                    right: 48px; width: auto; min-width: 28px; padding: 0 10px; 
                    border-radius: 14px; font-size: 11px; font-weight: 800; font-family: sans-serif; 
                }
                #routerecon-panorama-close:hover, #routerecon-panorama-switch:hover { background: white; transform: scale(1.05); }
                #routerecon-panorama-drag-handle {
                    position: absolute; top: 0; left: 0; right: 0; height: 40px; z-index: 10002; cursor: move;
                }
                #routerecon-panorama-content { flex: 1; position: relative; overflow: hidden; }
                #routerecon-panorama-loading {
                    position: absolute; inset: 0; background: #1a1a1a; color: white;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    text-align: center; z-index: 10001;
                }
                #routerecon-panorama-window.error-state #routerecon-panorama-loading { background: transparent; }
                .pano-spinner {
                    width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.3);
                    border-top-color: white; border-radius: 50%; animation: pano-spin 1s linear infinite;
                    margin-bottom: 12px;
                }
                @keyframes pano-spin { to { transform: rotate(360deg); } }
                body.routerecon-panorama-active .mapboxgl-canvas { cursor: crosshair !important; }
                body.routerecon-panorama-active .MapPointerTooltip_mapTooltip__gaOkC,
                body.routerecon-panorama-active .mapboxgl-popup { display: none !important; }
                body.routerecon-panorama-active [class*="RouteBuilder_sidebar"],
                body.routerecon-panorama-active [class*="RouteBuilderSidePanel"] {
                    pointer-events: none !important;
                    opacity: 0.6 !important;
                    filter: grayscale(1) !important;
                    transition: all 0.3s ease;
                }
            `;
            document.head.appendChild(style);
        },

        createWindow(onClose) {
            if (state.window) return state.window;
            const win = document.createElement('div');
            win.id = 'routerecon-panorama-window';

            const handle = document.createElement('div');
            handle.id = 'routerecon-panorama-drag-handle';

            const closeBtn = document.createElement('button');
            closeBtn.id = 'routerecon-panorama-close';
            closeBtn.title = STRINGS.PANORAMA.CLOSE_TOOLTIP;
            closeBtn.textContent = '×';
            closeBtn.onclick = onClose;

            const switchBtn = document.createElement('button');
            switchBtn.id = 'routerecon-panorama-switch';
            switchBtn.title = 'Switch Provider (Mapy.cz / Google)';
            switchBtn.textContent = state.provider === 'mapy' ? 'Mapy.cz' : 'Google';
            switchBtn.onclick = () => {
                const other = state.provider === 'mapy' ? 'google' : 'mapy';
                state.provider = other;
                switchBtn.textContent = other === 'mapy' ? 'Mapy.cz' : 'Google';
                localStorage.setItem(STORAGE_KEYS.PANO_PROVIDER, other);
                window.postMessage({ type: 'ROUTERECON_API_KEY_UPDATED' }, '*');
                if (state.lastPos) PanoramaManager.open(state.lastPos.lon, state.lastPos.lat);
            };

            const content = document.createElement('div');
            content.id = 'routerecon-panorama-content';

            const loading = document.createElement('div');
            loading.id = 'routerecon-panorama-loading';

            const spinner = document.createElement('div');
            spinner.className = 'pano-spinner';

            const loadingText = document.createElement('div');
            loadingText.textContent = STRINGS.PANORAMA.LOADING;

            loading.appendChild(spinner);
            loading.appendChild(loadingText);
            content.appendChild(loading);

            win.appendChild(handle);
            win.appendChild(switchBtn);
            win.appendChild(closeBtn);
            win.appendChild(content);

            document.body.appendChild(win);

            ['t', 'l', 'tl'].forEach(side => {
                const h = document.createElement('div');
                h.className = `pano-handle handle-${side}`;
                win.appendChild(h);
                Resizable.init(win, h, side);
            });

            Draggable.init(win, win.querySelector('#routerecon-panorama-drag-handle'));
            state.window = win;

            // Initialize ratios based on initial size (600x450)
            state.ratios.width = 600 / window.innerWidth;
            state.ratios.height = 450 / window.innerHeight;

            // Initial positioning
            Utils.enforceBounds(win);

            return win;
        },

        showError(msg) {
            const loading = state.window.querySelector('#routerecon-panorama-loading');
            const viewer = state.window.querySelector('#pano-v');
            if (viewer) viewer.style.display = 'none';

            loading.style.display = 'flex';

            // Clear existing loading content
            while (loading.firstChild) loading.removeChild(loading.firstChild);

            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '24px';

            const title = document.createElement('div');
            title.style.cssText = 'font-weight:700; color:#fc4c02; margin-bottom:8px;';
            title.textContent = msg.title || STRINGS.PANORAMA.ERROR_TITLE;

            const text = document.createElement('div');
            text.style.cssText = 'font-size:13px; color:white; font-weight:500;';
            text.textContent = msg.text;

            errorDiv.appendChild(title);
            errorDiv.appendChild(text);

            // Add Switch Button if we can
            const otherProvider = state.provider === 'mapy' ? 'google' : 'mapy';
            const switchBtn = document.createElement('button');
            switchBtn.style.cssText = `
                margin-top: 16px;
                padding: 8px 16px;
                background: #fc4c02;
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
            `;
            switchBtn.textContent = `Try ${otherProvider === 'mapy' ? 'Mapy.cz' : 'Google Street View'}`;
            switchBtn.onclick = () => {
                state.provider = otherProvider;
                localStorage.setItem(STORAGE_KEYS.PANO_PROVIDER, otherProvider);
                window.postMessage({ type: 'ROUTERECON_API_KEY_UPDATED' }, '*');
                // Re-open at same position if possible
                if (state.lastPos) PanoramaManager.open(state.lastPos.lon, state.lastPos.lat);
            };
            errorDiv.appendChild(switchBtn);

            loading.appendChild(errorDiv);

            state.window.classList.add('error-state');
        }
    };

    /**
     * Map Marker Logic
     */
    const PanoramaMarker = {
        create(map, lon, lat, yaw = 0) {
            this.remove();
            const el = document.createElement('div');
            el.style.cssText = 'position:absolute; transform:translate(-50%, -50%); z-index:1; pointer-events:none;';
            const deg = (yaw * 180 / Math.PI);

            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("viewBox", "0 0 32 32");
            svg.setAttribute("width", "32");
            svg.setAttribute("height", "32");
            svg.style.overflow = "visible";

            // Create filter
            const filter = document.createElementNS(svgNS, "filter");
            filter.setAttribute("id", "marker-shadow");
            const dropShadow = document.createElementNS(svgNS, "feDropShadow");
            dropShadow.setAttribute("dx", "0");
            dropShadow.setAttribute("dy", "1.5");
            dropShadow.setAttribute("stdDeviation", "1.5");
            dropShadow.setAttribute("flood-opacity", "0.5");
            filter.appendChild(dropShadow);
            svg.appendChild(filter);

            // Create main group
            const gMain = document.createElementNS(svgNS, "g");
            gMain.setAttribute("transform", "translate(16, 16)");
            gMain.setAttribute("filter", "url(#marker-shadow)");

            // Create rotation group
            const gRot = document.createElementNS(svgNS, "g");
            gRot.className.baseVal = "rot";
            gRot.style.transform = `rotate(${deg}deg)`;
            gRot.style.transition = "transform 0.1s ease-out";

            // Create path
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", "M 0 -15 L 7 -5.6 A 9 9 0 1 1 -7 -5.6 Z");
            path.setAttribute("fill", "#FC4C02");
            path.setAttribute("stroke", "white");
            path.setAttribute("stroke-width", "2.5");
            path.setAttribute("stroke-linejoin", "round");

            gRot.appendChild(path);
            gMain.appendChild(gRot);
            svg.appendChild(gMain);
            el.appendChild(svg);

            const container = map.getCanvasContainer ? map.getCanvasContainer() : (map.getContainer ? map.getContainer() : document.querySelector('.mapboxgl-map'));
            if (container) container.appendChild(el);

            state.marker = { el, map, lon, lat, yaw, lastDeg: deg };
            this.updatePos();

            const handler = () => this.updatePos();
            map.on('move', handler);
            map.on('zoom', handler);
            state.marker.handler = handler;
        },

        updatePos() {
            if (!state.marker) return;
            const pt = state.marker.map.project([state.marker.lon, state.marker.lat]);
            state.marker.el.style.left = pt.x + 'px';
            state.marker.el.style.top = pt.y + 'px';
        },

        updateDir(yaw) {
            if (!state.marker) return;
            state.marker.yaw = yaw;
            let target = (yaw * 180 / Math.PI);
            const cur = state.marker.lastDeg;
            let delta = (target - cur) % 360;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            target = cur + delta;
            state.marker.lastDeg = target;
            state.marker.el.querySelector('.rot').style.transform = `rotate(${target}deg)`;
        },

        remove() {
            if (state.marker) {
                state.marker.el.remove();
                state.marker.map.off('move', state.marker.handler);
                state.marker.map.off('zoom', state.marker.handler);
                state.marker = null;
            }
        }
    };

    /**
     * Window Interaction Utilities
     */
    const Draggable = {
        init(el, handle) {
            let dragging = false, sx, sy, sb, sr;
            handle.onmousedown = (e) => {
                dragging = true; sx = e.clientX; sy = e.clientY;
                const r = el.getBoundingClientRect();
                sb = window.innerHeight - r.bottom;
                sr = window.innerWidth - r.right;
                document.onmousemove = move;
                document.onmouseup = stop;
                e.preventDefault();
            };
            const move = (e) => {
                if (!dragging) return;
                const bOffset = Utils.getBottomOffset();
                let b = sb - (e.clientY - sy);
                let r = sr - (e.clientX - sx);

                if (b <= bOffset + 5) { b = bOffset; state.docked.bottom = true; }
                else state.docked.bottom = false;

                if (r <= 25) { r = 20; state.docked.right = true; }
                else state.docked.right = false;

                el.style.bottom = b + 'px';
                el.style.right = r + 'px';
                Utils.enforceBounds(el);
            };
            const stop = () => { dragging = false; document.onmousemove = null; };
        }
    };

    const Resizable = {
        init(el, handle, side) {
            let resizing = false, sw, sh, sx, sy;
            handle.onmousedown = (e) => {
                resizing = true; sx = e.clientX; sy = e.clientY;
                const r = el.getBoundingClientRect();
                sw = r.width; sh = r.height;
                document.onmousemove = move;
                document.onmouseup = stop;
                e.preventDefault();
            };
            const move = (e) => {
                if (!resizing) return;
                if (side.includes('l')) {
                    const w = sw - (e.clientX - sx);
                    if (w > 300) { el.style.width = w + 'px'; state.ratios.width = w / window.innerWidth; }
                }
                if (side.includes('t')) {
                    const h = sh - (e.clientY - sy);
                    if (h > 200) { el.style.height = h + 'px'; state.ratios.height = h / window.innerHeight; }
                }
                Utils.enforceBounds(el);
            };
            const stop = () => { resizing = false; document.onmousemove = null; };
        }
    };

    const Utils = {
        getBottomOffset() {
            // Strava's bottom bar (route planning, etc.)
            const bar = document.querySelector('[class*="BottomBar_bottomBar"]');
            if (bar && bar.offsetHeight > 0) {
                // If the bar is visible, we want to stay above it
                return bar.offsetHeight + 20;
            }
            return 20; // Default padding from bottom
        },

        enforceBounds(el) {
            if (!el) return;
            const bOffset = this.getBottomOffset();
            const w = window.innerWidth, h = window.innerHeight;

            let tw = Math.max(300, Math.min(w * state.ratios.width, w - 40));
            let th = Math.max(200, Math.min(h * state.ratios.height, h - 145 - bOffset));
            el.style.width = tw + 'px';
            el.style.height = th + 'px';

            if (state.docked.bottom) el.style.bottom = bOffset + 'px';
            if (state.docked.right) el.style.right = '20px';
        }
    };

    /**
     * Main Panorama Controller
     */
    const PanoramaManager = {
        async enable(map) {
            if (state.active && state.map === map) return;
            console.log('Route Recon: Enabling Panorama Mode');
            state.active = true;
            state.map = map;
            document.body.classList.add('routerecon-panorama-active');
            PanoramaUI.injectStyles();

            const canvas = map.getCanvas();
            if (canvas) {
                state.domClickBound = (e) => {
                    if (!state.active) return;
                    // Intercept and stop the click before it reaches Strava's route builder
                    e.stopImmediatePropagation();
                    e.preventDefault();

                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const lngLat = map.unproject([x, y]);

                    console.log('Route Recon: Panorama Click Intercepted');
                    this.open(lngLat.lng, lngLat.lat);
                };
                // Register in CAPTURE phase to be first
                canvas.addEventListener('click', state.domClickBound, true);
            }

            this.setupLayoutObserver();
        },

        disable() {
            if (!state.active) return;
            console.log('Route Recon: Disabling Panorama Mode');
            state.active = false;
            document.body.classList.remove('routerecon-panorama-active');

            const canvas = state.map ? state.map.getCanvas() : null;
            if (canvas && state.domClickBound) {
                canvas.removeEventListener('click', state.domClickBound, true);
                state.domClickBound = null;
            }
        },

        handleMapClick(e) {
            if (!state.active) return;
            if (e.originalEvent) {
                e.originalEvent.stopPropagation();
                e.originalEvent.stopImmediatePropagation();
            }
            this.open(e.lngLat.lng, e.lngLat.lat);
        },

        async open(lon, lat) {
            state.lastPos = { lon, lat };
            const provider = state.provider;

            if (provider === 'google' && !state.googleApiReady) await this.loadGoogleAPI();
            if (provider === 'mapy' && !state.apiReady) await this.loadAPI();

            const win = PanoramaUI.createWindow(() => this.handleUserClose());
            const content = win.querySelector('#routerecon-panorama-content');
            const loading = win.querySelector('#routerecon-panorama-loading');

            loading.style.display = 'flex';
            win.classList.remove('error-state');

            try {
                // Clear existing
                if (state.panorama) {
                    if (state.panorama.destroy) state.panorama.destroy();
                    state.panorama = null;
                }

                let viewer = content.querySelector('#pano-v');
                if (!viewer) {
                    viewer = document.createElement('div');
                    viewer.id = 'pano-v';
                    viewer.style.cssText = 'width:100%; height:100%;';
                    content.appendChild(viewer);
                } else {
                    viewer.style.display = 'block';
                    while (viewer.firstChild) viewer.removeChild(viewer.firstChild);
                }

                if (provider === 'google') {
                    await this.openGoogle(viewer, lon, lat, state.lastYaw || 0);
                } else {
                    await this.openMapy(viewer, lon, lat, state.lastYaw || 0);
                }

                loading.style.display = 'none';
            } catch (e) {
                console.error('Route Recon: Pano Open Error', e);
                PanoramaUI.showError({ title: STRINGS.PANORAMA.ERROR_TITLE, text: e.message });
            }
        },

        async openMapy(viewer, lon, lat, initialYaw = 0) {
            const api = window.Panorama || (window.SMap && window.SMap.Pano);
            if (!api) throw new Error('Mapy.cz Panorama API not found');

            const pano = await api.panoramaFromPosition({
                parent: viewer, lon, lat, radius: 100, lang: 'en', yaw: initialYaw,
                fov: Math.PI / 2, showNavigation: true,
                apiKey: localStorage.getItem(STORAGE_KEYS.MAPY_KEY)
            });

            state.panorama = pano;

            if (pano.errorCode && pano.errorCode !== 'NONE') {
                throw new Error(STRINGS.PANORAMA.NO_PANO_TEXT);
            }

            const cam = pano.getCamera();
            state.lastYaw = cam.yaw;
            state.lastPos = { lon: pano.info.lon, lat: pano.info.lat };
            PanoramaMarker.create(state.map, state.lastPos.lon, state.lastPos.lat, state.lastYaw);

            pano.addListener('pano-view', () => {
                state.lastYaw = pano.getCamera().yaw;
                PanoramaMarker.updateDir(state.lastYaw);
            });
            pano.addListener('pano-place', (p) => {
                if (p.info) {
                    state.lastPos = { lon: p.info.lon, lat: p.info.lat };
                    state.lastYaw = pano.getCamera().yaw;
                    PanoramaMarker.create(state.map, state.lastPos.lon, state.lastPos.lat, state.lastYaw);
                }
            });
        },

        async openGoogle(viewer, lon, lat, initialYaw = 0) {
            if (!window.google || !window.google.maps) throw new Error('Google Maps API not loaded');

            const sv = new google.maps.StreetViewService();
            const location = { lat, lng: lon };

            const result = await new Promise((resolve, reject) => {
                sv.getPanorama({ location, radius: 100 }, (data, status) => {
                    if (status === "OK") resolve(data);
                    else reject(new Error('No Google Street View found here.'));
                });
            });

            const pano = new google.maps.StreetViewPanorama(viewer, {
                position: result.location.latLng,
                pov: { heading: (initialYaw * 180 / Math.PI), pitch: 0 },
                zoom: 1,
                addressControl: false,
                linksControl: true,
                panControl: true,
                enableCloseButton: false,
                fullscreenControl: false
            });

            state.panorama = pano;

            const pos = result.location.latLng;
            state.lastPos = { lon: pos.lng(), lat: pos.lat() };
            state.lastYaw = initialYaw;
            PanoramaMarker.create(state.map, state.lastPos.lon, state.lastPos.lat, state.lastYaw);

            pano.addListener('pov_changed', () => {
                state.lastYaw = pano.getPov().heading * Math.PI / 180;
                PanoramaMarker.updateDir(state.lastYaw);
            });

            pano.addListener('position_changed', () => {
                const p = pano.getPosition();
                state.lastPos = { lon: p.lng(), lat: p.lat() };
                state.lastYaw = pano.getPov().heading * Math.PI / 180;
                PanoramaMarker.create(state.map, state.lastPos.lon, state.lastPos.lat, state.lastYaw);
            });
        },

        // Explicitly called when user clicks 'X'
        handleUserClose() {
            this.disable();
            this.closeWindow();
            window.postMessage({ type: 'ROUTERECON_PANORAMA_TOGGLE', active: false }, '*');
        },

        // Internal cleanup
        closeWindow() {
            if (state.window) { state.window.remove(); state.window = null; }
            if (state.panorama) { state.panorama.destroy(); state.panorama = null; }
            PanoramaMarker.remove();
        },

        close() { this.closeWindow(); }, // For backward compatibility if needed

        loadAPI() {
            if (window.Panorama || (window.SMap && window.SMap.Pano)) {
                state.apiReady = true;
                return Promise.resolve();
            }

            return new Promise((resolve, reject) => {
                const key = localStorage.getItem(STORAGE_KEYS.MAPY_KEY);
                console.log('Route Recon: Loading Panorama API...');
                const s = document.createElement('script');
                s.src = `https://api.mapy.cz/js/panorama/v1/panorama.js${key ? `?apikey=${key}` : ''}`;
                s.onload = () => {
                    const check = (a = 0) => {
                        if (window.Panorama || (window.SMap && window.SMap.Pano)) {
                            state.apiReady = true;
                            console.log('Route Recon: Panorama API Ready');
                            resolve();
                        }
                        else if (a < 50) setTimeout(() => check(a + 1), 100);
                        else reject('API Timeout');
                    };
                    check();
                };
                s.onerror = (e) => {
                    console.error('Route Recon: Failed to load Panorama JS', e);
                    reject(e);
                };
                document.head.appendChild(s);
            });
        },

        loadGoogleAPI() {
            if (state.googleApiReady) return Promise.resolve();

            return new Promise((resolve, reject) => {
                const key = localStorage.getItem(STORAGE_KEYS.GOOGLE_KEY);
                console.log('Route Recon: Loading Google Maps API...');
                const s = document.createElement('script');
                s.src = `https://maps.googleapis.com/maps/api/js?key=${key || ''}`;
                s.onload = () => {
                    const check = (a = 0) => {
                        if (window.google && window.google.maps) {
                            state.googleApiReady = true;
                            console.log('Route Recon: Google Maps API Ready');
                            resolve();
                        }
                        else if (a < 50) setTimeout(() => check(a + 1), 100);
                        else reject('Google API Timeout');
                    };
                    check();
                };
                s.onerror = (e) => {
                    console.error('Route Recon: Failed to load Google Maps JS', e);
                    reject(e);
                };
                document.head.appendChild(s);
            });
        },

        setupLayoutObserver() {
            // Watch for any DOM changes that might indicate the bottom bar appearing/sized
            const observer = new MutationObserver(() => {
                if (state.active && state.window) {
                    Utils.enforceBounds(state.window);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style']
            });

            // Handle window resizing
            window.addEventListener('resize', () => {
                if (state.active && state.window) {
                    Utils.enforceBounds(state.window);
                }
            });

            // Periodically check as a fallback (Strava's React layout changes can be tricky)
            setInterval(() => {
                if (state.active && state.window) {
                    Utils.enforceBounds(state.window);
                }
            }, 2000);
        }
    };

    window.RouteReconPanorama = {
        enable: PanoramaManager.enable.bind(PanoramaManager),
        disable: PanoramaManager.disable.bind(PanoramaManager),
        isActive: () => state.active
    };

    window.addEventListener('message', (e) => {
        if (e.data.type === 'ROUTERECON_API_KEY_UPDATED') {
            const newProvider = localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy';
            if (newProvider !== state.provider) {
                state.provider = newProvider;
                // Sync UI button
                const switchBtn = document.getElementById('routerecon-panorama-switch');
                if (switchBtn) switchBtn.textContent = state.provider === 'mapy' ? 'Mapy.cz' : 'Google';

                // If window is open, try to switch
                if (state.active && state.window && state.lastPos) {
                    PanoramaManager.open(state.lastPos.lon, state.lastPos.lat);
                }
            }
            // Reset ready states to force reload with new keys
            state.apiReady = false;
            state.googleApiReady = false;
        }
    });
})();

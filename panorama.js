/**
 * More Maps for Strava - Panorama Module
 * 
 * Handles Mapy.cz/Google panorama integration via a Sandboxed Iframe.
 * Runs in the page context.
 */

(() => {
    const { STRINGS, STORAGE_KEYS, EXTENSION_URL } = MoreMapsConfig;

    const state = {
        active: false,
        expanded: false,
        window: null,
        iframe: null,
        marker: null,
        map: null,
        ratios: { width: 0.4, height: 0.4 },
        docked: { bottom: true, right: true },
        domClickBound: null,
        lastYaw: 0,
        lastPos: null,
        provider: localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy'
    };

    /**
     * UI Components and Styles
     */
    const PanoramaUI = {
        injectStyles() {
            if (document.getElementById('moremaps-panorama-styles')) return;
            const style = document.createElement('style');
            style.id = 'moremaps-panorama-styles';
            style.textContent = `
                #moremaps-panorama-window {
                    position: fixed; bottom: 20px; right: 20px;
                    width: 600px; height: 450px; min-width: 300px; min-height: 200px;
                    max-width: calc(100vw - 40px); max-height: calc(100vh - 145px);
                    background: #1a1a1a; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                    z-index: 10001; display: flex; flex-direction: column; overflow: hidden;
                }
                .pano-handle { position: absolute; z-index: 10005; }
                .handle-t { top: 0; left: 0; right: 0; height: 10px; cursor: ns-resize; }
                .handle-l { top: 0; left: 0; bottom: 0; width: 10px; cursor: ew-resize; }
                .handle-tl { top: 0; left: 0; width: 20px; height: 20px; cursor: nwse-resize; z-index: 10006; }
                #moremaps-panorama-close { 
                    right: 12px; width: 28px; border-radius: 50%; font-size: 24px;
                    position: absolute; top: 12px;
                    background: rgba(255, 255, 255, 0.5); border: none; color: #333;
                    height: 28px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10010; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                    transition: all 0.2s; backdrop-filter: blur(8px);
                }
                #moremaps-panorama-close:hover { background: white; transform: scale(1.05); }
                #moremaps-panorama-segmented-control {
                    position: absolute; top: 12px; right: 48px;
                    display: flex; gap: 2px; background: rgba(255, 255, 255, 0.5);
                    padding: 3px; border-radius: 18px; z-index: 10010;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                    backdrop-filter: blur(8px);
                }
                .pano-segment {
                    padding: 4px 12px; border-radius: 15px;
                    font-size: 11px; font-weight: 700; color: #666;
                    cursor: pointer; transition: all 0.2s;
                    user-select: none;
                }
                .pano-segment.active {
                    background: #fc4c02; color: white;
                }
                .pano-segment:not(.active):hover {
                    color: #333;
                }
                #moremaps-panorama-drag-handle {
                    position: absolute; top: 0; left: 0; right: 0; height: 40px; z-index: 10002; cursor: move;
                }
                #moremaps-panorama-content { flex: 1; position: relative; overflow: hidden; background: #000; }
                iframe#moremaps-pano-frame { width: 100%; height: 100%; border: none; }
                
                body.moremaps-panorama-active .mapboxgl-canvas { cursor: crosshair !important; }
                body.moremaps-panorama-active .MapPointerTooltip_mapTooltip__gaOkC,
                body.moremaps-panorama-active .mapboxgl-popup { display: none !important; }
                body.moremaps-panorama-active [class*="RouteBuilder_sidebar"],
                body.moremaps-panorama-active [class*="RouteBuilderSidePanel"] {
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
            win.id = 'moremaps-panorama-window';

            const handle = document.createElement('div');
            handle.id = 'moremaps-panorama-drag-handle';

            const closeBtn = document.createElement('button');
            closeBtn.id = 'moremaps-panorama-close';
            closeBtn.title = STRINGS.PANORAMA.CLOSE_TOOLTIP;
            closeBtn.textContent = '×';
            closeBtn.onclick = onClose;

            const segmentedControl = document.createElement('div');
            segmentedControl.id = 'moremaps-panorama-segmented-control';

            const segments = ['mapy', 'google'];
            segments.forEach(p => {
                const seg = document.createElement('div');
                seg.className = `pano-segment ${state.provider === p ? 'active' : ''}`;
                seg.dataset.provider = p;
                seg.textContent = p === 'mapy' ? STRINGS.SETTINGS.PROVIDER_MAPY : 'Google';
                seg.onclick = () => {
                    if (state.provider === p) return;
                    state.provider = p;
                    localStorage.setItem(STORAGE_KEYS.PANO_PROVIDER, p);

                    // Update UI immediately
                    segmentedControl.querySelectorAll('.pano-segment').forEach(s => s.classList.remove('active'));
                    seg.classList.add('active');

                    window.postMessage({ type: 'MOREMAPS_API_KEY_UPDATED' }, '*');
                    if (state.lastPos) PanoramaManager.open(state.lastPos.lon, state.lastPos.lat);
                };
                segmentedControl.appendChild(seg);
            });

            const content = document.createElement('div');
            content.id = 'moremaps-panorama-content';

            // Create Iframe
            const iframe = document.createElement('iframe');
            iframe.id = 'moremaps-pano-frame';

            // Get Extension URL from Config (legacy) or Meta Tag (CSP safe)
            let extUrl = MoreMapsConfig.EXTENSION_URL;
            if (!extUrl) {
                const meta = document.querySelector('meta[name="moremaps-extension-url"]');
                if (meta) extUrl = meta.content;
            }
            extUrl = extUrl || '';

            iframe.src = extUrl + 'panorama.html';
            state.iframe = iframe;

            content.appendChild(iframe);

            win.appendChild(handle);
            win.appendChild(segmentedControl);
            win.appendChild(closeBtn);
            win.appendChild(content);

            document.body.appendChild(win);

            ['t', 'l', 'tl'].forEach(side => {
                const h = document.createElement('div');
                h.className = `pano-handle handle-${side}`;
                win.appendChild(h);
                Resizable.init(win, h, side);
            });

            Draggable.init(win, win.querySelector('#moremaps-panorama-drag-handle'));
            state.window = win;

            // Initialize ratios
            state.ratios.width = 600 / window.innerWidth;
            state.ratios.height = 450 / window.innerHeight;

            Utils.enforceBounds(win);
            return win;
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

            const filter = document.createElementNS(svgNS, "filter");
            filter.setAttribute("id", "marker-shadow");
            const dropShadow = document.createElementNS(svgNS, "feDropShadow");
            dropShadow.setAttribute("dx", "0");
            dropShadow.setAttribute("dy", "1.5");
            dropShadow.setAttribute("stdDeviation", "1.5");
            dropShadow.setAttribute("flood-opacity", "0.5");
            filter.appendChild(dropShadow);
            svg.appendChild(filter);

            const gMain = document.createElementNS(svgNS, "g");
            gMain.setAttribute("transform", "translate(16, 16)");
            gMain.setAttribute("filter", "url(#marker-shadow)");

            const gRot = document.createElementNS(svgNS, "g");
            gRot.className.baseVal = "rot";
            gRot.style.transform = `rotate(${deg}deg)`;
            gRot.style.transition = "transform 0.1s ease-out";

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
            const bar = document.querySelector('[class*="BottomBar_bottomBar"]');
            if (bar && bar.offsetHeight > 0) return bar.offsetHeight + 20;
            return 20;
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
            console.log('More Maps: Enabling Panorama Mode');
            state.active = true;
            state.map = map;
            document.body.classList.add('moremaps-panorama-active');
            PanoramaUI.injectStyles();

            const canvas = map.getCanvas();
            if (canvas) {
                state.domClickBound = (e) => {
                    if (!state.active) return;
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const lngLat = map.unproject([x, y]);
                    this.open(lngLat.lng, lngLat.lat);
                };
                canvas.addEventListener('click', state.domClickBound, true);
            }
            this.setupLayoutObserver();
        },

        disable() {
            if (!state.active) return;
            console.log('More Maps: Disabling Panorama Mode');
            state.active = false;
            document.body.classList.remove('moremaps-panorama-active');

            const canvas = state.map ? state.map.getCanvas() : null;
            if (canvas && state.domClickBound) {
                canvas.removeEventListener('click', state.domClickBound, true);
                state.domClickBound = null;
            }
        },

        open(lon, lat) {
            const provider = state.provider;
            const key = provider === 'mapy' ? localStorage.getItem(STORAGE_KEYS.MAPY_KEY) : localStorage.getItem(STORAGE_KEYS.GOOGLE_KEY);

            if (!key) {
                window.postMessage({
                    type: 'MOREMAPS_OPEN_SETTINGS',
                    instructions: true,
                    highlightKey: provider === 'mapy' ? STORAGE_KEYS.MAPY_KEY : STORAGE_KEYS.GOOGLE_KEY
                }, '*');
                this.handleUserClose();
                return;
            }

            state.lastPos = { lon, lat };
            PanoramaUI.createWindow(() => this.handleUserClose());

            // Wait for iframe to be ready?
            // We can just post message, if it's not ready it might miss it.
            // Better to use onload or retry.
            // Since it's a local file, it should load fast.
            // Using a loop to ensure frame is there.

            const attemptPost = (tries = 0) => {
                if (state.iframe && state.iframe.contentWindow) {
                    state.iframe.contentWindow.postMessage({
                        type: 'INIT_PANO',
                        provider,
                        apiKey: key,
                        lon,
                        lat,
                        yaw: state.lastYaw
                    }, '*');
                } else if (tries < 10) {
                    setTimeout(() => attemptPost(tries + 1), 200);
                }
            };

            // If iframe was just created, wait a bit
            setTimeout(() => attemptPost(), 200);

            if (state.active && state.map) {
                PanoramaMarker.create(state.map, lon, lat, state.lastYaw);
            }
        },

        handleUserClose() {
            this.disable();
            this.closeWindow();
            window.postMessage({ type: 'MOREMAPS_PANORAMA_TOGGLE', active: false }, '*');
        },

        closeWindow() {
            if (state.window) { state.window.remove(); state.window = null; state.iframe = null; }
            PanoramaMarker.remove();
        },

        setupLayoutObserver() {
            const observer = new MutationObserver(() => {
                if (state.active && state.window) Utils.enforceBounds(state.window);
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
            window.addEventListener('resize', () => {
                if (state.active && state.window) Utils.enforceBounds(state.window);
            });
            setInterval(() => {
                if (state.active && state.window) Utils.enforceBounds(state.window);
            }, 2000);
        }
    };

    window.MoreMapsPanorama = {
        enable: PanoramaManager.enable.bind(PanoramaManager),
        disable: PanoramaManager.disable.bind(PanoramaManager),
        isActive: () => state.active
    };

    window.addEventListener('message', (event) => {
        if (!event.data) return;

        if (event.data.type === 'MOREMAPS_API_KEY_UPDATED') {
            const newProvider = localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy';
            state.provider = newProvider;
            const ctrl = document.getElementById('moremaps-panorama-segmented-control');
            if (ctrl) {
                ctrl.querySelectorAll('.pano-segment').forEach(seg => {
                    seg.classList.toggle('active', seg.dataset.provider === newProvider);
                });
            }
            if (state.active && state.lastPos) {
                PanoramaManager.open(state.lastPos.lon, state.lastPos.lat);
            }
        }
        else if (event.data.type === 'PANO_YAW') {
            state.lastYaw = event.data.yaw;
            PanoramaMarker.updateDir(state.lastYaw);
        }
        else if (event.data.type === 'PANO_POS') {
            state.lastPos = { lon: event.data.lon, lat: event.data.lat };
            if (state.active && state.map) {
                PanoramaMarker.create(state.map, state.lastPos.lon, state.lastPos.lat, state.lastYaw);
            }
        }
    });
})();

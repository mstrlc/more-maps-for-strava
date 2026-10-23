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
    // cachedUrl marker: the carrier cache holds Strava's own winter tiles.
    const STRAVA_CARRIER_TILES = 'strava-winter';
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
        },
        // Not a real server: renderZwiftTile() draws these tiles (see below).
        'zwift-worlds': {
            url: 'https://zwift.moremaps.invalid/{z}/{x}/{y}.png'
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
    // We only hear about loads that start after our listener is attached, so a
    // new engine counts as loading until its first tile event.
    // That listener only reports edges, and a freshly captured engine is
    // usually mid-load: it can stay silent for 10s+ and then send a lone
    // 'loaded'. Silence alone isn't idleness, so until the first event we also
    // require the engine's tile requests to have been quiet this long.
    const UNKNOWN_STATE_IDLE_MS = 3000;
    // Last resort so a load that never reports back can't block switching forever.
    const STUCK_LOADING_IDLE_MS = 15000;

    // Slider drags fire many updates; only refresh the tiles once they settle.
    const FILTER_DEBOUNCE_MS = 250;
    // Original (unrecoloured) provider tiles kept in memory, so a slider change
    // re-recolours what we already have instead of downloading it again.
    // 256px tiles are ~10-50 KB, so this holds several screens' worth.
    const TILE_CACHE_MAX_BYTES = 64 * 1024 * 1024;

    // --- Tile recolouring (brightness / saturation sliders) ---
    //
    // The engine has no opacity/filter knob for the carrier raster, and a CSS
    // filter on the canvas would dim Strava's heatmap along with the base map.
    // But the engine downloads raster tiles with plain main-thread XHRs
    // (responseType 'arraybuffer'), so for our provider's tiles we fetch the
    // image ourselves, recolour it, and re-open the same XHR on a blob: URL of
    // the result. The engine still sees an ordinary request lifecycle, and
    // Strava's own tiles (vector base, heatmap) pass through untouched.
    //
    // Provider tiles go through this path even with neutral settings, so the
    // originals are already in memory by the time the user first moves a slider.

    // Least-recently-used cache of original tile blobs, keyed by URL. Concurrent
    // requests for the same tile share one download.
    class TileCache {
        constructor(maxBytes) {
            this.maxBytes = maxBytes;
            this.bytes = 0;
            this.blobs = new Map();    // url -> Blob, oldest first
            this.inFlight = new Map(); // url -> Promise<Blob>
        }

        get(url) {
            const hit = this.blobs.get(url);
            if (hit) {
                this.blobs.delete(url);
                this.blobs.set(url, hit); // mark as most recently used
                return Promise.resolve(hit);
            }
            let pending = this.inFlight.get(url);
            if (!pending) {
                pending = this.download(url).finally(() => this.inFlight.delete(url));
                this.inFlight.set(url, pending);
            }
            return pending;
        }

        async download(url) {
            // Errors aren't cached.
            const blob = ZWIFT_TILE_RE.test(url) ? await renderZwiftTile(url) : await fetchBlob(url);
            this.blobs.set(url, blob);
            this.bytes += blob.size;
            for (const [oldUrl, old] of this.blobs) {
                if (this.bytes <= this.maxBytes) break;
                this.blobs.delete(oldUrl);
                this.bytes -= old.size;
            }
            return blob;
        }
    }

    async function fetchBlob(url) {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    }

    const tileCache = new TileCache(TILE_CACHE_MAX_BYTES);

    // --- Zwift worlds ---
    //
    // Zwift publishes each world as one big minimap image, not as tiles. Like
    // zwiftmap.com (a Leaflet image overlay), we stretch it over the world's
    // real-world bounds in Web Mercator, and cut our own 256px tiles from it:
    // the carrier template points at a fake host, and the tile interceptor
    // renders those URLs here instead of downloading them. OpenStreetMap goes
    // underneath, so the surroundings still show. A world's image is only
    // downloaded once a tile shows it at a useful size.
    const ZWIFT_TILE_RE = /^https:\/\/zwift\.moremaps\.invalid\/(\d+)\/(\d+)\/(\d+)\.png$/;
    const ZWIFT_BASE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const ZWIFT_IMAGE_TIMEOUT_MS = 30000;
    // Worlds narrower than this on a tile are skipped: a few pixels of island
    // isn't worth downloading a multi-megabyte image for.
    const ZWIFT_MIN_DRAW_PX = 8;
    const TILE_SIZE = 256;
    // Screen margin (px) around a world when centring on it.
    const ZWIFT_FLY_PADDING = { top: 40, right: 40, bottom: 40, left: 40 };

    // Web Mercator, normalised to 0..1 across the world.
    const mercX = (lon) => (lon + 180) / 360;
    const mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;

    // world -> Promise<{ levels: ImageBitmap[] }>. levels[0] is full size, each
    // next one half the previous: drawing the 8192px image straight into a few
    // pixels at low zoom would alias badly.
    const zwiftImages = new Map();

    function loadZwiftImage(world) {
        let pending = zwiftImages.get(world);
        if (pending) return pending;
        pending = new Promise((resolve, reject) => {
            const timer = setTimeout(() => done({ error: 'Timed out' }), ZWIFT_IMAGE_TIMEOUT_MS);
            const onMessage = (e) => {
                if (e.source !== window || !e.data || e.data.type !== 'MOREMAPS_ZWIFT_IMAGE' || e.data.world !== world) return;
                done(e.data);
            };
            const done = (msg) => {
                clearTimeout(timer);
                window.removeEventListener('message', onMessage);
                if (msg.error) { reject(new Error(msg.error)); return; }
                const binary = atob(msg.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                createImageBitmap(new Blob([bytes], { type: 'image/png' }))
                    .then(full => ({ levels: [full] }))
                    .then(resolve, reject);
            };
            window.addEventListener('message', onMessage);
            window.postMessage({ type: 'MOREMAPS_ZWIFT_IMAGE_REQUEST', world }, '*');
        });
        // Let a failed load (e.g. no permission yet) be retried later.
        pending.catch(() => zwiftImages.delete(world));
        zwiftImages.set(world, pending);
        return pending;
    }

    // The smallest pyramid level that still has at least as many pixels as
    // we're drawing, built on demand.
    async function zwiftLevel(image, srcPerDest) {
        let level = 0;
        while (srcPerDest >= 2 ** (level + 1)) level++;
        for (let i = 1; i <= level; i++) {
            if (!image.levels[i]) {
                const prev = await image.levels[i - 1];
                image.levels[i] = createImageBitmap(prev, {
                    resizeWidth: Math.max(1, prev.width >> 1),
                    resizeHeight: Math.max(1, prev.height >> 1),
                    resizeQuality: 'high'
                });
            }
        }
        const bitmap = await image.levels[level];
        image.levels[level] = bitmap;
        return bitmap;
    }

    // Where a world's whole image lands, in the pixels of tile (z, x, y).
    function zwiftPlacement(bounds, z, x, y) {
        const scale = TILE_SIZE * 2 ** z;
        const [[north, west], [south, east]] = bounds;
        return {
            left: mercX(west) * scale - x * TILE_SIZE,
            right: mercX(east) * scale - x * TILE_SIZE,
            top: mercY(north) * scale - y * TILE_SIZE,
            bottom: mercY(south) * scale - y * TILE_SIZE
        };
    }

    async function drawZwiftWorld(ctx, image, p) {
        // Only the part that overlaps the tile.
        const dl = Math.max(p.left, 0), dr = Math.min(p.right, TILE_SIZE);
        const dt = Math.max(p.top, 0), db = Math.min(p.bottom, TILE_SIZE);
        const width = p.right - p.left, height = p.bottom - p.top;
        const bitmap = await zwiftLevel(image, image.levels[0].width / width);
        const kx = bitmap.width / width, ky = bitmap.height / height;
        ctx.drawImage(bitmap,
            (dl - p.left) * kx, (dt - p.top) * ky, (dr - dl) * kx, (db - dt) * ky,
            dl, dt, dr - dl, db - dt);
    }

    async function renderZwiftTile(url) {
        const [z, x, y] = url.match(ZWIFT_TILE_RE).slice(1).map(Number);
        const worlds = MoreMapsConfig.ZWIFT_WORLDS
            .map(world => ({ world, p: zwiftPlacement(world.bounds, z, x, y) }))
            .filter(({ p }) => p.right > 0 && p.left < TILE_SIZE && p.bottom > 0 && p.top < TILE_SIZE &&
                p.right - p.left >= ZWIFT_MIN_DRAW_PX);
        const baseUrl = ZWIFT_BASE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        const [baseBlob, ...images] = await Promise.all([
            fetchBlob(baseUrl).catch(() => null),
            ...worlds.map(({ world }) => loadZwiftImage(world.id).catch((e) => {
                console.warn(`More Maps: Zwift image for ${world.name} unavailable`, e.message);
                return null;
            }))
        ]);
        if (!images.some(Boolean)) {
            // Nothing of Zwift's to draw here: the plain OpenStreetMap tile.
            if (!baseBlob) throw new Error('No Zwift tile content');
            return baseBlob;
        }
        const base = baseBlob && await createImageBitmap(baseBlob).catch(() => null);

        const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        if (base) { ctx.drawImage(base, 0, 0, TILE_SIZE, TILE_SIZE); base.close(); }
        for (let i = 0; i < worlds.length; i++) {
            if (images[i]) await drawZwiftWorld(ctx, images[i], worlds[i].p);
        }
        return canvas.convertToBlob({ type: 'image/png' });
    }

    /**
     * Recolour RGBA pixel data in place.
     * @param {Uint8ClampedArray} data  RGBA bytes, 4 per pixel
     * @param {number} brightness -1 = black, 0 = unchanged, 1 = white
     * @param {number} saturation 0 = greyscale, 1 = unchanged, >1 = more vivid
     */
    function adjustPixels(data, brightness, saturation) {
        // Saturation pushes each channel away from (or toward) the pixel's
        // Rec. 709 luma; brightness then blends the result toward black or
        // white: c * scale + lift, with lift = 0 when darkening.
        // Uint8ClampedArray clamps over-saturated values to 0..255.
        const scale = 1 - Math.abs(brightness);
        const lift = brightness > 0 ? 255 * brightness : 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            data[i] = (l + (r - l) * saturation) * scale + lift;
            data[i + 1] = (l + (g - l) * saturation) * scale + lift;
            data[i + 2] = (l + (b - l) * saturation) * scale + lift;
        }
    }

    // Decode → recolour → re-encode one tile image. Self-contained (it only
    // uses adjustPixels), because its source is also loaded into the workers.
    async function recolourBlob(blob, brightness, saturation) {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        adjustPixels(img.data, brightness, saturation);
        ctx.putImageData(img, 0, 0);
        return canvas.convertToBlob({ type: 'image/png' });
    }

    // A screenful is ~100 tiles. Recoloured on the main thread, every async
    // step queues behind the engine's rendering, which took tiles seconds to
    // arrive. A small worker pool does it off-thread; if workers can't start
    // (or die), tiles fall back to the main thread.
    function createRecolourer() {
        const pending = new Map(); // id -> { args, resolve, reject }
        let workers = [];
        let nextId = 0;
        const onMainThread = (p) => recolourBlob(...p.args).then(p.resolve, p.reject);
        const fail = () => {
            workers.forEach(w => w.terminate());
            workers = [];
            pending.forEach(onMainThread);
            pending.clear();
        };
        try {
            const src = `${adjustPixels}\n${recolourBlob}\n` +
                'self.onmessage = async (e) => {\n' +
                '    const { id, args } = e.data;\n' +
                '    try { self.postMessage({ id, blob: await recolourBlob(...args) }); }\n' +
                '    catch (err) { self.postMessage({ id, error: String(err) }); }\n' +
                '};';
            const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
            const count = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) >> 1));
            for (let i = 0; i < count; i++) {
                const worker = new Worker(url);
                worker.onmessage = (e) => {
                    const p = pending.get(e.data.id);
                    if (!p) return;
                    pending.delete(e.data.id);
                    if (e.data.error) p.reject(new Error(e.data.error));
                    else p.resolve(e.data.blob);
                };
                worker.onerror = fail;
                workers.push(worker);
            }
        } catch (e) {
            fail();
        }
        return (...args) => new Promise((resolve, reject) => {
            const p = { args, resolve, reject };
            if (!workers.length) { onMainThread(p); return; }
            const id = nextId++;
            pending.set(id, p);
            workers[id % workers.length].postMessage({ id, args });
        });
    }

    const recolour = createRecolourer();

    async function recolourTile(url, filter) {
        const original = await tileCache.get(url);
        if (MoreMapsConfig.isNeutralTileFilter(filter)) return URL.createObjectURL(original);
        const blob = await recolour(original, filter.brightness / 100, filter.saturation / 100);
        return URL.createObjectURL(blob);
    }

    // The engine's tile requests (arraybuffer XHRs) as the engine sees them:
    // from its send() — before any recolouring delay — until loadend.
    const tileRequests = { inFlight: 0, lastActivity: 0 };

    // filterFor(url) returns the filter to apply to that request, or null to
    // let it through untouched.
    function installTileInterceptor(filterFor) {
        const proto = XMLHttpRequest.prototype;
        const { open, send, setRequestHeader, abort } = proto;

        proto.open = function () {
            this._mm = { args: Array.from(arguments), headers: [], pending: false };
            return open.apply(this, arguments);
        };
        proto.setRequestHeader = function (name, value) {
            if (this._mm) this._mm.headers.push([name, value]);
            return setRequestHeader.apply(this, arguments);
        };
        proto.abort = function () {
            const mm = this._mm;
            // Aborting a request that was never really sent fires no events;
            // send it so the engine gets the abort/loadend it expects.
            if (mm && mm.pending) { mm.pending = false; send.call(this, mm.body); }
            return abort.apply(this, arguments);
        };
        proto.send = function (body) {
            if (this.responseType === 'arraybuffer') {
                tileRequests.inFlight++;
                tileRequests.lastActivity = Date.now();
                this.addEventListener('loadend', () => {
                    tileRequests.inFlight = Math.max(0, tileRequests.inFlight - 1);
                    tileRequests.lastActivity = Date.now();
                }, { once: true });
            }
            const mm = this._mm;
            const url = mm && String(mm.args[1]);
            const filter = mm && filterFor(url);
            if (!filter) return send.apply(this, arguments);

            mm.pending = true;
            mm.body = body;
            const sendTo = (target) => {
                if (!mm.pending || this._mm !== mm) return false; // aborted or reused
                mm.pending = false;
                const args = mm.args.slice();
                args[1] = target;
                open.apply(this, args);
                mm.headers.forEach(h => setRequestHeader.apply(this, h));
                send.call(this, body);
                return true;
            };
            recolourTile(url, filter).then(
                (blobUrl) => {
                    if (sendTo(blobUrl)) this.addEventListener('loadend', () => URL.revokeObjectURL(blobUrl), { once: true });
                    else URL.revokeObjectURL(blobUrl);
                },
                // Fall back to the original request, so errors (404s, a bad API
                // key) reach the engine exactly as before.
                () => sendTo(url)
            );
        };
    }

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
            this.tileStateKnown = false;   // seen a tile event since attaching?
            this.lastTileEvent = 0;
            this.idleQueue = [];           // engine calls waiting for tile loading to settle
            this.idleTimer = null;
            this.coverObserver = null;     // hides the canvas until the favorite is applied
            this.pendingApply = null;      // engine we're waiting on before applying
            this.tileFilter = null;        // brightness/saturation, null when neutral
            this.filterTimer = null;
            this.refreshQueued = false;    // a filter refresh is waiting for idle
        }

        start() {
            this.setTileFilter(MoreMapsConfig.getTileFilter(), false);
            installTileInterceptor((url) => this.filterFor(url));
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
        // type Strava started it with (the carrier only if that's Winter, in
        // which case the carrier cache already holds Strava's winter tiles).
        attachEngine(engine) {
            this.carrierActive = this.stravaStyle() === 'winter';
            this.cachedUrl = this.carrierActive ? STRAVA_CARRIER_TILES : null;
            this.tilesLoading = true; // until told otherwise, see UNKNOWN_STATE_IDLE_MS
            this.tileStateKnown = false;
            this.lastTileEvent = Date.now();
            this.idleQueue = [];
            this.refreshQueued = false; // a queued refresh died with the old engine
            const onEvent = (loading) => {
                if (this.engine !== engine) return;
                this.tilesLoading = loading;
                this.tileStateKnown = true;
                this.lastTileEvent = Date.now();
            };
            try {
                engine.addTileLoadingListener({
                    onTilesLoadingStarted: () => onEvent(true),
                    onTilesLoaded: () => onEvent(false)
                });
            } catch (e) {
                this.tilesLoading = false; // no events: tilesIdle falls back to the quiet period
            }
            this.guardCustomStyle(engine);
        }

        // Strava never calls switchToCustomStyle, but other extensions do:
        // Squadrats wraps setMapType and, 150ms after every call (ours
        // included), swaps in Strava's Topo vector style with its grid spliced
        // in. That replaces the carrier, so our map vanishes right after it
        // loads. Ignore such switches while one of our maps is shown; once the
        // user is back on a Strava map they go through again.
        guardCustomStyle(engine) {
            const original = engine.switchToCustomStyle;
            if (typeof original !== 'function' || original.mmGuarded) return;
            const guarded = (...args) => {
                if (this.engine === engine && this.desiredUrl) {
                    console.log('More Maps: ignored a custom style switch while a More Maps layer is active');
                    return;
                }
                return original.apply(engine, args);
            };
            guarded.mmGuarded = true;
            engine.switchToCustomStyle = guarded;
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
                if (!this.tilesIdle()) return;
                clearInterval(this.idleTimer);
                this.idleTimer = null;
                const queue = this.idleQueue;
                this.idleQueue = [];
                queue.forEach(f => { try { f(); } catch (e) { console.error('More Maps:', e); } });
            }, IDLE_POLL_MS);
        }

        tilesIdle() {
            const now = Date.now();
            const silent = now - this.lastTileEvent;
            if (silent >= STUCK_LOADING_IDLE_MS) return true;
            if (this.tileStateKnown) return !this.tilesLoading && silent >= IDLE_QUIET_MS;
            // State unknown (see UNKNOWN_STATE_IDLE_MS): no events, no tile
            // requests and no terrain downloads for a while.
            return silent >= UNKNOWN_STATE_IDLE_MS &&
                tileRequests.inFlight === 0 &&
                now - tileRequests.lastActivity >= UNKNOWN_STATE_IDLE_MS &&
                !this.terrainDownloading();
        }

        terrainDownloading() {
            try {
                return !!JSON.parse(this.engine.getDebugApi().dumpEngineState()).terrain.areTilesBeingDownloaded;
            } catch (e) {
                return false;
            }
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
            } else if (data.type === 'MOREMAPS_TILE_FILTER') {
                this.setTileFilter(data.filter, true);
            } else if (data.type === 'MOREMAPS_ZWIFT_FLY') {
                this.flyToZwiftWorld(data.world);
            }
        }

        // Centre the camera on a Zwift world, framing its whole image. Camera
        // moves are safe at any time (Strava's own search does the same), so this
        // doesn't wait for tiles to settle. Instant: the jump is often halfway
        // around the globe, and an animation that short is just a flicker.
        flyToZwiftWorld(id) {
            const world = MoreMapsConfig.ZWIFT_WORLDS.find(w => w.id === id);
            this.findEngine(true);
            if (!world || !this.isEngine(this.engine)) return;
            const [[north, west], [south, east]] = world.bounds;
            try {
                this.engine.getCamera().flyToBounds(
                    { southWestCorner: { latitude: south, longitude: west }, northEastCorner: { latitude: north, longitude: east } },
                    0, 0, 0, ZWIFT_FLY_PADDING, undefined);
            } catch (e) {
                console.error('More Maps: error flying to Zwift world', e);
            }
        }

        // --- Brightness / saturation ---

        // Only tiles from the provider currently on the carrier go through the
        // recolouring path (and its cache); everything else is left alone.
        filterFor(url) {
            if (!this.desiredUrl || !url.startsWith(this.desiredUrl.split('{')[0])) return null;
            return this.tileFilter || MoreMapsConfig.TILE_FILTER_DEFAULTS;
        }

        setTileFilter(filter, refresh) {
            const next = MoreMapsConfig.isNeutralTileFilter(filter) ? null : filter;
            if (JSON.stringify(next) === JSON.stringify(this.tileFilter)) return;
            this.tileFilter = next;
            if (!refresh) return;
            // Tiles already in the engine's cache keep their old colours: drop
            // them (once loading is quiet, see whenTilesIdle) so they refetch.
            clearTimeout(this.filterTimer);
            // At most one refresh is queued: back-to-back clears would land
            // while the first clear's reloads are in flight (the crash case).
            // Tiles fetched after a change already use the new filter, so a
            // single refresh once loading settles catches every change.
            this.filterTimer = setTimeout(() => {
                if (this.refreshQueued || !this.desiredUrl || !this.isEngine(this.engine)) return;
                this.refreshQueued = true;
                this.whenTilesIdle(() => {
                    this.refreshQueued = false;
                    if (this.desiredUrl) this.clearTileCache();
                });
            }, FILTER_DEBOUNCE_MS);
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
                    this.setStravaBaseShown(false);
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

        // The carrier map type is a hybrid: Strava draws its own vector roads,
        // railways and paths over the raster. Over Mapy/OSM they roughly line up,
        // but over Zwift's worlds (and satellite) they're stray lines, so hide
        // them while one of our maps is shown. The heatmap is unaffected.
        setStravaBaseShown(show) {
            try { this.engine.getContent().getOsmFilter().setShow(show); } catch (e) {}
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
                this.setStravaBaseShown(true);
                const tsApi = this.getTileSourcesApi();
                if (tsApi && this.savedCarrierUrl) {
                    tsApi.setTileSourceTemplateUrl(CARRIER_SOURCE, this.savedCarrierUrl);
                }
                if (this.cachedUrl) this.clearTileCache();
                // On Winter, Strava's own tiles now fill the carrier cache.
                this.cachedUrl = this.carrierActive ? STRAVA_CARRIER_TILES : null;
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

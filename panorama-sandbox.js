const state = {
    provider: null,
    apiKey: null,
    pano: null,
    lastYaw: 0,
    apiLoaded: { google: false, mapy: false }
};

const isFirefox = navigator.userAgent.includes('Firefox');
const container = document.getElementById('pano-container');
// The embed frame is created on demand and removed when unused. It must never be
// renavigated: this page is sandboxed, so the frame's origin is an opaque origin
// derived from the extension, and navigating it (e.g. src = '') trips a browser
// process origin-lock CHECK in Chrome and takes the whole browser down.
let embedFrame = null;

function removeEmbedFrame() {
    if (!embedFrame) return;
    embedFrame.remove();
    embedFrame = null;
}

function showEmbedFrame(src) {
    removeEmbedFrame();
    embedFrame = document.createElement('iframe');
    embedFrame.id = 'pano-embed';
    embedFrame.setAttribute('allowfullscreen', '');
    embedFrame.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0;';
    embedFrame.src = src;
    document.body.appendChild(embedFrame);
}

window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'INIT_PANO') {
        await openPanorama(data.provider, data.apiKey, data.lon, data.lat, data.yaw);
    } else if (data.type === 'RESIZE') {
        if (state.pano && state.provider === 'google' && !isFirefox) {
            google.maps.event.trigger(state.pano, 'resize');
        }
    }
});

function loadGoogleMaps(apiKey) {
    if (state.apiLoaded.google) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
        s.onload = () => { state.apiLoaded.google = true; resolve(); };
        s.onerror = () => reject(new Error('Failed to load Google Maps API'));
        document.head.appendChild(s);
    });
}

async function loadMapyCz() {
    if (state.apiLoaded.mapy) return;
    // In Firefox, panorama-mapy-sdk.js is loaded as a local script tag in panorama.html.
    // In Chrome (sandboxed page), it's also loaded locally — no dynamic loading needed.
    await waitForMapy();
    state.apiLoaded.mapy = true;
}

async function openPanorama(provider, apiKey, lon, lat, yaw) {
    state.provider = provider;
    state.apiKey = apiKey;
    state.lastYaw = yaw || 0;

    try {
        container.innerHTML = '';
        container.style.display = 'block';
        removeEmbedFrame();
        state.pano = null;

        if (provider === 'google') {
            if (isFirefox) {
                renderGoogleEmbed(lon, lat, state.lastYaw);
            } else {
                await loadGoogleMaps(apiKey);
                renderGoogle(lon, lat, state.lastYaw);
            }
        } else {
            await loadMapyCz();
            renderMapy(lon, lat, state.lastYaw);
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="error-msg">${e.message || 'Error loading panorama'}</div>`;
    }
}

function waitForMapy() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            if (window.Panorama || (window.SMap && window.SMap.Pano)) resolve();
            else if (attempts++ < 50) setTimeout(check, 100);
            else reject(new Error('Mapy.cz API timeout'));
        };
        check();
    });
}

function renderGoogleEmbed(lon, lat, yaw) {
    const heading = Math.round(yaw * 180 / Math.PI);
    const src = `https://www.google.com/maps/embed/v1/streetview?key=${state.apiKey}&location=${lat},${lon}&heading=${heading}&fov=90&pitch=0`;
    container.style.display = 'none';
    showEmbedFrame(src);
}

function renderGoogle(lon, lat, yaw) {
    const sv = new google.maps.StreetViewService();
    const location = { lat, lng: lon };

    sv.getPanorama({ location, radius: 100 }, (data, status) => {
        if (status === 'OK') {
            const pano = new google.maps.StreetViewPanorama(container, {
                position: data.location.latLng,
                pov: { heading: (yaw * 180 / Math.PI), pitch: 0 },
                zoom: 1,
                addressControl: false,
                linksControl: true,
                panControl: true,
                enableCloseButton: false,
                fullscreenControl: false
            });

            state.pano = pano;

            pano.addListener('pov_changed', () => {
                const heading = pano.getPov().heading;
                window.parent.postMessage({ type: 'PANO_YAW', yaw: heading * Math.PI / 180 }, '*');
            });

            pano.addListener('position_changed', () => {
                const pos = pano.getPosition();
                window.parent.postMessage({ type: 'PANO_POS', lon: pos.lng(), lat: pos.lat() }, '*');
            });
        } else {
            container.innerHTML = `<div class="error-msg">No Google Street View found here.</div>`;
        }
    });
}

function renderMapy(lon, lat, yaw) {
    const api = window.Panorama || (window.SMap && window.SMap.Pano);

    api.panoramaFromPosition({
        parent: container,
        lon, lat,
        radius: 100,
        lang: 'en',
        yaw: yaw,
        fov: Math.PI / 2,
        showNavigation: true,
        apiKey: state.apiKey
    }).then(pano => {
        state.pano = pano;

        if (pano.errorCode && pano.errorCode !== 'NONE') {
            container.innerHTML = `<div class="error-msg">No Mapy.cz panorama found here.</div>`;
            return;
        }

        pano.addListener('pano-view', () => {
            const cam = pano.getCamera();
            window.parent.postMessage({ type: 'PANO_YAW', yaw: cam.yaw }, '*');
        });

        pano.addListener('pano-place', (p) => {
            if (p.info) {
                window.parent.postMessage({ type: 'PANO_POS', lon: p.info.lon, lat: p.info.lat }, '*');
            }
        });

        window.parent.postMessage({ type: 'PANO_POS', lon: pano.info.lon, lat: pano.info.lat }, '*');

    }).catch(e => {
        container.innerHTML = `<div class="error-msg">${e.message}</div>`;
    });
}

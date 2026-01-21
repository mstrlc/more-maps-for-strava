const state = {
    provider: null,
    apiKey: null,
    pano: null,
    lastYaw: 0,
    apiLoaded: { google: false, mapy: false }
};

const container = document.getElementById('pano-container');

window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'INIT_PANO') {
        await openPanorama(data.provider, data.apiKey, data.lon, data.lat, data.yaw);
    } else if (data.type === 'RESIZE') {
        if (state.pano && state.provider === 'google') {
            google.maps.event.trigger(state.pano, 'resize');
        }
    }
});

function loadGoogleMaps(apiKey) {
    return new Promise((resolve, reject) => {
        if (state.apiLoaded.google) return resolve();
        
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
        s.async = true;
        s.defer = true;
        s.onload = () => {
             state.apiLoaded.google = true;
             resolve();
        };
        s.onerror = (e) => reject(new Error('Failed to load Google Maps API'));
        document.head.appendChild(s);
    });
}

function loadMapyCz(apiKey) {
    return new Promise((resolve, reject) => {
        if (state.apiLoaded.mapy) return resolve();
        
        const s = document.createElement('script');
        // Mapy.cz requires dynamic loading sometimes or just the main script
        s.src = `https://api.mapy.cz/js/panorama/v1/panorama.js${apiKey ? `?apikey=${apiKey}` : ''}`;
        s.async = true;
        s.defer = true;
        s.onload = async () => {
             // Wait for window.Panorama
             try {
                await waitForMapy();
                state.apiLoaded.mapy = true;
                resolve();
             } catch (e) {
                reject(e);
             }
        };
        s.onerror = (e) => reject(new Error('Failed to load Mapy.cz API'));
        document.head.appendChild(s);
    });
}

async function openPanorama(provider, apiKey, lon, lat, yaw) {
    state.provider = provider;
    state.apiKey = apiKey;
    state.lastYaw = yaw || 0;

    try {
        if (state.pano) {
            container.innerHTML = '';
            state.pano = null;
        }

        if (provider === 'google') {
            await loadGoogleMaps(apiKey);
            renderGoogle(lon, lat, state.lastYaw);
        } else {
            await loadMapyCz(apiKey);
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

            // Events
            pano.addListener('pov_changed', () => {
                const heading = pano.getPov().heading;
                const rad = heading * Math.PI / 180;
                window.parent.postMessage({ type: 'PANO_YAW', yaw: rad }, '*');
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

        // Events
        pano.addListener('pano-view', () => {
            const cam = pano.getCamera();
            window.parent.postMessage({ type: 'PANO_YAW', yaw: cam.yaw }, '*');
        });

        pano.addListener('pano-place', (p) => {
            if (p.info) {
                window.parent.postMessage({ type: 'PANO_POS', lon: p.info.lon, lat: p.info.lat }, '*');
            }
        });

        // Initial sync
        window.parent.postMessage({ type: 'PANO_POS', lon: pano.info.lon, lat: pano.info.lat }, '*');

    }).catch(e => {
        container.innerHTML = `<div class="error-msg">${e.message}</div>`;
    });
}

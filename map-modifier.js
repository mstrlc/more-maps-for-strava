/**
 * More Maps for Strava - Map Modifier Script
 * 
 * Injects the content script and manages the UI integration with Strava's map controller.
 */

// Inject scripts using the same pattern as strava-map-switcher
// This ensures they run in the page context, not the content script context
{
    const injectPageScript = (filename) => {
        return new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = browser.runtime.getURL(filename);
            s.type = 'text/javascript';
            s.onload = resolve;
            (document.body || document.documentElement).appendChild(s);
        });
    };

    const injectStyles = async () => {
        if (!document.body) {
            setTimeout(injectStyles, 10);
            return;
        }

        const style = document.createElement('style');
        style.textContent = `
            .${SELECTORS.SELECTED_CLASS} span {
                font-weight: 700 !important;
            }
            ${SELECTORS.CONTAINER} {
                grid-template-columns: repeat(4, 1fr) !important;
            }
        `;
        document.head.appendChild(style);

        // Inject sequentially
        await injectPageScript('constants.js');
        await injectPageScript('strings.js');
        await injectPageScript('panorama.js');
        await injectPageScript('inject.js');
    };

    injectStyles();
}

const {
    SELECTORS,
    MAP_OPTIONS,
    OSM_OPTIONS,
    GOOGLE_OPTIONS,
    STORAGE_KEYS,
    STRINGS
} = MoreMapsConfig;

let activeMapId = null;
let panoramaButtonInjected = false;
let isPanoramaActive = false;
let panoramaButtonEl = null;
let panoramaEyeIcon = null;
let panoramaXIcon = null;

// Listen for messages from the page context
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === 'MOREMAPS_PANORAMA_TOGGLE') {
        updatePanoramaUI(event.data.active);
    } else if (event.data.type === 'MOREMAPS_OPEN_SETTINGS') {
        showSettingsModal(event.data.instructions || false, event.data.highlightKey || null);
    } else if (event.data.type === 'MOREMAPS_API_KEY_UPDATED') {
        // Sync the provider selector if it exists
        const selector = document.getElementById('moremaps-panorama-provider-selector');
        if (selector) {
            selector.value = localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy';
        }
    }
});

function updatePanoramaUI(active) {
    isPanoramaActive = active;
    if (!panoramaButtonEl) return;

    if (isPanoramaActive) {
        panoramaButtonEl.style.color = '#fc4c02';
        panoramaButtonEl.style.backgroundColor = '#e6e6e6';
    } else {
        panoramaButtonEl.style.color = '';
        panoramaButtonEl.style.backgroundColor = '';
    }
}

function triggerMapSwitch(mapId) {
    // Check for API keys if switching to a custom map
    if (mapId.startsWith('mapycz-')) {
        const apiKey = localStorage.getItem(STORAGE_KEYS.MAPY_KEY);
        if (!apiKey) {
            showSettingsModal(true);
        }
    } else if (mapId === 'osm-cycle') {
        const apiKey = localStorage.getItem(STORAGE_KEYS.TF_KEY);
        if (!apiKey) {
            showSettingsModal(true);
        }
    }

    activeMapId = mapId;
    window.postMessage({
        type: 'MOREMAPS_MAP_SWITCH',
        mapType: mapId
    }, '*');

    // Update styling controls availability
    const isCustom = [...MAP_OPTIONS, ...OSM_OPTIONS].some(opt => opt.id === mapId);
    updateStylingControls(isCustom);
}

function updateStylingControls(enabled) {
    const stylingSection = document.getElementById('moremaps-styling-section');
    const stylingHeader = document.getElementById('moremaps-styling-header');

    if (stylingSection && stylingHeader) {
        if (enabled) {
            stylingSection.style.opacity = '1';
            stylingSection.style.pointerEvents = 'auto';
            stylingHeader.style.opacity = '1';
        } else {
            stylingSection.style.opacity = '0.5';
            stylingSection.style.pointerEvents = 'none';
            stylingHeader.style.opacity = '0.5';
        }
    }
}

function updateButtonSelection(selectedBtn) {
    const parent = selectedBtn.closest(`.${SELECTORS.CONTAINER.substring(1)}`) || selectedBtn.parentElement;
    if (!parent) return;

    // Deselect all buttons
    const all = parent.querySelectorAll(`.${SELECTORS.BUTTON}`);
    all.forEach(btn => btn.classList.remove(SELECTORS.SELECTED_CLASS));

    // Select target
    selectedBtn.classList.add(SELECTORS.SELECTED_CLASS);
}

function createButton(config) {
    const btn = document.createElement('button');
    btn.className = SELECTORS.BUTTON;
    btn.dataset.mapId = config.id;

    if (activeMapId === config.id) {
        btn.classList.add(SELECTORS.SELECTED_CLASS);
    }

    const img = document.createElement('img');
    img.alt = config.id;
    img.src = browser.runtime.getURL(config.img);
    img.className = SELECTORS.IMAGE;
    Object.assign(img.style, {
        objectFit: 'cover'
    });

    const span = document.createElement('span');
    span.classList.add(...SELECTORS.TEXT);
    span.textContent = config.label;

    btn.appendChild(img);
    btn.appendChild(span);

    btn.addEventListener('click', () => {
        triggerMapSwitch(config.id);
        updateButtonSelection(btn);
    });

    return btn;
}

/**
 * Attaches listeners to Strava's original buttons to handle resets.
 */
function attachResetListeners(container) {
    // Find buttons that are NOT ours
    const stravaButtons = container.querySelectorAll(`.${SELECTORS.BUTTON}:not([data-map-id])`);

    stravaButtons.forEach(btn => {
        // If we have an active custom map, force Strava's button to be DESELECTED
        if (activeMapId && activeMapId !== 'strava-default' && !MAP_OPTIONS.find(o => o.id === btn.dataset.mapId)) {
            btn.classList.remove(SELECTORS.SELECTED_CLASS);
        }

        if (btn.dataset.resetListenerAttached) return;
        btn.dataset.resetListenerAttached = 'true';

        btn.addEventListener('click', () => {
            triggerMapSwitch('strava-default');
            // We only need to deselect OUR buttons visually.
            // Strava will handle selecting its own button.
            const myButtons = container.querySelectorAll('[data-map-id]');
            myButtons.forEach(b => b.classList.remove(SELECTORS.SELECTED_CLASS));
        });
    });
}

const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;

        mutation.addedNodes.forEach(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            // Check if the added node IS the container or CONTAINS it
            const container = node.matches(SELECTORS.CONTAINER) ? node : node.querySelector(SELECTORS.CONTAINER);

            if (container) {
                // Attach reset listeners to existing buttons
                attachResetListeners(container);

                // Inject our custom buttons if missing
                if (!container.querySelector(`[data-map-id="${MAP_OPTIONS[0].id}"]`)) {

                    // Add Section Header "Mapy.cz"
                    // Strava uses this structure: <div class="MapDisplayControl_header__fIIDH"><span class="...">Map Styles</span></div>
                    // We need to mimic that or just simpler text.
                    const header = document.createElement('div');
                    // Try to reuse Strava header class if possible, otherwise generic
                    // "MapDisplayControl_header__fIIDH" might be unstable, let's use the one found in the page or just style it.
                    // We can check if there is an existing header to copy classes from.
                    const existingHeader = container.closest('.MapDisplayControl_section__jcjve')?.querySelector('[class*="MapDisplayControl_header"]');
                    if (existingHeader) {
                        header.className = existingHeader.className;
                    } else {
                        // Fallback style
                        header.style.padding = '8px 16px 4px';
                        header.style.fontWeight = '600';
                        header.style.fontSize = '12px';
                    }

                    const headerSpan = document.createElement('span');
                    if (existingHeader) {
                        const existingSpan = existingHeader.querySelector('span');
                        if (existingSpan) headerSpan.className = existingSpan.className;
                    }
                    headerSpan.textContent = 'Mapy.cz';
                    header.appendChild(headerSpan);

                    // Strava's grid doesn't really support sections INSIDE the grid (all buttons are siblings).
                    // If we add a div here, it might break the CSS grid layout.
                    // Strava's layout is: Section -> Header -> Options Container -> Buttons.
                    // We are appending TO the Options Container.
                    // If the Options Container is `display: grid`, adding a full-width header inside needs `grid-column: 1 / -1`.

                    header.style.gridColumn = '1 / -1';
                    header.style.marginTop = '12px'; // Spacing from Strava buttons
                    header.style.marginBottom = '4px';

                    container.appendChild(header);

                    MAP_OPTIONS.forEach(opt => {
                        container.appendChild(createButton(opt));
                    });

                    // Add Section Header "OpenStreetMap"
                    const osmHeader = header.cloneNode(true);
                    osmHeader.querySelector('span').textContent = 'OpenStreetMap';
                    container.appendChild(osmHeader);

                    OSM_OPTIONS.forEach(opt => {
                        container.appendChild(createButton(opt));
                    });

                    // Add Section Header "Google Maps"
                    const googleHeader = header.cloneNode(true);
                    googleHeader.querySelector('span').textContent = 'Google Maps';
                    container.appendChild(googleHeader);

                    GOOGLE_OPTIONS.forEach(opt => {
                        container.appendChild(createButton(opt));
                    });

                    // --- Visual Adjustments Section ---
                    // --- Styling Controls ---
                    const controlsHeader = header.cloneNode(true);
                    controlsHeader.id = 'moremaps-styling-header';
                    controlsHeader.querySelector('span').textContent = STRINGS.UI.STYLING_HEADER;
                    controlsHeader.style.marginTop = '16px';
                    container.appendChild(controlsHeader);

                    const controlsContainer = document.createElement('div');
                    controlsContainer.id = 'moremaps-styling-section';
                    controlsContainer.style.gridColumn = '1 / -1';
                    controlsContainer.style.padding = '0';
                    controlsContainer.style.display = 'flex';
                    controlsContainer.style.flexDirection = 'column';
                    controlsContainer.style.gap = '0';

                    // --- Opacity Slider ---
                    const initialOpacity = localStorage.getItem(STORAGE_KEYS.OPACITY) || '1';
                    const opaLabel = document.createElement('label');
                    opaLabel.style.display = 'flex';
                    opaLabel.style.flexDirection = 'column';
                    opaLabel.style.gap = '0';
                    opaLabel.style.padding = '4px 8px';

                    const opaHeader = document.createElement('div');
                    opaHeader.style.display = 'flex';
                    opaHeader.style.justifyContent = 'space-between';
                    opaHeader.style.alignItems = 'center';

                    const opaLabelText = document.createElement('span');
                    opaLabelText.className = 'element_body1__VB3SZ element_fontSizeXs__sfPOR element_fontWeightBook__Cmleq';
                    opaLabelText.textContent = STRINGS.UI.OPACITY_LABEL;

                    const opaValueText = document.createElement('span');
                    opaValueText.className = 'element_body1__VB3SZ element_fontSizeXs__sfPOR element_fontWeightBook__Cmleq';
                    opaValueText.textContent = `${Math.round(parseFloat(initialOpacity) * 100)}%`;

                    opaHeader.appendChild(opaLabelText);
                    opaHeader.appendChild(opaValueText);

                    const opaInput = document.createElement('input');
                    opaInput.type = 'range';
                    opaInput.min = '0';
                    opaInput.max = '1';
                    opaInput.step = '0.05';
                    opaInput.value = initialOpacity;
                    opaInput.style.width = '100%';
                    opaInput.style.accentColor = '#fc4c02';
                    opaInput.style.height = '12px';
                    opaInput.style.cursor = 'pointer';

                    opaInput.addEventListener('input', (e) => {
                        const val = e.target.value;
                        opaValueText.textContent = `${Math.round(val * 100)}%`;
                        localStorage.setItem(STORAGE_KEYS.OPACITY, val);
                        window.postMessage({
                            type: 'MOREMAPS_MAP_MOD_OPACITY',
                            value: val
                        }, '*');
                    });

                    opaLabel.appendChild(opaHeader);
                    opaLabel.appendChild(opaInput);
                    controlsContainer.appendChild(opaLabel);

                    // --- Saturation Slider ---
                    const initialSatSlider = localStorage.getItem(STORAGE_KEYS.SATURATION_SLIDER) || '1';
                    const satLabel = document.createElement('label');
                    satLabel.style.display = 'flex';
                    satLabel.style.flexDirection = 'column';
                    satLabel.style.gap = '0';
                    satLabel.style.padding = '4px 8px';

                    const satHeader = document.createElement('div');
                    satHeader.style.display = 'flex';
                    satHeader.style.justifyContent = 'space-between';
                    satHeader.style.alignItems = 'center';

                    const satLabelText = document.createElement('span');
                    satLabelText.className = 'element_body1__VB3SZ element_fontSizeXs__sfPOR element_fontWeightBook__Cmleq';
                    satLabelText.textContent = STRINGS.UI.SATURATION_LABEL;

                    const satValueText = document.createElement('span');
                    satValueText.className = 'element_body1__VB3SZ element_fontSizeXs__sfPOR element_fontWeightBook__Cmleq';
                    satValueText.textContent = `${Math.round(parseFloat(initialSatSlider) * 100)}%`;

                    satHeader.appendChild(satLabelText);
                    satHeader.appendChild(satValueText);

                    const satInput = document.createElement('input');
                    satInput.type = 'range';
                    satInput.min = '0';
                    satInput.max = '1';
                    satInput.step = '0.05';
                    satInput.value = initialSatSlider;
                    satInput.style.width = '100%';
                    satInput.style.accentColor = '#fc4c02';
                    satInput.style.height = '12px';
                    satInput.style.cursor = 'pointer';

                    satInput.addEventListener('input', (e) => {
                        const val = parseFloat(e.target.value);
                        satValueText.textContent = `${Math.round(val * 100)}%`;

                        // Map 0..1 to -1..0 (Grayscale to Normal)
                        const mapboxVal = val - 1;
                        localStorage.setItem(STORAGE_KEYS.SATURATION_SLIDER, val);
                        localStorage.setItem(STORAGE_KEYS.SATURATION_MAPBOX, mapboxVal);

                        window.postMessage({
                            type: 'MOREMAPS_MAP_MOD_SATURATION',
                            value: mapboxVal
                        }, '*');
                    });

                    satLabel.appendChild(satHeader);
                    satLabel.appendChild(satInput);
                    controlsContainer.appendChild(satLabel);

                    // Explainer Text
                    const explainer = document.createElement('div');
                    explainer.style.fontSize = '10px';
                    explainer.style.color = '#888';
                    explainer.style.padding = '2px 8px 8px';
                    explainer.style.lineHeight = '1.2';
                    explainer.textContent = STRINGS.UI.STYLING_EXPLAINER;
                    controlsContainer.appendChild(explainer);

                    container.appendChild(controlsContainer);

                    // Initial state check
                    const isCustom = [...MAP_OPTIONS, ...OSM_OPTIONS].some(opt => opt.id === activeMapId);
                    updateStylingControls(isCustom);
                }
            }
        });
    }
});

/**
 * Create and inject panorama button in the map control area (top-left)
 */
function createPanoramaButton() {
    // Check if button already exists in the DOM
    if (document.getElementById('strava-panorama-control')) {
        return;
    }

    // Find the Mapbox control container (top-left)
    const ctrlContainer = document.querySelector('.mapboxgl-ctrl-top-left');
    if (!ctrlContainer) {
        return;
    }

    // Create the control group div
    const controlGroup = document.createElement('div');
    controlGroup.id = 'strava-panorama-control';
    controlGroup.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
    controlGroup.style.cssText = `
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        width: auto !important;
        max-width: none !important;
        overflow: visible !important;
        background: white !important;
        border-radius: 4px !important;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.1) !important;
    `;

    // Create the button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mapboxgl-ctrl-icon';
    btn.title = STRINGS.UI.PANORAMA_TOOLTIP;
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.setAttribute('aria-label', 'Panorama Mode');

    // SVG icon for panorama (eye icon)
    const eyeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    eyeIcon.setAttribute('fill', 'currentColor');
    eyeIcon.setAttribute('viewBox', '0 0 16 16');
    eyeIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    eyeIcon.setAttribute('width', '18');
    eyeIcon.setAttribute('height', '18');

    const eyePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    eyePath.setAttribute('d', 'M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8.5c-1.933 0-3.5-1.567-3.5-3.5S6.067 4.5 8 4.5s3.5 1.567 3.5 3.5-1.567 3.5-3.5 3.5zm0-5.5c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z');
    eyeIcon.appendChild(eyePath);

    btn.appendChild(eyeIcon);
    controlGroup.appendChild(btn);

    // Create Provider Selector
    const selector = document.createElement('select');
    selector.id = 'moremaps-panorama-provider-selector';
    selector.style.cssText = `
        border: none !important;
        background: transparent !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        padding: 0 4px 0 2px !important;
        height: 29px !important;
        border-left: 1px solid #eee !important;
        cursor: pointer !important;
        outline: none !important;
        color: #333 !important;
        appearance: auto !important;
        -webkit-appearance: menulist !important;
        margin: 0 !important;
        min-width: 38px !important;
        text-align: center !important;
    `;

    const optMapy = document.createElement('option');
    optMapy.value = 'mapy';
    optMapy.textContent = 'Mapy.cz';

    const optGoogle = document.createElement('option');
    optGoogle.value = 'google';
    optGoogle.textContent = 'Google';

    selector.appendChild(optMapy);
    selector.appendChild(optGoogle);

    // Initial value
    selector.value = localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy';

    selector.addEventListener('change', (e) => {
        const val = e.target.value;
        localStorage.setItem(STORAGE_KEYS.PANO_PROVIDER, val);
        window.postMessage({ type: 'MOREMAPS_API_KEY_UPDATED' }, '*');
    });

    controlGroup.appendChild(selector);

    // Toggle functionality
    panoramaButtonEl = btn;
    panoramaEyeIcon = eyeIcon;
    panoramaXIcon = null;

    btn.addEventListener('click', () => {
        const newState = !isPanoramaActive;

        // If enabling, check for key
        if (newState) {
            const provider = localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy';
            const key = provider === 'mapy' ? localStorage.getItem(STORAGE_KEYS.MAPY_KEY) : localStorage.getItem(STORAGE_KEYS.GOOGLE_KEY);
            if (!key) {
                showSettingsModal(true, provider === 'mapy' ? STORAGE_KEYS.MAPY_KEY : STORAGE_KEYS.GOOGLE_KEY);
                return;
            }
        }

        updatePanoramaUI(newState);
        window.postMessage({ type: 'MOREMAPS_PANORAMA_TOGGLE', active: newState }, '*');
    });

    // Prepend to top-left to be above geolocate
    ctrlContainer.prepend(controlGroup);

    console.log('More Maps: Panorama control added!');
}

// --- Settings Button and Modal ---

let settingsModalInjected = false;
let settingsButtonInjected = false;

function showSettingsModal(showInstructions = false, highlightKey = null) {
    injectSettingsModal();
    const modal = document.getElementById('moremaps-settings-modal');
    if (modal) {
        modal.style.display = 'flex';
        if (showInstructions) {
            const instr = document.getElementById('moremaps-api-instructions');
            if (instr) instr.style.display = 'block';
        }
        if (highlightKey) {
            const input = document.getElementById(`input-${highlightKey}`);
            if (input) {
                input.style.border = '2px solid #fc4c02';
                input.style.backgroundColor = '#fff5f2';
                input.focus();
            }
        }
    }
}

function injectSettingsModal() {
    if (settingsModalInjected || document.getElementById('moremaps-settings-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'moremaps-settings-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: "Boathouse", "Noto Sans", "Segoe UI", sans-serif;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 32px;
        border-radius: 12px;
        width: 450px;
        max-width: 90%;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        position: relative;
    `;

    const headerWrapper = document.createElement('div');
    headerWrapper.style.display = 'flex';
    headerWrapper.style.alignItems = 'center';
    headerWrapper.style.gap = '12px';
    headerWrapper.style.marginBottom = '24px';

    const orangeIcon = document.createElement('img');
    orangeIcon.src = browser.runtime.getURL('icons/icon_orange.svg');
    orangeIcon.style.width = '24px';
    orangeIcon.style.height = '24px';

    const title = document.createElement('h2');
    title.textContent = STRINGS.UI.SETTINGS_TITLE;
    title.style.margin = '0';
    title.style.fontSize = '24px';
    title.style.color = '#333';

    headerWrapper.appendChild(orangeIcon);
    headerWrapper.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #999;
        z-index: 10001;
    `;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modal.style.display = 'none';
    });

    // Constants already extracted at the top level

    const createApiLink = (url) => {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.style.cssText = 'color:#fc4c02; text-decoration:underline; display:inline-flex; align-items:center; margin-left:8px; vertical-align:middle; font-size:11px; font-weight:500;';
        a.innerHTML = `<span style="margin-right:4px;">${STRINGS.SETTINGS.GET_KEY}</span><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;
        return a;
    };

    const apiKeysHeading = document.createElement('div');
    apiKeysHeading.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:16px; font-weight:700; color:#333; margin: 8px 0 16px 0; padding-top: 16px; border-top: 1px solid #eee; text-align:left;';
    apiKeysHeading.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#fc4c02;">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3-3.5 3.5z"></path>
        </svg>
        <span>${STRINGS.SETTINGS.API_KEYS_HEADER}</span>
    `;

    const labelMapy = document.createElement('label');
    labelMapy.style.cssText = 'display:flex; align-items:center; margin-bottom:8px; font-weight:600; text-align:left; font-size:13px; color:#333; width:100%;';
    labelMapy.innerHTML = `<span>${STRINGS.SETTINGS.MAPY_LABEL}</span>`;
    labelMapy.appendChild(createApiLink(STRINGS.SETTINGS.API_LINKS.MAPY));

    const inputMapy = document.createElement('input');
    inputMapy.id = `input-${STORAGE_KEYS.MAPY_KEY}`;
    inputMapy.type = 'text';
    inputMapy.placeholder = STRINGS.SETTINGS.MAPY_PLACEHOLDER;
    inputMapy.value = localStorage.getItem(STORAGE_KEYS.MAPY_KEY) || '';
    inputMapy.style.cssText = 'width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:6px; margin-bottom:16px; font-size:12px; font-family:monospace; transition: border 0.2s, background-color 0.2s;';
    inputMapy.oninput = () => {
        inputMapy.style.border = '1px solid #ddd';
        inputMapy.style.backgroundColor = 'white';
    };

    const labelGoogle = document.createElement('label');
    labelGoogle.style.cssText = 'display:flex; align-items:center; margin-bottom:8px; font-weight:600; text-align:left; font-size:13px; color:#333; width:100%;';
    labelGoogle.innerHTML = `<span>${STRINGS.SETTINGS.GOOGLE_LABEL}</span>`;
    labelGoogle.appendChild(createApiLink(STRINGS.SETTINGS.API_LINKS.GOOGLE));

    const inputGoogle = document.createElement('input');
    inputGoogle.id = `input-${STORAGE_KEYS.GOOGLE_KEY}`;
    inputGoogle.type = 'text';
    inputGoogle.placeholder = STRINGS.SETTINGS.GOOGLE_PLACEHOLDER;
    inputGoogle.value = localStorage.getItem(STORAGE_KEYS.GOOGLE_KEY) || '';
    inputGoogle.style.cssText = 'width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:6px; margin-bottom:16px; font-size:12px; font-family:monospace; transition: border 0.2s, background-color 0.2s;';
    inputGoogle.oninput = () => {
        inputGoogle.style.border = '1px solid #ddd';
        inputGoogle.style.backgroundColor = 'white';
    };

    const labelTF = document.createElement('label');
    labelTF.style.cssText = 'display:flex; align-items:center; margin-bottom:8px; font-weight:600; text-align:left; font-size:13px; color:#333; width:100%;';
    labelTF.innerHTML = `<span>${STRINGS.SETTINGS.TF_LABEL}</span>`;
    labelTF.appendChild(createApiLink(STRINGS.SETTINGS.API_LINKS.TF));

    const inputTF = document.createElement('input');
    inputTF.id = `input-${STORAGE_KEYS.TF_KEY}`;
    inputTF.type = 'text';
    inputTF.placeholder = STRINGS.SETTINGS.TF_PLACEHOLDER;
    inputTF.value = localStorage.getItem(STORAGE_KEYS.TF_KEY) || '';
    inputTF.style.cssText = 'width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:6px; margin-bottom:16px; font-size:12px; font-family:monospace; transition: border 0.2s, background-color 0.2s;';
    inputTF.oninput = () => {
        inputTF.style.border = '1px solid #ddd';
        inputTF.style.backgroundColor = 'white';
    };





    const storageInfo = document.createElement('div');
    storageInfo.style.cssText = 'font-size:11px; color:#888; margin-bottom:24px; text-align:left;';
    storageInfo.textContent = STRINGS.UI.API_KEYS_NOTICE;

    const saveBtn = document.createElement('button');
    saveBtn.style.cssText = 'width:100%; padding:12px; background:#fc4c02; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:16px; transition:background 0.2s; display:flex; align-items:center; justify-content:center; gap:8px;';

    const saveIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    saveIcon.setAttribute('viewBox', '0 0 24 24');
    saveIcon.setAttribute('width', '18');
    saveIcon.setAttribute('height', '18');
    saveIcon.setAttribute('fill', 'none');
    saveIcon.setAttribute('stroke', 'currentColor');
    saveIcon.setAttribute('stroke-width', '2.5');
    saveIcon.setAttribute('stroke-linecap', 'round');
    saveIcon.setAttribute('stroke-linejoin', 'round');
    saveIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';

    const saveText = document.createElement('span');
    saveText.textContent = STRINGS.UI.SAVE_BUTTON;

    saveBtn.appendChild(saveIcon);
    saveBtn.appendChild(saveText);
    saveBtn.onclick = () => {
        localStorage.setItem(STORAGE_KEYS.MAPY_KEY, inputMapy.value.trim());
        localStorage.setItem(STORAGE_KEYS.GOOGLE_KEY, inputGoogle.value.trim());
        localStorage.setItem(STORAGE_KEYS.TF_KEY, inputTF.value.trim());

        // Clear any highlights
        [inputMapy, inputGoogle, inputTF].forEach(inp => {
            inp.style.border = '1px solid #ddd';
            inp.style.backgroundColor = 'white';
        });

        modal.style.display = 'none';
        window.postMessage({ type: 'MOREMAPS_API_KEY_UPDATED' }, '*');
    };

    const resetBtn = document.createElement('button');
    resetBtn.style.cssText = 'width:100%; padding:8px; background:transparent; color:#999; border:none; border-radius:6px; font-weight:500; cursor:pointer; font-size:12px; margin-top:12px; text-decoration:underline; display:flex; align-items:center; justify-content:center; gap:6px;';

    const resetIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    resetIcon.setAttribute('viewBox', '0 0 24 24');
    resetIcon.setAttribute('width', '14');
    resetIcon.setAttribute('height', '14');
    resetIcon.setAttribute('fill', 'none');
    resetIcon.setAttribute('stroke', 'currentColor');
    resetIcon.setAttribute('stroke-width', '2');
    resetIcon.setAttribute('stroke-linecap', 'round');
    resetIcon.setAttribute('stroke-linejoin', 'round');
    resetIcon.innerHTML = '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>';

    const resetText = document.createElement('span');
    resetText.textContent = STRINGS.UI.RESET_BUTTON;

    resetBtn.appendChild(resetIcon);
    resetBtn.appendChild(resetText);
    resetBtn.onclick = () => {
        if (confirm(STRINGS.UI.DELETE_DATA_CONFIRM)) {
            // Find all keys starting with moremaps_ and remove them
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('moremaps_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };

    content.appendChild(closeBtn);
    content.appendChild(headerWrapper);
    content.appendChild(apiKeysHeading);
    content.appendChild(labelMapy);
    content.appendChild(inputMapy);
    content.appendChild(labelGoogle);
    content.appendChild(inputGoogle);
    content.appendChild(labelTF);
    content.appendChild(inputTF);
    content.appendChild(storageInfo);
    content.appendChild(saveBtn);
    content.appendChild(resetBtn);
    modal.appendChild(content);
    document.body.appendChild(modal);

    settingsModalInjected = true;
}

function createSettingsButton() {
    if (settingsButtonInjected || document.querySelector('[data-key="more-maps-settings"]')) return;

    const myRoutes = document.querySelector('[data-key="my-routes"]');
    if (!myRoutes) return;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'react-horizontal-scrolling-menu--item';
    itemDiv.setAttribute('data-key', 'more-maps-settings');

    const innerDiv = document.createElement('div');

    const btn = document.createElement('button');
    btn.className = 'Button_btn__EdK33 Button_default__JSqPI MapNav_linkButton__nZjYH MapNav_mapButtonShadow__pUy0N';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '8px';

    // Black icon
    const icon = document.createElement('img');
    icon.src = browser.runtime.getURL('icons/icon_black.svg');
    icon.style.width = '16px';
    icon.style.height = '16px';

    const label = document.createElement('span');
    label.textContent = STRINGS.UI.SETTINGS_LABEL;

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.onclick = () => showSettingsModal();

    innerDiv.appendChild(btn);
    itemDiv.appendChild(innerDiv);

    myRoutes.after(itemDiv);
    settingsButtonInjected = true;
}

// Observer for panorama button injection
const navObserver = new MutationObserver(() => {
    createPanoramaButton();
    createSettingsButton();
});

function init() {
    if (!document.body) {
        requestAnimationFrame(init);
        return;
    }
    observer.observe(document.body, { childList: true, subtree: true });
    navObserver.observe(document.body, { childList: true, subtree: true });

    // Try to inject immediately
    createPanoramaButton();
    createSettingsButton();
    injectSettingsModal();

    console.log('More Maps: UI Observer started');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

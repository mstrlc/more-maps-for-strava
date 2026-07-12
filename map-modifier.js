/**
 * More Maps for Strava - Map Modifier Script
 *
 * Injects the page-context scripts and integrates with Strava's new CoreMap
 * (FATMAP) engine UI. Our map options are injected natively into Strava's own
 * "Change map style" popover (MapPreferences_*); the panorama toggle goes into
 * the map's top-left UI controls. Communicates with the page via postMessage.
 */

// Inject page-context scripts (run in the page's JS world, not the isolated one).
{
    const injectPageScript = (filename) => new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = browser.runtime.getURL(filename);
        s.type = 'text/javascript';
        s.onload = resolve;
        (document.body || document.documentElement).appendChild(s);
    });

    const boot = async () => {
        if (!document.head) { setTimeout(boot, 10); return; }
        const meta = document.createElement('meta');
        meta.name = 'moremaps-extension-url';
        meta.content = browser.runtime.getURL('');
        document.head.appendChild(meta);

        await injectPageScript('constants.js');
        await injectPageScript('strings.js');
        await injectPageScript('panorama.js');
        await injectPageScript('inject.js');
    };
    boot();
}

const { MAP_OPTIONS, OSM_OPTIONS, GOOGLE_OPTIONS, STORAGE_KEYS, STRINGS } = MoreMapsConfig;

const ORANGE = '#fc4c02';
// Always start at strava-default: on page load the engine shows Strava's own
// map (we don't re-apply across reloads), so pre-selecting a persisted custom
// provider would wrongly outline two buttons.
let activeMapId = 'strava-default';
let isPanoramaActive = false;
let panoramaButtonEl = null;

// Detected native class names (cloned from Strava's own buttons for a native look).
const native = {
    optionButton: 'MapPreferences_optionButton',
    imageContainer: 'MapPreferences_imageContainer',
    image: 'MapPreferences_option',
    label: '',
    selected: 'MapPreferences_selected',
    section: 'MapPreferences_section',
    header: 'MapPreferences_header',
    heading: '',
    optionsGrid: 'MapPreferences_options'
};

// ---------------------------------------------------------------------------
// Messages from the page context
// ---------------------------------------------------------------------------
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'MOREMAPS_PANORAMA_TOGGLE') {
        updatePanoramaUI(event.data.active);
    } else if (event.data.type === 'MOREMAPS_OPEN_SETTINGS') {
        showSettingsModal(event.data.instructions || false, event.data.highlightKey || null);
    } else if (event.data.type === 'MOREMAPS_API_KEY_UPDATED') {
        const sel = document.getElementById('moremaps-pano-provider');
        if (sel) sel.value = localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy';
    }
});

function updatePanoramaUI(active) {
    isPanoramaActive = active;
    if (!panoramaButtonEl) return;
    panoramaButtonEl.style.color = active ? ORANGE : '';
    panoramaButtonEl.style.backgroundColor = active ? '#e6e6e6' : '';
}

// ---------------------------------------------------------------------------
// Map switching
// ---------------------------------------------------------------------------
function triggerMapSwitch(mapId) {
    if (mapId.startsWith('mapycz-') && !localStorage.getItem(STORAGE_KEYS.MAPY_KEY)) {
        showSettingsModal(true, STORAGE_KEYS.MAPY_KEY);
    } else if (mapId === 'osm-cycle' && !localStorage.getItem(STORAGE_KEYS.TF_KEY)) {
        showSettingsModal(true, STORAGE_KEYS.TF_KEY);
    }
    activeMapId = mapId;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, mapId);
    window.postMessage({ type: 'MOREMAPS_MAP_SWITCH', mapType: mapId }, '*');
}

// Reset to Strava's own base map. Strava's native style button performs the
// actual map-type switch itself (reliably, including in Firefox). We must NOT
// call setMapType ourselves — that crashes the WASM in Firefox — nor clearCache/
// requestRender, which would fight Strava's switch. We only do passive cleanup.
function clearToStrava() {
    activeMapId = 'strava-default';
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, 'strava-default');
    window.postMessage({ type: 'MOREMAPS_MAP_CLEAR' }, '*');
}

// ---------------------------------------------------------------------------
// Native popover injection (Strava's "Change map style" menu)
// ---------------------------------------------------------------------------
function detectNativeClasses(menu) {
    const btn = menu.querySelector(`[class*="${native.optionButton}"]`);
    if (btn) {
        native.optionButton = firstClassContaining(btn, 'optionButton') || native.optionButton;
        const sel = Array.from(btn.classList).find(c => /selected/i.test(c));
        if (sel) native.selected = sel;
        const imgWrap = btn.querySelector(`[class*="imageContainer"]`);
        if (imgWrap) native.imageContainer = firstClassContaining(imgWrap, 'imageContainer') || native.imageContainer;
        const img = btn.querySelector('img');
        if (img && img.className) native.image = img.className;
        const label = btn.querySelector(`[class*="_label"]`);
        if (label && label.className) native.label = label.className;
    }
    const grid = menu.querySelector(`[class*="${native.optionsGrid}"]`);
    if (grid) native.optionsGrid = classListString(grid);
    const section = menu.querySelector(`[class*="${native.section}"]`);
    if (section) {
        native.section = classListString(section);
        const header = section.querySelector(`[class*="${native.header}"]`);
        if (header) {
            native.header = classListString(header);
            const span = header.querySelector('span, div');
            if (span && span.className) native.heading = span.className;
        }
    }
}

function firstClassContaining(el, substr) {
    return Array.from(el.classList).find(c => c.includes(substr)) || null;
}
function classListString(el) {
    return typeof el.className === 'string' ? el.className : '';
}

function createOptionButton(opt) {
    const btn = document.createElement('button');
    btn.className = native.optionButton;
    btn.dataset.mmMapId = opt.id;
    if (activeMapId === opt.id) btn.classList.add(native.selected);

    const imgWrap = document.createElement('div');
    imgWrap.className = native.imageContainer;
    const img = document.createElement('img');
    img.className = native.image;
    img.alt = opt.label;
    img.src = browser.runtime.getURL(opt.img);
    img.style.objectFit = 'cover';
    imgWrap.appendChild(img);

    const label = document.createElement('div');
    if (native.label) label.className = native.label;
    label.textContent = opt.label;

    btn.appendChild(imgWrap);
    btn.appendChild(label);

    btn.addEventListener('click', () => {
        // Exclusive selection across the whole menu (native + ours).
        const menu = btn.closest(`[class*="MapPreferences_menuContainer"]`) || document;
        menu.querySelectorAll(`[class*="${native.optionButton}"]`).forEach(b => b.classList.remove(native.selected));
        btn.classList.add(native.selected);
        triggerMapSwitch(opt.id);
    });
    return btn;
}

function createSection(title, options) {
    const section = document.createElement('div');
    section.className = native.section;
    section.dataset.mmSection = title;

    const header = document.createElement('div');
    header.className = native.header;
    const heading = document.createElement('span');
    if (native.heading) heading.className = native.heading;
    heading.textContent = title;
    header.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = native.optionsGrid;
    options.forEach(opt => grid.appendChild(createOptionButton(opt)));

    section.appendChild(header);
    section.appendChild(grid);
    return section;
}

function injectIntoMenu(menu) {
    if (menu.querySelector('[data-mm-section]')) return; // already injected
    detectNativeClasses(menu);

    // Attach reset behaviour to Strava's own "Map Styles" buttons only (not the
    // "Layers" overlays, which shouldn't clear our base map).
    let mapStylesSection = null;
    menu.querySelectorAll(`[class*="MapPreferences_section"]`).forEach(s => {
        if (/Map Styles/i.test(s.textContent || '')) mapStylesSection = s;
    });
    const nativeStyleBtns = (mapStylesSection || menu).querySelectorAll(`[class*="${native.optionButton}"]`);
    nativeStyleBtns.forEach(btn => {
        if (btn.dataset.mmMapId || btn.dataset.mmReset) return;
        btn.dataset.mmReset = '1';
        btn.addEventListener('click', () => {
            // Make the clicked native style the sole selected button (React won't
            // re-mark it when re-clicking the already-active style).
            menu.querySelectorAll(`[class*="${native.optionButton}"]`).forEach(b => b.classList.remove(native.selected));
            btn.classList.add(native.selected);
            clearToStrava();
        });
    });

    // Insert our sections after the first (Map Styles) section.
    const firstSection = menu.querySelector(`[class*="MapPreferences_section"]`);
    const anchor = firstSection ? firstSection.nextSibling : null;
    const frag = document.createDocumentFragment();
    frag.appendChild(createSection('Mapy.cz', MAP_OPTIONS));
    frag.appendChild(createSection('OpenStreetMap', OSM_OPTIONS));
    frag.appendChild(createSection('Google Maps', GOOGLE_OPTIONS));
    menu.insertBefore(frag, anchor);

    // When a custom provider is active, Strava still marks its own (unchanged)
    // style button as selected — clear it so only our button is outlined.
    if (activeMapId !== 'strava-default') {
        menu.querySelectorAll(`[class*="${native.optionButton}"]`).forEach(b => {
            if (!b.dataset.mmMapId) b.classList.remove(native.selected);
        });
    }
}

// ---------------------------------------------------------------------------
// Panorama toggle + provider switcher, placed under "Find my location"
// ---------------------------------------------------------------------------
function createPanoramaButton() {
    const findMe = document.querySelector('[class*="MapViewControls_findMe"]');
    if (!findMe) return;
    const findMeBtn = findMe.closest('[class*="ControlButton_controlButton"]');
    const findMeGroup = findMe.closest('[class*="ControlButton_controlGroup"]');
    const column = findMe.closest('[class*="ControlButton_container"]');
    if (!findMeBtn || !column) return;
    // The top-left region is a flex row; append our group as a second column to
    // the right of the native controls (location + zoom), top-aligned.
    const topLeft = column.parentElement;
    if (!topLeft) return;

    if (document.getElementById('strava-panorama-control')) return;

    // Match the native control's size/shape exactly.
    const h = findMeBtn.offsetHeight || 29;
    const gcs = getComputedStyle(findMeGroup || findMeBtn);
    const radius = gcs.borderRadius && gcs.borderRadius !== '0px' ? gcs.borderRadius : '4px';
    const shadow = gcs.boxShadow && gcs.boxShadow !== 'none' ? gcs.boxShadow : '0 1px 3px rgba(0,0,0,0.3)';

    // Own group: eye button + provider selector side by side, matching the
    // original layout, blending with Strava's controls.
    const group = document.createElement('div');
    group.dataset.mmPanoGroup = '1';
    group.style.cssText = `align-self:flex-start; margin-left:10px; height:${h}px; display:flex; flex-direction:row; align-items:stretch; overflow:hidden; background:#fff; border-radius:${radius}; box-shadow:${shadow};`;

    const btn = document.createElement('button');
    btn.id = 'strava-panorama-control';
    btn.className = findMeBtn.className; // clone native control button styling
    btn.title = STRINGS.UI.PANORAMA_TOOLTIP;
    btn.setAttribute('aria-label', 'Panorama Mode');
    btn.style.borderRadius = '0';
    btn.style.height = h + 'px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8.5c-1.933 0-3.5-1.567-3.5-3.5S6.067 4.5 8 4.5s3.5 1.567 3.5 3.5-1.567 3.5-3.5 3.5zm0-5.5c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z');
    svg.appendChild(path);
    btn.appendChild(svg);
    btn.addEventListener('click', onPanoramaClick);
    panoramaButtonEl = btn;

    // Provider switcher (Mapy.cz / Google), like the original.
    const selector = document.createElement('select');
    selector.id = 'moremaps-pano-provider';
    selector.title = 'Panorama provider';
    selector.style.cssText = 'box-sizing:border-box; height:100%; border:none; border-left:1px solid #e6e6e6; background:transparent; font-size:11px; font-weight:700; padding:0 2px 0 6px; cursor:pointer; outline:none; color:#333; appearance:auto; -webkit-appearance:menulist;';
    [['mapy', STRINGS.SETTINGS.PROVIDER_MAPY], ['google', 'Google']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; selector.appendChild(o);
    });
    selector.value = localStorage.getItem(STORAGE_KEYS.PANO_PROVIDER) || 'mapy';
    selector.addEventListener('change', (e) => {
        localStorage.setItem(STORAGE_KEYS.PANO_PROVIDER, e.target.value);
        window.postMessage({ type: 'MOREMAPS_API_KEY_UPDATED' }, '*');
    });

    group.appendChild(btn);
    group.appendChild(selector);
    topLeft.appendChild(group); // second column, right of the native controls
}

// ---------------------------------------------------------------------------
// Settings button — native nav item, placed next to "My Routes"
// ---------------------------------------------------------------------------
function createSettingsButton() {
    if (document.querySelector('[data-key="more-maps-settings"]')) return;
    const myRoutes = document.querySelector('[data-key="my-routes"]');
    if (!myRoutes) return;
    const link = myRoutes.querySelector('a, button');

    const item = document.createElement('div');
    item.className = myRoutes.className; // react-horizontal-scrolling-menu--item
    item.setAttribute('data-key', 'more-maps-settings');

    const inner = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = link ? link.className : 'Button_btn__EdK33 Button_default__JSqPI MapNav_linkButton__nZjYH MapNav_mapButtonShadow__pUy0N';
    btn.type = 'button';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '8px';

    const icon = document.createElement('img');
    icon.src = browser.runtime.getURL('icons/icon_black.svg');
    icon.style.width = '16px';
    icon.style.height = '16px';

    const label = document.createElement('span');
    label.textContent = STRINGS.UI.SETTINGS_LABEL;

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('click', showSettingsModal);
    inner.appendChild(btn);
    item.appendChild(inner);
    myRoutes.after(item);
}

// ---------------------------------------------------------------------------
// Activity detail page: add our providers to the native "Map Style" <select>
// ---------------------------------------------------------------------------
function injectIntoActivitySelect() {
    const sel = document.querySelector('select[class*="MapTypeControl--select"]');
    if (!sel || sel.querySelector('optgroup[data-mm]')) return;

    const addGroup = (label, options) => {
        const g = document.createElement('optgroup');
        g.label = label;
        g.setAttribute('data-mm', '1');
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = 'mm:' + opt.id;
            o.textContent = opt.label;
            g.appendChild(o);
        });
        sel.appendChild(g);
    };
    addGroup('Mapy.cz', MAP_OPTIONS);
    addGroup('OpenStreetMap', OSM_OPTIONS);
    addGroup('Google Maps', GOOGLE_OPTIONS);

    if (!sel.dataset.mmBound) {
        sel.dataset.mmBound = '1';
        // Capture phase: run before Strava's React onChange. For our options we
        // stop propagation and apply the tile swap; for Strava's own options we
        // let it switch and just drop our override.
        sel.addEventListener('change', (ev) => {
            const v = sel.value;
            if (v && v.indexOf('mm:') === 0) {
                ev.stopImmediatePropagation();
                triggerMapSwitch(v.slice(3));
            } else {
                clearToStrava();
            }
        }, true);
    }

    // Reflect an already-active custom provider in the select.
    if (activeMapId !== 'strava-default') {
        const val = 'mm:' + activeMapId;
        if ([...sel.options].some(o => o.value === val)) sel.value = val;
    }
}

function onPanoramaClick() {
    const newState = !isPanoramaActive;
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
}

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
let settingsModalInjected = false;

function showSettingsModal(showInstructions = false, highlightKey = null) {
    injectSettingsModal();
    const modal = document.getElementById('moremaps-settings-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (showInstructions) {
        const instr = document.getElementById('moremaps-api-instructions');
        if (instr) instr.style.display = 'block';
    }
    if (highlightKey) {
        const input = document.getElementById(`input-${highlightKey}`);
        if (input) { input.style.border = `2px solid ${ORANGE}`; input.style.backgroundColor = '#fff5f2'; input.focus(); }
    }
}

function injectSettingsModal() {
    if (settingsModalInjected || document.getElementById('moremaps-settings-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'moremaps-settings-modal';
    modal.style.cssText = `position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; z-index:10000; font-family:"Boathouse","Noto Sans","Segoe UI",sans-serif;`;

    const content = document.createElement('div');
    content.style.cssText = `background:white; padding:32px; border-radius:12px; width:450px; max-width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.3); position:relative; max-height:90vh; overflow-y:auto;`;

    const headerWrapper = document.createElement('div');
    headerWrapper.style.cssText = 'display:flex; align-items:center; gap:12px; margin-bottom:24px;';
    const orangeIcon = document.createElement('img');
    orangeIcon.src = browser.runtime.getURL('icons/icon_orange.svg');
    orangeIcon.style.cssText = 'width:24px; height:24px;';
    const title = document.createElement('h2');
    title.textContent = STRINGS.UI.SETTINGS_TITLE;
    title.style.cssText = 'margin:0; font-size:24px; color:#333;';
    headerWrapper.appendChild(orangeIcon); headerWrapper.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `position:absolute; top:16px; right:16px; background:none; border:none; font-size:24px; cursor:pointer; color:#999; z-index:10001;`;
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); modal.style.display = 'none'; });

    const createApiLink = (url, label = STRINGS.SETTINGS.GET_KEY) => {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank';
        a.style.cssText = 'color:#fc4c02; text-decoration:underline; display:inline-flex; align-items:center; margin-left:8px; vertical-align:middle; font-size:11px; font-weight:500;';
        a.innerHTML = `<span style="margin-right:4px;">${label}</span><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;
        return a;
    };

    const instructions = document.createElement('div');
    instructions.id = 'moremaps-api-instructions';
    instructions.style.cssText = 'display:none; background:#fff5f2; border:1px solid #ffd9c9; border-radius:8px; padding:12px 14px; margin-bottom:16px;';
    instructions.innerHTML = `<div style="font-weight:700; color:#333; font-size:13px; margin-bottom:4px;">${STRINGS.SETTINGS.INSTRUCTIONS_TITLE}</div><div style="font-size:12px; color:#666;">${STRINGS.SETTINGS.INSTRUCTIONS_TEXT}</div>`;

    const apiKeysExplainer = document.createElement('p');
    apiKeysExplainer.style.cssText = 'font-size:12px; color:#666; margin:0 0 16px 0; line-height:1.5;';
    apiKeysExplainer.innerHTML = STRINGS.SETTINGS.API_KEYS_EXPLAINER;

    const makeField = (labelText, storageKey, placeholder, link) => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; margin-bottom:8px; font-weight:600; text-align:left; font-size:13px; color:#333; width:100%;';
        label.innerHTML = `<span>${labelText}</span>`;
        if (link) label.appendChild(link);
        const input = document.createElement('input');
        input.id = `input-${storageKey}`; input.type = 'text'; input.placeholder = placeholder;
        input.value = localStorage.getItem(storageKey) || '';
        input.style.cssText = 'width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:6px; margin-bottom:16px; font-size:12px; font-family:monospace; box-sizing:border-box;';
        input.oninput = () => { input.style.border = '1px solid #ddd'; input.style.backgroundColor = 'white'; };
        return { label, input };
    };

    const mapy = makeField(STRINGS.SETTINGS.MAPY_LABEL, STORAGE_KEYS.MAPY_KEY, STRINGS.SETTINGS.MAPY_PLACEHOLDER, createApiLink(STRINGS.SETTINGS.API_LINKS.MAPY, STRINGS.SETTINGS.GET_KEY));
    const google = makeField(STRINGS.SETTINGS.GOOGLE_LABEL, STORAGE_KEYS.GOOGLE_KEY, STRINGS.SETTINGS.GOOGLE_PLACEHOLDER, createApiLink(STRINGS.SETTINGS.API_LINKS.GOOGLE, STRINGS.SETTINGS.GET_KEY_GOOGLE));
    const tf = makeField(STRINGS.SETTINGS.TF_LABEL, STORAGE_KEYS.TF_KEY, STRINGS.SETTINGS.TF_PLACEHOLDER, createApiLink(STRINGS.SETTINGS.API_LINKS.TF));

    const storageInfo = document.createElement('div');
    storageInfo.style.cssText = 'font-size:11px; color:#888; margin-bottom:24px; text-align:left;';
    storageInfo.textContent = STRINGS.UI.API_KEYS_NOTICE;

    const saveBtn = document.createElement('button');
    saveBtn.style.cssText = 'width:100%; padding:12px; background:#fc4c02; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:16px;';
    saveBtn.textContent = STRINGS.UI.SAVE_BUTTON;
    saveBtn.onclick = () => {
        localStorage.setItem(STORAGE_KEYS.MAPY_KEY, mapy.input.value.trim());
        localStorage.setItem(STORAGE_KEYS.GOOGLE_KEY, google.input.value.trim());
        localStorage.setItem(STORAGE_KEYS.TF_KEY, tf.input.value.trim());
        modal.style.display = 'none';
        window.postMessage({ type: 'MOREMAPS_API_KEY_UPDATED' }, '*');
    };

    const resetBtn = document.createElement('button');
    resetBtn.style.cssText = 'width:100%; padding:8px; background:transparent; color:#999; border:none; font-weight:500; cursor:pointer; font-size:12px; margin-top:12px; text-decoration:underline;';
    resetBtn.textContent = STRINGS.UI.RESET_BUTTON;
    resetBtn.onclick = () => {
        if (confirm(STRINGS.UI.DELETE_DATA_CONFIRM)) {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('moremaps_')) keys.push(k); }
            keys.forEach(k => localStorage.removeItem(k));
            window.location.reload();
        }
    };

    content.appendChild(closeBtn); content.appendChild(headerWrapper);
    content.appendChild(instructions); content.appendChild(apiKeysExplainer);
    content.appendChild(mapy.label); content.appendChild(mapy.input);
    content.appendChild(google.label); content.appendChild(google.input);
    content.appendChild(tf.label); content.appendChild(tf.input);
    content.appendChild(storageInfo); content.appendChild(saveBtn); content.appendChild(resetBtn);
    modal.appendChild(content);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    document.body.appendChild(modal);
    settingsModalInjected = true;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
const observer = new MutationObserver(() => {
    const menu = document.querySelector('[class*="MapPreferences_menuContainer"]');
    if (menu) injectIntoMenu(menu);
    createPanoramaButton();
    createSettingsButton();
    injectIntoActivitySelect();
});

function init() {
    if (!document.body) { requestAnimationFrame(init); return; }
    observer.observe(document.body, { childList: true, subtree: true });
    const menu = document.querySelector('[class*="MapPreferences_menuContainer"]');
    if (menu) injectIntoMenu(menu);
    createPanoramaButton();
    createSettingsButton();
    injectIntoActivitySelect();

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'p' && e.key !== 'P') return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        onPanoramaClick();
    });

    console.log('More Maps: UI observer started');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

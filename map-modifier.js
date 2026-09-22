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

const { MAP_OPTIONS, OSM_OPTIONS, GOOGLE_OPTIONS, STORAGE_KEYS, STRINGS, SELECTORS } = MoreMapsConfig;

const ORANGE = '#fc4c02';
// Start at the favorite map: inject.js applies it on page load. Without one,
// the engine shows Strava's own map (the last-used map isn't re-applied across
// reloads), so pre-selecting it would wrongly outline two buttons.
let activeMapId = MoreMapsConfig.getFavoriteMap();
let isPanoramaActive = false;
let panoramaButtonEl = null;

// Our provider sections, in the order they're injected. Used by both the
// route-planner popover and the activity-page <select>.
const OUR_SECTIONS = [
    { title: 'Mapy.cz', options: MAP_OPTIONS },
    { title: 'OpenStreetMap', options: OSM_OPTIONS },
    { title: 'Google Maps', options: GOOGLE_OPTIONS }
];

// Strava ships two generations of this popover (the 2026-09 redesign moved the
// option markup into its own `MapPreferenceOption_*` module and wrapped the
// sections in a scroll area). Match both, by substring — the hashes change with
// every build anyway.
const OPTION_BUTTON_SEL = '[class*="MapPreferenceOption_thumbnailButton"], [class*="MapPreferences_optionButton"]';
const SECTION_SEL = '[class*="MapPreferences_section"]';
// The section holding Strava's own base maps ("Map Styles" pre-2026-09).
const BASE_SECTION_RE = /^\s*(Map Types|Map Styles)\s*$/i;

// Detected native class names (cloned from Strava's own buttons for a native look).
const native = {
    optionButtonSel: OPTION_BUTTON_SEL,
    optionButton: 'MapPreferenceOption_thumbnailButton',
    imageContainer: 'MapPreferenceOption_imageContainer',
    image: 'MapPreferenceOption_thumbnail',
    label: '',
    labelSelected: '',
    selected: 'MapPreferenceOption_selected',
    section: 'MapPreferences_section',
    header: 'MapPreferenceSectionHeader_header',
    heading: '',
    optionsGrid: 'MapPreferences_options'
};

// Selection is spread over the button (outline) and its label (bold + orange).
function setOptionSelected(btn, selected) {
    btn.classList.toggle(native.selected, selected);
    if (!native.labelSelected) return;
    const label = btn.querySelector('[class*="_label"]');
    if (label) native.labelSelected.split(/\s+/).filter(Boolean)
        .forEach(c => label.classList.toggle(c, selected));
}

// Strava's own base maps live in one section; the other sections (Heatmaps,
// Layers, Terrain) are independent toggles that must keep their selection.
function baseSection(menu) {
    return Array.from(menu.querySelectorAll(SECTION_SEL))
        .find(s => BASE_SECTION_RE.test(headerText(s))) || null;
}

function headerText(section) {
    const header = findSectionHeader(section);
    return header ? (header.textContent || '') : '';
}

// Every button that takes part in base-map selection: Strava's own, plus ours.
function baseOptionButtons(menu) {
    const roots = Array.from(menu.querySelectorAll('[data-mm-section]'));
    const strava = baseSection(menu);
    if (strava) roots.unshift(strava);
    return roots.flatMap(r => Array.from(r.querySelectorAll(native.optionButtonSel)));
}

function clearBaseSelection(menu) {
    baseOptionButtons(menu).forEach(b => setOptionSelected(b, false));
}

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
    const requiredKey = MoreMapsConfig.requiredKeyFor(mapId);
    if (requiredKey && !localStorage.getItem(requiredKey)) {
        showSettingsModal(true, requiredKey);
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
// Favorite map (applied by inject.js on page load)
// ---------------------------------------------------------------------------
// Only our own maps can be the favorite: forcing one of Strava's map types on
// load would mean calling setMapType ourselves, which crashes Firefox's WASM.
let favoriteMapId = localStorage.getItem(STORAGE_KEYS.FAVORITE_ID) || null;

function setFavorite(mapId) {
    favoriteMapId = mapId || null;
    if (favoriteMapId) localStorage.setItem(STORAGE_KEYS.FAVORITE_ID, favoriteMapId);
    else localStorage.removeItem(STORAGE_KEYS.FAVORITE_ID);
    document.querySelectorAll('[data-mm-star]').forEach(renderStar);
    refreshActivityFavorite();
    const fav = document.getElementById('moremaps-favorite-map');
    if (fav) fav.value = favoriteMapId || '';
}

function toggleFavorite(mapId) {
    setFavorite(favoriteMapId === mapId ? null : mapId);
}

function createStarIcon(size) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('stroke', 'currentColor');
    // ~1.25px lines at 16px, like Strava's own icons.
    svg.setAttribute('stroke-width', size >= 16 ? '1.9' : '2.5');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z');
    svg.appendChild(path);
    return svg;
}

// Star badge in the corner of a popover thumbnail. It's a span, not a button:
// the thumbnail itself is already a <button>. Styled inline rather than via a
// <style> tag so the page's CSP can't strip it; hover is tracked by the parent
// option button (dataset.mmHover).
function createFavoriteStar(mapId) {
    const star = document.createElement('span');
    star.dataset.mmStar = mapId;
    star.setAttribute('role', 'button');
    star.tabIndex = 0;
    star.style.cssText = 'position:absolute; top:3px; right:3px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:50%; cursor:pointer; transition:opacity 120ms ease; box-shadow:0 1px 2px rgba(0,0,0,0.3);';
    star.appendChild(createStarIcon(12));
    const onToggle = (e) => {
        // Don't let the click reach the option button (that would switch maps).
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(mapId);
    };
    star.addEventListener('click', onToggle);
    star.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') onToggle(e);
    });
    star.addEventListener('focus', () => renderStar(star));
    star.addEventListener('blur', () => renderStar(star));
    renderStar(star);
    return star;
}

function renderStar(star) {
    const fav = star.dataset.mmStar === favoriteMapId;
    const btn = star.closest('[data-mm-map-id]');
    const visible = fav || document.activeElement === star || (btn && btn.dataset.mmHover === '1');
    star.style.opacity = visible ? '1' : '0';
    star.style.background = fav ? '#fff' : 'rgba(0,0,0,0.5)';
    star.style.color = fav ? ORANGE : '#fff';
    star.querySelector('svg').setAttribute('fill', fav ? 'currentColor' : 'none');
    star.title = fav ? STRINGS.UI.FAVORITE_REMOVE : STRINGS.UI.FAVORITE_ADD;
    star.setAttribute('aria-label', star.title);
    star.setAttribute('aria-pressed', String(fav));
}

// ---------------------------------------------------------------------------
// Native popover injection (Strava's "Change map style" menu)
// ---------------------------------------------------------------------------
function detectNativeClasses(menu) {
    const buttons = Array.from(menu.querySelectorAll(OPTION_BUTTON_SEL));
    const btn = buttons[0];
    if (btn) {
        native.optionButton = firstClassContaining(btn, 'thumbnailButton')
            || firstClassContaining(btn, 'optionButton')
            || native.optionButton;
        native.optionButtonSel = `[class*="${native.optionButton}"]`;
        const imgWrap = btn.querySelector(`[class*="imageContainer"]`);
        if (imgWrap) native.imageContainer = classListString(imgWrap) || native.imageContainer;
        const img = btn.querySelector('img');
        if (img && img.className) native.image = img.className;

        // Selection styling sits on both the button and its label, and only
        // exists on a currently-selected option — which isn't necessarily the
        // first one. Take the base label classes from an unselected option so
        // we don't bake the selected look into every option we create, then
        // derive the selected-only extras by diffing the two.
        const isSel = b => Array.from(b.classList).some(isSelectedClass);
        const selBtn = buttons.find(isSel);
        const plain = buttons.find(b => !isSel(b));
        const plainLabel = (plain || btn).querySelector('[class*="_label"]');
        if (plainLabel && plainLabel.className) native.label = classListString(plainLabel);
        if (selBtn) {
            native.selected = Array.from(selBtn.classList).find(isSelectedClass);
            const selLabel = selBtn.querySelector('[class*="_label"]');
            if (selLabel && plainLabel) {
                const base = new Set(plainLabel.classList);
                native.labelSelected = Array.from(selLabel.classList).filter(c => !base.has(c)).join(' ');
            }
        }
    }
    const grid = menu.querySelector(`[class*="${native.optionsGrid}"]`);
    if (grid) native.optionsGrid = classListString(grid);
    const section = menu.querySelector(SECTION_SEL);
    if (section) {
        native.section = classListString(section);
        const header = findSectionHeader(section);
        if (header) {
            native.header = classListString(header);
            const span = header.querySelector('span, div');
            if (span && span.className) native.heading = span.className;
        }
    }
}

// `selected` on the option button itself — never the label's `selectedLabel`.
function isSelectedClass(c) {
    return /selected/i.test(c) && !/label/i.test(c);
}

// Post-2026-09 the header is its own module (`MapPreferenceSectionHeader_header`);
// before that it was `MapPreferences_header`. Either way it's the section's own
// header child — and never the popover's `MapPreferences_panelHeader` title row.
function findSectionHeader(section) {
    return Array.from(section.children)
        .find(el => /header/i.test(classListString(el)) && !/panelHeader/i.test(classListString(el))) || null;
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

    const imgWrap = document.createElement('div');
    imgWrap.className = native.imageContainer;
    const img = document.createElement('img');
    img.className = native.image;
    img.alt = opt.label;
    img.src = browser.runtime.getURL(opt.img);
    img.style.objectFit = 'cover';
    imgWrap.appendChild(img);
    imgWrap.style.position = 'relative';
    const star = createFavoriteStar(opt.id);
    imgWrap.appendChild(star);
    const setHover = (on) => { btn.dataset.mmHover = on ? '1' : ''; renderStar(star); };
    btn.addEventListener('mouseenter', () => setHover(true));
    btn.addEventListener('mouseleave', () => setHover(false));

    const label = document.createElement('div');
    if (native.label) label.className = native.label;
    label.textContent = opt.label;

    btn.appendChild(imgWrap);
    btn.appendChild(label);
    if (activeMapId === opt.id) setOptionSelected(btn, true);

    btn.addEventListener('click', () => {
        // Exclusive selection across the whole menu (native + ours).
        const menu = btn.closest(`[class*="MapPreferences_menuContainer"]`) || document;
        clearBaseSelection(menu);
        setOptionSelected(btn, true);
        triggerMapSwitch(opt.id);
    });
    return btn;
}

// ---------------------------------------------------------------------------
// Collapsed section state (issue #1: 11 options made the popover overflow)
// ---------------------------------------------------------------------------
let collapsedSections = null;

function collapsedSet() {
    if (collapsedSections) return collapsedSections;
    let stored = null;
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.COLLAPSED_SECTIONS));
        if (Array.isArray(raw)) stored = raw;
    } catch (e) { /* corrupt value — fall back to the default */ }
    // Default: everything collapsed except the section holding the active map
    // (on a fresh load that's strava-default, so all three start collapsed).
    if (!stored) {
        stored = OUR_SECTIONS
            .filter(s => !s.options.some(o => o.id === activeMapId))
            .map(s => s.title);
    }
    collapsedSections = new Set(stored);
    return collapsedSections;
}

function setSectionCollapsed(title, collapsed) {
    const set = collapsedSet();
    if (collapsed) set.add(title); else set.delete(title);
    localStorage.setItem(STORAGE_KEYS.COLLAPSED_SECTIONS, JSON.stringify([...set]));
}

function createChevron() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '3');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.cssText = 'flex:none; opacity:0.6; transition:transform 120ms ease;';
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', '6 9 12 15 18 9');
    svg.appendChild(poly);
    return svg;
}

function createSection(title, options) {
    const section = document.createElement('div');
    section.className = native.section;
    section.dataset.mmSection = title;

    const header = document.createElement('div');
    header.className = native.header;
    header.style.cssText = 'display:flex; align-items:center;';
    const heading = document.createElement('span');
    if (native.heading) heading.className = native.heading;
    heading.textContent = title;
    const chevron = createChevron();
    // Hit area hugs the label + chevron rather than the full header row, so a
    // stray click next to the title doesn't collapse the section.
    const hit = document.createElement('span');
    hit.style.cssText = 'display:inline-flex; align-items:center; gap:6px; cursor:pointer; user-select:none;';
    hit.setAttribute('role', 'button');
    hit.tabIndex = 0;
    hit.appendChild(heading);
    hit.appendChild(chevron);
    header.appendChild(hit);

    const grid = document.createElement('div');
    grid.className = native.optionsGrid;
    options.forEach(opt => grid.appendChild(createOptionButton(opt)));

    let collapsed = collapsedSet().has(title);
    const render = () => {
        grid.style.display = collapsed ? 'none' : '';
        chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
        hit.setAttribute('aria-expanded', String(!collapsed));
    };
    const toggle = () => {
        collapsed = !collapsed;
        setSectionCollapsed(title, collapsed);
        render();
        refitOpenMenu();
    };
    render();
    hit.addEventListener('click', toggle);
    hit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    section.appendChild(header);
    section.appendChild(grid);
    return section;
}

// Cap the popover to the free space inside the map: from the edge it is
// anchored to, up to the map's opposite edge, while staying clear of Strava's
// own map overlays (the search/filter row and the zoom + location controls).
// Called on injection, on resize, and whenever a section is toggled.
const MENU_GAP = 12;
const MENU_MIN_HEIGHT = 180;
// Probe height: small enough that the popover always sits at its natural
// placement, so its anchored edge isn't distorted by Strava's own clamping.
const MENU_PROBE_HEIGHT = 120;

// The vertical band of the map the popover may occupy.
function safeMapBand(menu) {
    const mapEl = document.querySelector(SELECTORS.MAP_CONTAINER);
    const map = mapEl
        ? mapEl.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight, height: window.innerHeight };
    let top = map.top;
    document.querySelectorAll('[class*="MapNav_"], [class*="ControlButton_container"]').forEach(el => {
        if (menu.contains(el)) return;
        const r = el.getBoundingClientRect();
        // Only the small overlays sitting in the map's upper half push us down.
        if (!r.height || r.height > map.height / 3) return;
        if (r.top > map.top + map.height / 2) return;
        if (r.bottom > top) top = r.bottom;
    });
    return {
        top: Math.min(top + MENU_GAP, map.bottom),
        bottom: map.bottom - MENU_GAP
    };
}

function fitMenuToMap(menu) {
    // Since the 2026-09 redesign the popover has its own scroll area under a
    // sticky title row; then we only cap the outer height and let Strava's
    // scroller do the scrolling. Older builds scroll the container itself.
    const scrollArea = menu.querySelector('[class*="MapPreferences_scrollArea"]');
    if (scrollArea) {
        scrollArea.style.minHeight = '0';
        scrollArea.style.overflowY = 'auto';
        scrollArea.style.overscrollBehavior = 'contain';
    } else {
        menu.style.overflowY = 'auto';
        menu.style.overscrollBehavior = 'contain';
    }

    const band = safeMapBand(menu);
    // Measure at the probe height first: a tall popover gets shifted around by
    // Strava's positioning, which would hide where it's actually anchored.
    menu.style.maxHeight = MENU_PROBE_HEIGHT + 'px';
    const r = menu.getBoundingClientRect();
    const bottomAnchored = Math.abs(band.bottom - r.bottom) <= Math.abs(r.top - band.top);
    const available = bottomAnchored ? r.bottom - band.top : band.bottom - r.top;
    menu.style.maxHeight = Math.max(MENU_MIN_HEIGHT, Math.round(available)) + 'px';
}

function refitOpenMenu() {
    const menu = document.querySelector(`[class*="MapPreferences_menuContainer"]`);
    if (menu && menu.querySelector('[data-mm-section]')) fitMenuToMap(menu);
}

window.addEventListener('resize', refitOpenMenu);

function injectIntoMenu(menu) {
    if (menu.querySelector('[data-mm-section]')) return; // already injected
    detectNativeClasses(menu);

    // Attach reset behaviour to Strava's own base-map buttons only (not the
    // Heatmaps/Layers/Terrain overlays, which shouldn't clear our base map).
    const stravaBase = baseSection(menu);
    const nativeStyleBtns = (stravaBase || menu).querySelectorAll(native.optionButtonSel);
    nativeStyleBtns.forEach(btn => {
        if (btn.dataset.mmMapId || btn.dataset.mmReset) return;
        btn.dataset.mmReset = '1';
        btn.addEventListener('click', () => {
            // Make the clicked native style the sole selected button (React won't
            // re-mark it when re-clicking the already-active style).
            clearBaseSelection(menu);
            setOptionSelected(btn, true);
            clearToStrava();
        });
    });

    // Insert our sections after Strava's base-map section. Since the 2026-09
    // redesign the sections sit inside a scroll area rather than directly in
    // the menu container, so insert relative to the section, not the menu.
    const anchorSection = stravaBase || menu.querySelector(SECTION_SEL);
    const sections = OUR_SECTIONS.map(s => createSection(s.title, s.options));
    if (anchorSection) {
        anchorSection.after(...sections);
    } else {
        const scrollArea = menu.querySelector('[class*="MapPreferences_scrollArea"]') || menu;
        sections.forEach(s => scrollArea.appendChild(s));
    }

    // Our sections make the popover taller than Strava ever designed for, so
    // cap it to the map area and let it scroll (issue #1). Re-fit on the next
    // frame too: at mount time Strava hasn't finished positioning the popover.
    fitMenuToMap(menu);
    requestAnimationFrame(() => { if (menu.isConnected) fitMenuToMap(menu); });

    // When a custom provider is active, Strava still marks its own (unchanged)
    // style button as selected — clear it so only our button is outlined.
    if (activeMapId !== 'strava-default') {
        baseOptionButtons(menu).forEach(b => {
            if (!b.dataset.mmMapId) setOptionSelected(b, false);
        });
    }
}

// ---------------------------------------------------------------------------
// Panorama toggle + provider switcher, placed under "Find my location"
// ---------------------------------------------------------------------------
// Find a native map control to sit next to and clone the styling from. Strava
// moves these around between redesigns, so anchor on the generic
// `ControlButton_*` markup and only prefer "find my location" when it's there.
function findControlAnchor() {
    const findMe = document.querySelector('[class*="MapViewControls_findMe"]');
    const btn = (findMe && findMe.closest('[class*="ControlButton_controlButton"]'))
        || document.querySelector(`${SELECTORS.UI_CONTROLS_TOP_LEFT} [class*="ControlButton_controlButton"]`)
        || document.querySelector('[class*="ControlButton_controlButton"]');
    if (!btn) return null;
    const group = btn.closest('[class*="ControlButton_controlGroup"]');
    // The column stacks the native groups; our group goes beside that column,
    // not inside it — a wider child would stretch the native buttons.
    const column = btn.closest('[class*="ControlButton_container"]') || group || btn;
    const region = column.parentElement;
    if (!region) return null;
    return { btn, group, region };
}

function createPanoramaButton() {
    const anchor = findControlAnchor();
    if (!anchor) return;
    const { btn: findMeBtn, group: findMeGroup, region: topLeft } = anchor;

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
    // Beside the native controls when they're laid out in a row, below them
    // when they're stacked.
    const stacked = /column/.test(getComputedStyle(topLeft).flexDirection);
    const offset = stacked ? 'margin-top:10px' : 'margin-left:10px';
    group.style.cssText = `align-self:flex-start; ${offset}; height:${h}px; display:flex; flex-direction:row; align-items:stretch; overflow:hidden; background:#fff; border-radius:${radius}; box-shadow:${shadow};`;

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
    if (!sel) return;
    // React may re-render the select's surroundings, so re-check the star
    // button on every pass, not only on first injection.
    ensureActivityFavoriteButton(sel);
    if (sel.querySelector('optgroup[data-mm]')) return;

    const addGroup = (label, options) => {
        const g = document.createElement('optgroup');
        g.label = label;
        g.setAttribute('data-mm', '1');
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = 'mm:' + opt.id;
            o.dataset.mmLabel = opt.label;
            o.textContent = opt.label;
            g.appendChild(o);
        });
        sel.appendChild(g);
    };
    OUR_SECTIONS.forEach(s => addGroup(s.title, s.options));

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
            refreshActivityFavorite();
        }, true);
    }

    // Reflect an already-active custom provider in the select.
    if (activeMapId !== 'strava-default') {
        const val = 'mm:' + activeMapId;
        if ([...sel.options].some(o => o.value === val)) sel.value = val;
    }
    refreshActivityFavorite();
}

// A <select> can't hold a star per option, so the activity page gets a star
// toggle next to the dropdown, acting on the currently selected map. It sits
// in the map's top-right control row beside "Create Route" / "GPX", and clones
// the icon-only fullscreen button's classes to look native.
function ensureActivityFavoriteButton(sel) {
    if (document.getElementById('moremaps-activity-favorite')) return;
    const native = document.querySelector('[data-testid="fullscreen-toggle-button"]')
        || document.querySelector('[data-testid="gpx-download-button"]');
    const btn = document.createElement('button');
    btn.id = 'moremaps-activity-favorite';
    btn.type = 'button';
    btn.className = native ? native.className : '';
    if (!native) {
        btn.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; width:29px; height:29px; padding:0; background:#fff; border:none; border-radius:4px;';
    }
    btn.appendChild(createStarIcon(16));
    btn.addEventListener('click', () => {
        const v = sel.value;
        if (v && v.indexOf('mm:') === 0) toggleFavorite(v.slice(3));
    });
    (sel.closest('[class*="MapTypeControl--mapTypeControl"]') || sel).after(btn);
    refreshActivityFavorite();
}

function refreshActivityFavorite() {
    const sel = document.querySelector('select[class*="MapTypeControl--select"]');
    if (!sel) return;
    sel.querySelectorAll('optgroup[data-mm] option').forEach(o => {
        const text = (o.value.slice(3) === favoriteMapId ? '★ ' : '') + o.dataset.mmLabel;
        if (o.textContent !== text) o.textContent = text;
    });
    const btn = document.getElementById('moremaps-activity-favorite');
    if (!btn) return;
    const current = sel.value && sel.value.indexOf('mm:') === 0 ? sel.value.slice(3) : null;
    const fav = current !== null && current === favoriteMapId;
    btn.disabled = current === null;
    btn.style.opacity = current === null ? '0.4' : '1';
    btn.style.cursor = current === null ? 'default' : '';
    btn.style.color = fav ? ORANGE : '';
    btn.querySelector('svg').setAttribute('fill', fav ? 'currentColor' : 'none');
    btn.title = current === null ? STRINGS.UI.FAVORITE_UNAVAILABLE
        : fav ? STRINGS.UI.FAVORITE_REMOVE : STRINGS.UI.FAVORITE_ADD;
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(fav));
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
    const fav = document.getElementById('moremaps-favorite-map');
    if (fav) fav.value = favoriteMapId || '';
    if (fav && fav.selectedIndex < 0) fav.value = '';
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

    // Favorite map: applied automatically whenever a Strava map loads.
    const favLabel = document.createElement('label');
    favLabel.htmlFor = 'moremaps-favorite-map';
    favLabel.style.cssText = 'display:block; margin:8px 0 4px; font-weight:600; text-align:left; font-size:13px; color:#333;';
    favLabel.textContent = STRINGS.SETTINGS.FAVORITE_LABEL;
    const favExplainer = document.createElement('p');
    favExplainer.style.cssText = 'font-size:12px; color:#666; margin:0 0 8px 0; line-height:1.5;';
    favExplainer.textContent = STRINGS.SETTINGS.FAVORITE_EXPLAINER;
    const favSelect = document.createElement('select');
    favSelect.id = 'moremaps-favorite-map';
    favSelect.style.cssText = 'width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:6px; margin-bottom:16px; font-size:13px; background:white; color:#333; box-sizing:border-box; cursor:pointer;';
    const stravaOpt = document.createElement('option');
    stravaOpt.value = '';
    stravaOpt.textContent = STRINGS.SETTINGS.FAVORITE_STRAVA;
    favSelect.appendChild(stravaOpt);
    OUR_SECTIONS.forEach(s => {
        const g = document.createElement('optgroup');
        g.label = s.title;
        s.options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.id;
            o.textContent = `${s.title} ${opt.label}`;
            g.appendChild(o);
        });
        favSelect.appendChild(g);
    });

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
        setFavorite(favSelect.value);
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
    content.appendChild(favLabel); content.appendChild(favExplainer); content.appendChild(favSelect);
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

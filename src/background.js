/**
 * More Maps for Strava - Background script
 *
 * Fetches Zwift's world images for the Zwift maps. cdn.zwift.com sends no CORS
 * headers, so neither the page nor (in Chrome) the content script can read
 * them; only the extension itself can, with the optional host permission the
 * user grants in zwift-permission.html. Each user's browser downloads the
 * image from Zwift; the extension doesn't bundle or redistribute it.
 */
const api = globalThis.browser || globalThis.chrome;

const ZWIFT_ORIGINS = ['https://cdn.zwift.com/*'];
const ZWIFT_IMAGE_PREFIX = 'https://cdn.zwift.com/static/images/maps/';

// Runtime messages can't carry binary data in Chrome, so the image travels as base64.
function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

async function fetchZwiftImage(url) {
    if (!url.startsWith(ZWIFT_IMAGE_PREFIX)) throw new Error('Not a Zwift map image');
    if (!await api.permissions.contains({ origins: ZWIFT_ORIGINS })) throw new Error('permission');
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return toBase64(await res.arrayBuffer());
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return false;

    if (msg.type === 'zwift-permission-check') {
        api.permissions.contains({ origins: ZWIFT_ORIGINS }).then(sendResponse, () => sendResponse(false));
        return true;
    }
    if (msg.type === 'zwift-permission-request') {
        // permissions.request() needs a user gesture on an extension page, which a
        // content script message doesn't carry: open a small window to ask.
        const tab = sender.tab ? sender.tab.id : '';
        api.windows.create({
            url: api.runtime.getURL(`zwift-permission.html?tab=${tab}`),
            type: 'popup',
            width: 460,
            height: 340
        });
        return false;
    }
    if (msg.type === 'zwift-image') {
        fetchZwiftImage(String(msg.url)).then(
            (data) => sendResponse({ data }),
            (err) => sendResponse({ error: String(err && err.message || err) })
        );
        return true;
    }
    return false;
});

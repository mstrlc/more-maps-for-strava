// Asks for the cdn.zwift.com host permission (see background.js) and reports
// the answer to the Strava tab that asked. permissions.request() must run
// directly in the click handler, or the browser rejects it.
(function () {
    const api = globalThis.browser || globalThis.chrome;
    const tabId = parseInt(new URLSearchParams(location.search).get('tab'), 10);

    const finish = (granted) => {
        const done = () => window.close();
        if (!Number.isInteger(tabId)) { done(); return; }
        Promise.resolve(api.tabs.sendMessage(tabId, { type: 'zwift-permission-result', granted }))
            .catch(() => {})
            .finally(done);
    };

    document.getElementById('allow').addEventListener('click', () => {
        api.permissions.request({ origins: ['https://cdn.zwift.com/*'] }).then(finish, () => finish(false));
    });
    document.getElementById('cancel').addEventListener('click', () => finish(false));
})();

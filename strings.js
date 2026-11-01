/**
 * More Maps for Strava - Strings (English, with Czech and Slovak translations)
 *
 * This file centralises all user‑visible text strings.
 */

if (typeof MoreMapsConfig !== 'undefined') {
    MoreMapsConfig.STRINGS = {
        UI: {
            PANORAMA_TOOLTIP: 'Panorama Mode',
            SETTINGS_LABEL: 'More Maps Settings',
            SETTINGS_TITLE: 'More Maps Settings',
            API_KEYS_NOTICE: "API keys are stored exclusively in your browser's local storage and never leave your machine.",
            SAVE_BUTTON: 'Save Settings',
            RESET_BUTTON: 'Delete All Extension Data',
            DELETE_DATA_CONFIRM: 'Are you sure you want to delete all extension data? This will remove all API keys and reset all settings. This action cannot be undone.',
            STYLING_HEADER: 'Map Styling',
            STYLING_EXPLAINER: 'Applies to More Maps layers only.',
            BRIGHTNESS_LABEL: 'Brightness',
            SATURATION_LABEL: 'Saturation',
            STYLING_RESET: 'Reset',
            STYLING_BADGE_TOOLTIP: 'Map styling is on. Click to adjust.',
            STYLING_BADGE_RESET: 'Reset map styling',
            FAVORITE_ADD: 'Set as favorite map',
            FAVORITE_REMOVE: 'Remove favorite map',
            FAVORITE_UNAVAILABLE: 'Pick a More Maps layer to set it as your favorite',
            ZWIFT_NAV_LABEL: 'Zwift Worlds',
            ZWIFT_PANEL_HINT: 'Jump to a world. Its map is drawn where Zwift places it on the real globe.',
            ZWIFT_FICTIONAL: 'Zwift islands',
            ZWIFT_REAL: 'Real-world cities',
            ZWIFT_HERE: 'You are here',
            ZWIFT_ROUTES: 'Routes on ZwiftMap',
            ZWIFT_PROMPT_TITLE: 'Do you ride Zwift?',
            ZWIFT_PROMPT_TEXT: "More Maps can show Zwift's worlds on Strava's maps, from Watopia to London, right where your virtual rides are.",
            ZWIFT_PROMPT_ENABLE: 'Show Zwift worlds',
            PROMPT_DISMISS: 'No thanks',
            PROMPT_CLOSE: 'Close',
            ZWIFT_ACTIVITY_TITLE: 'Ridden in Zwift',
            ZWIFT_ACTIVITY_TEXT: "This activity was recorded in Zwift. Show it on Zwift's map of the world it was ridden in?",
            ZWIFT_ACTIVITY_ENABLE: 'Show Zwift map',
            REVIEW_PROMPT_TITLE: 'Enjoying More Maps?',
            REVIEW_PROMPT_TEXT_CHROME: 'A quick rating on the Chrome Web Store helps other riders find it. It takes a few seconds.',
            REVIEW_PROMPT_TEXT_FIREFOX: 'A quick rating on Firefox Add-ons helps other riders find it. It takes a few seconds.',
            REVIEW_PROMPT_ACCEPT: 'Rate More Maps'
        },
        PANORAMA: {
            CLOSE_TOOLTIP: 'Close Panorama',
            PROVIDER_SELECT: 'Panorama provider',
            NO_MAPY_HERE: 'No Mapy.com panorama found here.',
            NO_GOOGLE_HERE: 'No Google Street View found here.',
            LOAD_ERROR: 'Error loading panorama'
        },
        SETTINGS: {
            INSTRUCTIONS_TITLE: 'A free API key is needed',
            INSTRUCTIONS_TEXT: 'Takes about a minute — create a free account and paste your key below.',
            MAPY_LABEL: 'Mapy.com API key',
            GOOGLE_LABEL: 'Google Maps API key',
            TF_LABEL: 'Thunderforest API key',
            MAPY_PLACEHOLDER: 'Paste your Mapy.com API key here...',
            GOOGLE_PLACEHOLDER: 'Paste your Google Maps API key here...',
            TF_PLACEHOLDER: 'Paste your Thunderforest API key here...',
            PROVIDER_MAPY: 'Mapy.com',
            PROVIDER_GOOGLE: 'Google Street View',
            API_KEYS_HEADER: 'API keys',
            API_KEYS_EXPLAINER: 'To keep this extension free, each user provides their own API keys. Providers charge per request, so the key needs to be linked to your account. The free tiers are generous — <strong>no credit card required</strong>, and <strong>personal use won\'t cost you anything</strong>.',
            GET_KEY: 'Get free key (~1 min)',
            GET_KEY_GOOGLE: 'Get free key (~3 min)',
            TRY_PROVIDER_PREFIX: 'Try ',
            FAVORITE_LABEL: 'Favorite map',
            FAVORITE_EXPLAINER: 'Shown automatically whenever you open a Strava map. You can also set it with the star on a map in the map style menu, or next to the map dropdown on an activity page.',
            FAVORITE_STRAVA: "Strava's own map",
            ZWIFT_LABEL: 'Zwift worlds',
            ZWIFT_TOGGLE: 'Show Zwift worlds',
            ZWIFT_EXPLAINER: 'Adds a Zwift Worlds button next to this one and a Zwift section to the map style menu.',
            RATE_LINK_CHROME: 'Rate on Chrome Web Store',
            RATE_LINK_FIREFOX: 'Rate on Firefox Add-ons',
            API_LINKS: {
                MAPY: 'https://developer.mapy.com/account/projects',
                GOOGLE: 'https://console.cloud.google.com/google/maps-apis/credentials',
                TF: 'https://manage.thunderforest.com/'
            }
        },
        // Map names in the map style menu, by option id. English ones are in
        // constants.js; these replace them in a translation.
        MAP_LABELS: {}
    };

    // Czech and Slovak, for the many users from there. Only what differs from
    // English; anything missing falls back to it.
    MoreMapsConfig.TRANSLATIONS = {
        cs: {
            UI: {
                PANORAMA_TOOLTIP: 'Režim panorama',
                SETTINGS_LABEL: 'Nastavení More Maps',
                SETTINGS_TITLE: 'Nastavení More Maps',
                API_KEYS_NOTICE: 'API klíče se ukládají jen do místního úložiště vašeho prohlížeče a nikdy ho neopustí.',
                SAVE_BUTTON: 'Uložit nastavení',
                RESET_BUTTON: 'Smazat všechna data rozšíření',
                DELETE_DATA_CONFIRM: 'Opravdu chcete smazat všechna data rozšíření? Odstraní se všechny API klíče a nastavení se vrátí na výchozí. Tuto akci nelze vrátit zpět.',
                STYLING_HEADER: 'Vzhled mapy',
                STYLING_EXPLAINER: 'Platí jen pro mapy More Maps.',
                BRIGHTNESS_LABEL: 'Jas',
                SATURATION_LABEL: 'Sytost',
                STYLING_RESET: 'Výchozí',
                STYLING_BADGE_TOOLTIP: 'Vzhled mapy je upravený. Kliknutím ho změníte.',
                STYLING_BADGE_RESET: 'Vrátit výchozí vzhled mapy',
                FAVORITE_ADD: 'Nastavit jako oblíbenou mapu',
                FAVORITE_REMOVE: 'Odebrat oblíbenou mapu',
                FAVORITE_UNAVAILABLE: 'Vyberte mapu More Maps, abyste ji mohli nastavit jako oblíbenou',
                ZWIFT_NAV_LABEL: 'Světy Zwiftu',
                ZWIFT_PANEL_HINT: 'Přeskočte do některého ze světů. Jeho mapa je tam, kam ho Zwift umisťuje na skutečné zeměkouli.',
                ZWIFT_FICTIONAL: 'Ostrovy Zwiftu',
                ZWIFT_REAL: 'Skutečná města',
                ZWIFT_HERE: 'Jste tady',
                ZWIFT_ROUTES: 'Trasy na ZwiftMap',
                ZWIFT_PROMPT_TITLE: 'Jezdíte na Zwiftu?',
                ZWIFT_PROMPT_TEXT: 'More Maps umí zobrazit světy Zwiftu na mapách Stravy, od Watopie po Londýn, přesně tam, kde jezdíte virtuálně.',
                ZWIFT_PROMPT_ENABLE: 'Zobrazit světy Zwiftu',
                PROMPT_DISMISS: 'Ne, díky',
                PROMPT_CLOSE: 'Zavřít',
                ZWIFT_ACTIVITY_TITLE: 'Odjeto ve Zwiftu',
                ZWIFT_ACTIVITY_TEXT: 'Tato aktivita byla zaznamenaná ve Zwiftu. Zobrazit ji na mapě světa, ve kterém se jela?',
                ZWIFT_ACTIVITY_ENABLE: 'Zobrazit mapu Zwiftu',
                REVIEW_PROMPT_TITLE: 'Líbí se vám More Maps?',
                REVIEW_PROMPT_TEXT_CHROME: 'Krátké hodnocení v Chrome Web Store pomůže rozšíření najít dalším uživatelům. Zabere jen pár vteřin.',
                REVIEW_PROMPT_TEXT_FIREFOX: 'Krátké hodnocení v Doplňcích pro Firefox pomůže rozšíření najít dalším uživatelům. Zabere jen pár vteřin.',
                REVIEW_PROMPT_ACCEPT: 'Ohodnotit More Maps'
            },
            PANORAMA: {
                CLOSE_TOOLTIP: 'Zavřít panorama',
                PROVIDER_SELECT: 'Zdroj panoramat',
                NO_MAPY_HERE: 'Tady Mapy.com panorama nemají.',
                NO_GOOGLE_HERE: 'Tady Google Street View není.',
                LOAD_ERROR: 'Panorama se nepodařilo načíst'
            },
            SETTINGS: {
                INSTRUCTIONS_TITLE: 'Je potřeba bezplatný API klíč',
                INSTRUCTIONS_TEXT: 'Zabere asi minutu: založte si bezplatný účet a klíč vložte níže.',
                MAPY_LABEL: 'API klíč Mapy.com',
                GOOGLE_LABEL: 'API klíč Google Maps',
                TF_LABEL: 'API klíč Thunderforest',
                MAPY_PLACEHOLDER: 'Sem vložte API klíč Mapy.com...',
                GOOGLE_PLACEHOLDER: 'Sem vložte API klíč Google Maps...',
                TF_PLACEHOLDER: 'Sem vložte API klíč Thunderforest...',
                API_KEYS_HEADER: 'API klíče',
                API_KEYS_EXPLAINER: 'Aby rozšíření mohlo zůstat zdarma, používá každý vlastní API klíče. Poskytovatelé účtují za každý požadavek, proto musí být klíč propojený s vaším účtem. Bezplatné limity jsou štědré — <strong>platební karta není potřeba</strong> a <strong>při osobním používání nezaplatíte nic</strong>.',
                GET_KEY: 'Získat klíč zdarma (~1 min)',
                GET_KEY_GOOGLE: 'Získat klíč zdarma (~3 min)',
                FAVORITE_LABEL: 'Oblíbená mapa',
                FAVORITE_EXPLAINER: 'Zobrazí se automaticky pokaždé, když na Stravě otevřete mapu. Nastavit ji můžete i hvězdičkou u mapy v nabídce stylů mapy nebo vedle výběru mapy na stránce aktivity.',
                FAVORITE_STRAVA: 'Vlastní mapa Stravy',
                ZWIFT_LABEL: 'Světy Zwiftu',
                ZWIFT_TOGGLE: 'Zobrazit světy Zwiftu',
                ZWIFT_EXPLAINER: 'Přidá vedle tohoto tlačítka tlačítko Světy Zwiftu a do nabídky stylů mapy sekci Zwift.',
                RATE_LINK_CHROME: 'Ohodnotit v Chrome Web Store',
                RATE_LINK_FIREFOX: 'Ohodnotit v Doplňcích pro Firefox'
            },
            MAP_LABELS: {
                'mapycz-regular': 'Základní',
                'mapycz-outdoor': 'Turistická',
                'mapycz-winter': 'Zimní',
                'mapycz-satellite': 'Letecká',
                'osm-regular': 'Základní',
                'osm-cycle': 'Cyklomapa',
                'google-regular': 'Základní',
                'google-satellite': 'Satelitní',
                'google-terrain': 'Terén',
                'google-hybrid': 'Hybridní'
            }
        },
        sk: {
            UI: {
                PANORAMA_TOOLTIP: 'Režim panorám',
                SETTINGS_LABEL: 'Nastavenia More Maps',
                SETTINGS_TITLE: 'Nastavenia More Maps',
                API_KEYS_NOTICE: 'API kľúče sa ukladajú len do lokálneho úložiska vášho prehliadača a nikdy ho neopustia.',
                SAVE_BUTTON: 'Uložiť nastavenia',
                RESET_BUTTON: 'Vymazať všetky údaje rozšírenia',
                DELETE_DATA_CONFIRM: 'Naozaj chcete vymazať všetky údaje rozšírenia? Odstránia sa všetky API kľúče a nastavenia sa vrátia na predvolené. Túto akciu nie je možné vrátiť späť.',
                STYLING_HEADER: 'Vzhľad mapy',
                STYLING_EXPLAINER: 'Platí len pre mapy More Maps.',
                BRIGHTNESS_LABEL: 'Jas',
                SATURATION_LABEL: 'Sýtosť',
                STYLING_RESET: 'Predvolené',
                STYLING_BADGE_TOOLTIP: 'Vzhľad mapy je upravený. Kliknutím ho zmeníte.',
                STYLING_BADGE_RESET: 'Vrátiť predvolený vzhľad mapy',
                FAVORITE_ADD: 'Nastaviť ako obľúbenú mapu',
                FAVORITE_REMOVE: 'Odobrať obľúbenú mapu',
                FAVORITE_UNAVAILABLE: 'Vyberte mapu More Maps, aby ste ju mohli nastaviť ako obľúbenú',
                ZWIFT_NAV_LABEL: 'Svety Zwiftu',
                ZWIFT_PANEL_HINT: 'Preskočte do niektorého zo svetov. Jeho mapa je tam, kam ho Zwift umiestňuje na skutočnej zemeguli.',
                ZWIFT_FICTIONAL: 'Ostrovy Zwiftu',
                ZWIFT_REAL: 'Skutočné mestá',
                ZWIFT_HERE: 'Ste tu',
                ZWIFT_ROUTES: 'Trasy na ZwiftMap',
                ZWIFT_PROMPT_TITLE: 'Jazdíte na Zwifte?',
                ZWIFT_PROMPT_TEXT: 'More Maps vie zobraziť svety Zwiftu na mapách Stravy, od Watopie po Londýn, presne tam, kde jazdíte virtuálne.',
                ZWIFT_PROMPT_ENABLE: 'Zobraziť svety Zwiftu',
                PROMPT_DISMISS: 'Nie, ďakujem',
                PROMPT_CLOSE: 'Zavrieť',
                ZWIFT_ACTIVITY_TITLE: 'Odjazdené vo Zwifte',
                ZWIFT_ACTIVITY_TEXT: 'Táto aktivita bola zaznamenaná vo Zwifte. Zobraziť ju na mape sveta, v ktorom sa jazdila?',
                ZWIFT_ACTIVITY_ENABLE: 'Zobraziť mapu Zwiftu',
                REVIEW_PROMPT_TITLE: 'Páči sa vám More Maps?',
                REVIEW_PROMPT_TEXT_CHROME: 'Krátke hodnotenie v Chrome Web Store pomôže rozšírenie nájsť ďalším používateľom. Zaberie len pár sekúnd.',
                REVIEW_PROMPT_TEXT_FIREFOX: 'Krátke hodnotenie v Doplnkoch pre Firefox pomôže rozšírenie nájsť ďalším používateľom. Zaberie len pár sekúnd.',
                REVIEW_PROMPT_ACCEPT: 'Ohodnotiť More Maps'
            },
            PANORAMA: {
                CLOSE_TOOLTIP: 'Zavrieť panorámu',
                PROVIDER_SELECT: 'Zdroj panorám',
                NO_MAPY_HERE: 'Tu Mapy.com panorámu nemajú.',
                NO_GOOGLE_HERE: 'Tu Google Street View nie je.',
                LOAD_ERROR: 'Panorámu sa nepodarilo načítať'
            },
            SETTINGS: {
                INSTRUCTIONS_TITLE: 'Je potrebný bezplatný API kľúč',
                INSTRUCTIONS_TEXT: 'Zaberie asi minútu: založte si bezplatný účet a kľúč vložte nižšie.',
                MAPY_LABEL: 'API kľúč Mapy.com',
                GOOGLE_LABEL: 'API kľúč Google Maps',
                TF_LABEL: 'API kľúč Thunderforest',
                MAPY_PLACEHOLDER: 'Sem vložte API kľúč Mapy.com...',
                GOOGLE_PLACEHOLDER: 'Sem vložte API kľúč Google Maps...',
                TF_PLACEHOLDER: 'Sem vložte API kľúč Thunderforest...',
                API_KEYS_HEADER: 'API kľúče',
                API_KEYS_EXPLAINER: 'Aby rozšírenie mohlo zostať zadarmo, používa každý vlastné API kľúče. Poskytovatelia účtujú za každú požiadavku, preto musí byť kľúč prepojený s vaším účtom. Bezplatné limity sú štedré — <strong>platobná karta nie je potrebná</strong> a <strong>pri osobnom používaní nezaplatíte nič</strong>.',
                GET_KEY: 'Získať kľúč zadarmo (~1 min)',
                GET_KEY_GOOGLE: 'Získať kľúč zadarmo (~3 min)',
                FAVORITE_LABEL: 'Obľúbená mapa',
                FAVORITE_EXPLAINER: 'Zobrazí sa automaticky vždy, keď na Strave otvoríte mapu. Nastaviť ju môžete aj hviezdičkou pri mape v ponuke štýlov mapy alebo vedľa výberu mapy na stránke aktivity.',
                FAVORITE_STRAVA: 'Vlastná mapa Stravy',
                ZWIFT_LABEL: 'Svety Zwiftu',
                ZWIFT_TOGGLE: 'Zobraziť svety Zwiftu',
                ZWIFT_EXPLAINER: 'Pridá vedľa tohto tlačidla tlačidlo Svety Zwiftu a do ponuky štýlov mapy sekciu Zwift.',
                RATE_LINK_CHROME: 'Ohodnotiť v Chrome Web Store',
                RATE_LINK_FIREFOX: 'Ohodnotiť v Doplnkoch pre Firefox'
            },
            MAP_LABELS: {
                'mapycz-regular': 'Základná',
                'mapycz-outdoor': 'Turistická',
                'mapycz-winter': 'Zimná',
                'mapycz-satellite': 'Letecká',
                'osm-regular': 'Základná',
                'osm-cycle': 'Cyklomapa',
                'google-regular': 'Základná',
                'google-satellite': 'Satelitná',
                'google-terrain': 'Terén',
                'google-hybrid': 'Hybridná'
            }
        }
    };

    // Switch to the language of Strava's own UI, not the browser's: someone
    // who reads Strava in English gets More Maps in English too. Strava sets
    // <html lang> server-side ("cs", "en-US"; it has no Slovak UI yet). At
    // document_start the <html> may not be parsed yet, so the content script
    // calls this again once the body exists. Mutates STRINGS and the map
    // options in place, since scripts keep references to them.
    MoreMapsConfig.localize = function () {
        if (MoreMapsConfig.language) return;
        const lang = ((document.documentElement && document.documentElement.lang) || '').slice(0, 2).toLowerCase();
        if (!lang) return;
        MoreMapsConfig.language = lang;
        const t = MoreMapsConfig.TRANSLATIONS[lang];
        if (!t) return;
        for (const section of Object.keys(t)) Object.assign(MoreMapsConfig.STRINGS[section], t[section]);
        const { MAP_OPTIONS, OSM_OPTIONS, GOOGLE_OPTIONS, STRINGS } = MoreMapsConfig;
        for (const opt of [...MAP_OPTIONS, ...OSM_OPTIONS, ...GOOGLE_OPTIONS]) {
            if (STRINGS.MAP_LABELS[opt.id]) opt.label = STRINGS.MAP_LABELS[opt.id];
        }
    };
    MoreMapsConfig.localize();
}

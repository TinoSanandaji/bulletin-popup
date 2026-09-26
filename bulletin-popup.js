/*!
 * Bulletin – prenumerationspopup v3.0 (2026-09-25) – motor + fjärrkonfiguration
 * Fristående, inga beroenden. Laddas via en liten "loader" (bulletin-popup.loader.html) i GTM
 * eller i bulletin-web (_app); själva filen och config.json ligger på en plats Tino styr
 * (GitHub Pages). Texter, varianter, vikter, triggers och av/på ändras i config.json –
 * ingen kodrelease, ingen ny GTM-publicering.
 *
 * Konfiguration i tre lager (senare lager vinner):
 *   1. Inbyggda värden nedan (TEXT, GRAVEN, CONFIG) – används om config.json inte kan hämtas.
 *   2. config.json – URL från data-config på <script>-taggen, window.BulletinPopupConfigUrl
 *      eller CONFIG.remoteConfigUrl. Hämtas en gång per session (10 min cache), senast lyckade
 *      version sparas i localStorage som reserv. Max 3 s väntan, annars inbyggda värden.
 *   3. window.BulletinPopupConfig – inline-objekt på sidan (för test).
 *   Strängar som börjar med @ slås upp i text (t.ex. "@body"), items: "@graven" = urklippen.
 *
 * Vad den gör
 *  - Visar en popup (modal på desktop, bottom-sheet på mobil) för icke-inloggade läsare
 *    på artikelsidor när läsaren visat engagemang (2:a sidvisningen i sessionen, 45 % scroll,
 *    30 s på sidan eller exit-intent på desktop – det som inträffar först).
 *  - Fem varianter som lottas jämnt (20 % var) per besökare och sedan ligger fast för den besökaren:
 *      A_normal           text + tagline, månad + år
 *      B_utan_ar          som A men utan årsknappen
 *      C_graven           fyra avslöjanden (urklipp) + kort text, månad + år, ingen tagline
 *      D_graven_utan_ar   som C men utan årsknappen
 *      E_utan_tagline     som A men utan ”Sverige förtjänar hederlig journalistik!”
 *    Varje visning/klick/avvisning rapporteras till dataLayer (GTM/GA4), gtag och Meta Pixel (fbq)
 *    som event "bulletin_popup" med popup_variant (A_normal …), popup_action (view/click/dismiss/
 *    click_article) och popup_trigger. Jämför varianterna på klick per visning i GA4
 *    (se README) och på nya avtal i Sesamy.
 *  - Knapparna skapar en Sesamy-kassa via Bulletins befintliga backend
 *    (POST https://backend.bulletin.nu/api/sesamy/guest-checkout-url) och skickar läsaren dit.
 *    Faller tillbaka på /ny-prenumeration om anropet misslyckas.
 *  - Frekvensspärr: max 1 visning per session; "Inte just nu" = tyst 7 dagar; klick på köp = tyst 30 dagar.
 *  - Den diskreta listen efter avvisning är avstängd (barAfterDismiss) – slå på om den ska testas.
 *
 * Allt som är rimligt att ändra ligger i config.json (samma nycklar som TEXT/GRAVEN/CONFIG nedan).
 * Felsökning: window.BulletinPopup.show('C') tvingar fram variant C (bokstav eller hela nyckeln);
 * window.BulletinPopup.reset() nollställer spärrar och config-cache; ?bp_debug=1 kringgår alla
 * spärrar (även enabled:false) och triggar direkt; ?bp_variant=D väljer variant för den här
 * webbläsaren; window.BulletinPopup.source() säger varifrån konfigurationen kom.
 * Stänga av en variant efter jämförelsen: weight: 0. Stänga av hela popupen: enabled: false.
 */
(function () {
  'use strict';
  if (window.__bulletinPopupLoaded) return;
  window.__bulletinPopupLoaded = true;

  // ---- Texterna (delas av varianterna nedan) ----
  var TEXT = {
    title: 'Stärk oberoende svensk media',
    body: 'Sverige genomgår en stormig period – där mycket står på spel. Bulletin har haft det mesta öppet för alla under valrörelsen, och gör det fortfarande. De av er som har råd får gärna stötta oss, och bidra till att skifta mediebalansen.',
    // kortare brödtext i gräv-varianterna, så att urklippen får plats
    bodyShort: 'Bulletin har haft det mesta öppet för alla under valrörelsen, och gör det fortfarande. De av er som har råd får gärna stötta oss, och bidra till att skifta mediebalansen.',
    tagline: 'Sverige förtjänar hederlig journalistik!',
    month: 'Prenumerera – 139 kr/mån',
    year: 'Ett år – 1 450 kr'
  };
  // Fyra avslöjanden som ”urklipp” – rubrik + ingress i sajtens stil, som i de gamla Meta-annonserna
  var GRAVEN = [
    { title: 'Riksdagsersättare för V dömd för narkotikasmuggling', lead: 'Hassan Abadir Hassan är sedan valet förste ersättare till riksdagen för Vänsterpartiet i Jönköping. Han har tidigare dömts till ett års fängelse för narkotikasmuggling.', url: 'https://bulletin.nu/riksdagsersattare-for-v-domd-for-narkotikasmuggling' },
    { title: 'Mohamed Ali (V) går från 3 000 till 81 000 i månadslön', lead: 'Mohamed Abdukardir Ali (V), som valdes in i riksdagen i september, deklarerade motsvarande 3 000 kronor i månaden under 2024 – och ca 1 000 kr i månaden året innan.', url: 'https://bulletin.nu/mohamed-ali-v-gar-fran-3000-till-81000-i-manadslon' },
    { title: 'Miljardär försvarar skattehöjningar – betalar själv låg skatt i Sverige', lead: 'Robert Weil har gått till angrepp mot företagare som Jacob Wallenberg och Martin Lorentzon i skattedebatten. Samtidigt betalar finansmannen själv låg skatt i Sverige.', url: 'https://bulletin.nu/miljardar-forsvarar-skattehojningar-betalar-sjalv-lag-skatt-i-sverige-2' },
    { title: 'Statlig rapport innehåller misstag – ”Invandringens nettokostnad i runda tal 110 miljarder kronor per år”', lead: 'Konjunkturinstitutets uppmärksammade rapport om invandring innehåller misstag, visar Bulletins granskning. Kostnaderna för asylsökande, tolkar och sfi räknas inte med.', url: 'https://bulletin.nu/statlig-rapport-innehaller-misstag-invandringens-nettokostnad-i-runda-tal-110-miljarder-kronor-per-ar-3' }
  ];

  var CONFIG = {
    enabled: true,               // false = popupen visas inte alls (kill switch; ?bp_debug=1 kringgår)
    remoteConfigUrl: '',         // sätts av loadern via data-config; kan hårdkodas här när adressen är klar
    // ---- Produkter och priser (måste stämma med Sesamy/backend) ----
    backendUrl: 'https://backend.bulletin.nu/api/sesamy/guest-checkout-url',
    fallbackUrl: '/ny-prenumeration',
    products: {
      month: { tag: 'READER_SUBSCRIPTION_STANDARD_1_MONTH', label: '139 kr/mån', price: 139 },
      year:  { tag: 'READER_SUBSCRIPTION_STANDARD_12_MONTH', label: '1 450 kr/år', price: 1450 },
      trial: { tag: 'TRIAL_SUBSCRIPTION_3_DAY', label: 'Prova gratis i 3 dagar' }
    },
    showTrialLink: false,        // visa "eller prova gratis i 3 dagar" som textlänk
    // Rabatter används inte (beslut 24 sep 2026). Placeholders {code}/{discountText} finns kvar i fill() om det ändras.
    discountCode: '',
    discountText: '',

    // ---- Triggers ----
    pageviewsBeforeShow: 2,      // visa på 2:a sidvisningen i sessionen ...
    scrollPercent: 45,           // ... eller när läsaren scrollat 45 % av en artikel ...
    secondsOnPage: 30,           // ... eller efter 30 s på sidan ...
    exitIntent: true,            // ... eller när muspekaren lämnar fönstret uppåt (desktop)
    minDelayMs: 4000,            // aldrig tidigare än 4 s efter sidladdning
    articleOnly: true,           // bara på artikelsidor (sidor med <article> eller h1 utanför startsidan)

    // ---- Frekvens ----
    dismissDays: 7,              // "Inte just nu"/stäng → tyst i 7 dagar
    clickDays: 30,               // klick på köp → tyst i 30 dagar
    oncePerSession: true,
    barAfterDismiss: !!window.__bpTestBar, // diskret list i botten efter avvisning – av (false): vi frågar en gång och nöjer oss

    // ---- Uteslut ----
    excludePaths: [/^\/$/, /^\/ny-prenumeration/, /^\/mitt-konto/, /^\/login/, /^\/logga-in/, /^\/nyhetsbrev/,
                   /^\/kopvillkor/, /^\/integritetspolicy/, /^\/om-bulletin/, /^\/kontakta-oss/, /^\/brottskartan/,
                   /^\/kategori\//, /^\/sok/, /^\/faq/],
    excludeUtmMediums: [],       // t.ex. ['paid'] om betald trafik ska slippa popupen

    // ---- Varianter. Lottas per besökare i proportion till weight (alla 1 = 20 % var) och ligger sedan fast. ----
    // "@body" = TEXT.body osv, items: "@graven" = urklippen. secondary: '' = ingen årsknapp. tagline: '' = ingen tagline.
    // Nyckeln är det som syns som popup_variant i GA4/Meta – därför beskrivande namn.
    variants: {
      A_normal:         { name: 'Normal',               weight: 1, title: '@title', body: '@body',      tagline: '@tagline', primary: '@month', secondary: '@year' },
      B_utan_ar:        { name: 'Utan årsknapp',        weight: 1, title: '@title', body: '@body',      tagline: '@tagline', primary: '@month', secondary: '' },
      C_graven:         { name: 'Med gräven',           weight: 1, title: '@title', body: '@bodyShort', tagline: '',         primary: '@month', secondary: '@year', items: '@graven' },
      D_graven_utan_ar: { name: 'Gräven utan årsknapp', weight: 1, title: '@title', body: '@bodyShort', tagline: '',         primary: '@month', secondary: '',      items: '@graven' },
      E_utan_tagline:   { name: 'Utan tagline',         weight: 1, title: '@title', body: '@body',      tagline: '',         primary: '@month', secondary: '@year' }
    },
    bar: {
      text: 'Stärk oberoende svensk media – prenumerera för 139 kr/mån.',
      button: 'Prenumerera'
    },
    lang: 'sv',
    zIndex: 2147483000
  };

  // ------------------------------------------------------------------
  var LS = 'bulletin_popup';           // localStorage-nyckel
  var SS = 'bulletin_popup_session';   // sessionStorage-nyckel
  var debug = /[?&]bp_debug=1/.test(location.search);
  var state = { shown: false, timers: [], variant: null, trigger: null };

  function store(kind) { try { return kind === 'ls' ? window.localStorage : window.sessionStorage; } catch (e) { return null; } }
  function readJSON(kind, key) { try { var s = store(kind); var v = s && s.getItem(key); return v ? JSON.parse(v) : {}; } catch (e) { return {}; } }
  function writeJSON(kind, key, obj) { try { var s = store(kind); s && s.setItem(key, JSON.stringify(obj)); } catch (e) {} }
  function now() { return Date.now(); }
  function days(n) { return n * 864e5; }

  // ---------------- Fjärrkonfiguration (config.json) ----------------
  var SS_CFG = 'bulletin_popup_cfg';   // sessionStorage: {t, cfg}
  var LS_CFG = 'bulletin_popup_cfg';   // localStorage: senast lyckade config (reserv vid nätfel)
  var CFG_TIMEOUT_MS = 3000, CFG_CACHE_MS = 10 * 60000;
  var cfgSource = 'inbyggd';

  function configUrl() {
    var s = document.currentScript || document.querySelector('script[data-config]');
    return (s && s.getAttribute && s.getAttribute('data-config')) || window.BulletinPopupConfigUrl || CONFIG.remoteConfigUrl || '';
  }
  var remoteUrl = configUrl();

  function toRegExp(v) {
    if (v instanceof RegExp) return v;
    try { return new RegExp(String(v)); } catch (e) { return null; }
  }
  // Slår upp "@nyckel" i TEXT ("@graven" = urklippen) – vid renderingen, så att text-ändringar slår igenom överallt
  function ref(v) {
    if (typeof v !== 'string' || v.charAt(0) !== '@') return v;
    var k = v.slice(1);
    if (k === 'graven') return GRAVEN;
    return TEXT[k] !== undefined ? TEXT[k] : v;
  }
  function materialize(c) {
    var out = {};
    for (var k in c) out[k] = ref(c[k]);
    return out;
  }
  function applyConfig(cfg, source) {
    if (!cfg || typeof cfg !== 'object') return false;
    var k;
    if (cfg.text && typeof cfg.text === 'object') for (k in cfg.text) TEXT[k] = cfg.text[k];
    if (cfg.graven && cfg.graven.length) GRAVEN = cfg.graven;
    if (cfg.products && typeof cfg.products === 'object') for (k in cfg.products) CONFIG.products[k] = cfg.products[k];
    if (cfg.bar && typeof cfg.bar === 'object') for (k in cfg.bar) CONFIG.bar[k] = cfg.bar[k];
    // platta nycklar + grupperna triggers/frequency (för läsbarhet i config.json)
    var flat = ['enabled', 'backendUrl', 'fallbackUrl', 'showTrialLink', 'discountCode', 'discountText',
                'pageviewsBeforeShow', 'scrollPercent', 'secondsOnPage', 'exitIntent', 'minDelayMs', 'articleOnly',
                'dismissDays', 'clickDays', 'oncePerSession', 'barAfterDismiss', 'excludeUtmMediums', 'lang'];
    var groups = [cfg, cfg.triggers || {}, cfg.frequency || {}];
    for (var g = 0; g < groups.length; g++) for (var i = 0; i < flat.length; i++) if (groups[g][flat[i]] !== undefined) CONFIG[flat[i]] = groups[g][flat[i]];
    if (cfg.excludePaths && cfg.excludePaths.length) CONFIG.excludePaths = cfg.excludePaths.map(toRegExp).filter(Boolean);
    if (cfg.variants && typeof cfg.variants === 'object' && Object.keys(cfg.variants).length) CONFIG.variants = cfg.variants;
    cfgSource = source;
    return true;
  }
  function loadConfig(cb) {
    // 3) inline-objekt på sidan vinner alltid
    var inline = window.BulletinPopupConfig;
    if (!remoteUrl) { if (inline) applyConfig(inline, 'inline'); return cb(); }
    var finish = function (cfg, source) {
      if (cfg) applyConfig(cfg, source);
      if (inline) applyConfig(inline, 'inline');
      cb();
    };
    var cached = readJSON('ss', SS_CFG);
    if (cached.t && now() - cached.t < CFG_CACHE_MS && cached.cfg) return finish(cached.cfg, 'cache');
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; var ls = readJSON('ls', LS_CFG); finish(ls.cfg || null, ls.cfg ? 'reserv' : 'inbyggd'); } }, CFG_TIMEOUT_MS);
    var url = remoteUrl + (remoteUrl.indexOf('?') === -1 ? '?' : '&') + 'v=' + Math.floor(now() / CFG_CACHE_MS); // ny URL var 10:e minut = färsk kopia
    try {
      fetch(url, { cache: 'no-store', credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (cfg) {
          if (done) return; done = true; clearTimeout(t);
          if (!cfg || typeof cfg !== 'object') return finish(null, 'inbyggd');
          writeJSON('ss', SS_CFG, { t: now(), cfg: cfg }); writeJSON('ls', LS_CFG, { t: now(), cfg: cfg });
          finish(cfg, 'config.json');
        })
        .catch(function () { if (!done) { done = true; clearTimeout(t); var ls = readJSON('ls', LS_CFG); finish(ls.cfg || null, ls.cfg ? 'reserv' : 'inbyggd'); } });
    } catch (e) { if (!done) { done = true; clearTimeout(t); finish(null, 'inbyggd'); } }
  }

  function isExcludedPath() {
    var p = location.pathname;
    for (var i = 0; i < CONFIG.excludePaths.length; i++) if (CONFIG.excludePaths[i].test(p)) return true;
    return false;
  }
  function isArticle() {
    if (!CONFIG.articleOnly) return true;
    return !!document.querySelector('article') || (!!document.querySelector('main h1') && location.pathname !== '/');
  }
  // Inloggningsläge läses av i sidhuvudet: "Logga in" = utloggad, "Logga ut"/"Mitt konto" = inloggad,
  // inget av dem = okänt (sidhuvudet inte färdigrenderat än – Next.js hydrerar efter att GTM kört).
  // Därför avgörs det när en trigger slår till (tidigast 4 s efter sidladdning), inte vid start.
  function loginState() {
    var els = document.querySelectorAll('header a, header button, nav a, nav button, a, button');
    var sawLogin = false;
    for (var i = 0; i < els.length && i < 400; i++) {
      var t = (els[i].textContent || '').trim();
      if (/^Logga ut$|^Mitt konto$/i.test(t)) return 'in';
      if (/^Logga in$/i.test(t)) sawLogin = true;
    }
    return sawLogin ? 'out' : 'unknown';
  }
  function isLoggedIn() { return loginState() === 'in'; }
  function excludedUtm() {
    if (!CONFIG.excludeUtmMediums.length) return false;
    var m = (location.search.match(/[?&]utm_medium=([^&]+)/) || [])[1];
    return !!m && CONFIG.excludeUtmMediums.indexOf(decodeURIComponent(m)) !== -1;
  }

  // 'C' eller 'C_graven' → 'C_graven'; okänt → null
  function resolveVariant(v) {
    if (!v) return null;
    v = String(v);
    if (CONFIG.variants[v]) return v;
    var keys = Object.keys(CONFIG.variants), pre = v.toUpperCase() + '_';
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(pre) === 0) return keys[i];
    return null;
  }
  function activeVariants() {
    return Object.keys(CONFIG.variants).filter(function (k) { var w = CONFIG.variants[k].weight; return w === undefined || w > 0; });
  }
  function pickVariant() {
    var ls = readJSON('ls', LS);
    // ?bp_variant=D låser varianten i den här webbläsaren (för granskning)
    var q = resolveVariant((location.search.match(/[?&]bp_variant=([^&]+)/) || [])[1]);
    if (q) { ls.variant = q; writeJSON('ls', LS, ls); return q; }
    var keys = activeVariants();
    if (!keys.length) keys = Object.keys(CONFIG.variants);
    if (ls.variant && keys.indexOf(ls.variant) !== -1) return ls.variant;
    // lottning i proportion till weight (alla lika → jämn fördelning)
    var total = 0, i;
    for (i = 0; i < keys.length; i++) total += (CONFIG.variants[keys[i]].weight === undefined ? 1 : CONFIG.variants[keys[i]].weight);
    var r = Math.random() * total, v = keys[keys.length - 1];
    for (i = 0; i < keys.length; i++) { r -= (CONFIG.variants[keys[i]].weight === undefined ? 1 : CONFIG.variants[keys[i]].weight); if (r < 0) { v = keys[i]; break; } }
    ls.variant = v; writeJSON('ls', LS, ls);
    return v;
  }

  // Rapportering. På bulletin.nu laddas GA4 (G-RYZK42138N) via GTM och window.gtag finns inte –
  // GA4 får därför händelsen via dataLayer + en GA4-eventtagg i GTM (finns i bulletin-popup.gtm-container.json).
  // Meta Pixel (fbq) finns direkt på sidan: ett samlat event + ett per handling, så att
  // Events Manager kan visa popup_variant-fördelningen för visningar och klick var för sig.
  function track(action, extra) {
    var params = { popup_action: action, popup_variant: state.variant, popup_trigger: state.trigger, popup_page: location.pathname };
    if (extra) for (var k in extra) params[k] = extra[k];
    var payload = { event: 'bulletin_popup' };
    for (var p in params) payload[p] = params[p];
    try { window.dataLayer = window.dataLayer || []; window.dataLayer.push(payload); } catch (e) {}
    try { if (typeof window.gtag === 'function') window.gtag('event', 'bulletin_popup', params); } catch (e) {}
    try {
      if (typeof window.fbq === 'function') {
        window.fbq('trackCustom', 'BulletinPopup', params);
        var per = { view: 'BulletinPopupView', click: 'BulletinPopupClick', dismiss: 'BulletinPopupDismiss', click_article: 'BulletinPopupArticle' }[action];
        if (per) window.fbq('trackCustom', per, params);
      }
    } catch (e) {}
    if (debug) try { console.log('[BulletinPopup]', payload); } catch (e) {}
  }

  // ---------------- CSS ----------------
  var CSS = '' +
  '.bp-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:' + CONFIG.zIndex + ';display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .25s ease}' +
  '.bp-backdrop.bp-in{opacity:1}' +
  '.bp-modal{position:relative;background:#fff;color:#111;max-width:640px;width:100%;max-height:100vh;max-height:100dvh;overflow-y:auto;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;font-family:"Source Sans Pro","PT Sans",Arial,sans-serif;transform:translateY(12px);transition:transform .25s ease}' +
  '.bp-backdrop.bp-in .bp-modal{transform:none}' +
    '.bp-inner{padding:30px 40px 28px}' +
  '.bp-head{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 14px;padding-right:34px}' +
    '.bp-kicker{font-family:"Roboto Condensed","Source Sans Pro",Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#d10303}' +
  '.bp-title{font-family:"Newsreader",Georgia,serif;font-weight:700;font-size:29px;line-height:1.15;margin:0;color:#000}' +
  '.bp-body{font-family:"PT Sans","Source Sans Pro",Arial,sans-serif;font-size:19px;line-height:1.5;margin:0 0 12px;color:#222}' +
  '.bp-clips{background:#ececec;border-radius:6px;padding:12px 12px 14px;margin:0 0 16px;display:flex;flex-direction:column}' +
  '.bp-clip{display:block;background:#fff;border:1px solid #d9d9d9;box-shadow:0 8px 18px rgba(0,0,0,.16);padding:11px 16px 10px;text-decoration:none;color:#000;width:94%;transform:rotate(var(--r,0deg));position:relative}' +
  '.bp-clip:hover{z-index:2;box-shadow:0 10px 24px rgba(0,0,0,.22)}' +
  '.bp-clip-0{--r:-1.1deg;align-self:flex-start;z-index:1}' +
  '.bp-clip-1{--r:.9deg;align-self:flex-end;margin-top:-22px;z-index:2}' +
  '.bp-clip-2{--r:-.7deg;align-self:flex-start;margin-top:-22px;z-index:3}' +
  '.bp-clip-3{--r:1.1deg;align-self:flex-end;margin-top:-22px;z-index:4}' +
  '.bp-clip-h{display:block;font-family:"Newsreader",Georgia,serif;font-weight:700;font-size:20px;line-height:1.15;margin:0 0 4px;color:#000}' +
  '.bp-clip-p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-family:"PT Sans","Source Sans Pro",Arial,sans-serif;font-size:13.5px;line-height:1.35;color:#333}' +
  '.bp-clip-1 .bp-clip-p,.bp-clip-2 .bp-clip-p{-webkit-line-clamp:1}' +
  '.bp-tagline{font-family:"PT Sans","Source Sans Pro",Arial,sans-serif;font-size:19px;font-weight:700;line-height:1.5;margin:0 0 24px;color:#000}' +
  '.bp-code{display:inline-block;font-family:"Roboto Condensed",monospace;font-weight:700;background:#fff3c4;border:1px dashed #d1a900;padding:2px 8px;border-radius:4px;letter-spacing:.06em}' +
  '.bp-actions{display:flex;flex-direction:column;gap:10px}' +
  '.bp-btn{appearance:none;border:0;cursor:pointer;font-family:"Roboto Condensed","Source Sans Pro",Arial,sans-serif;font-weight:700;font-size:19px;padding:16px 20px;border-radius:4px;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px;transition:filter .15s}' +
  '.bp-btn:hover{filter:brightness(.95)}.bp-btn[disabled]{opacity:.7;cursor:progress}' +
  '.bp-primary{background:#ffcc00;color:#05569a}' +
  '.bp-secondary{background:#fff;color:#05569a;border:2px solid #05569a}' +
  '.bp-save{font-size:12px;background:#d10303;color:#fff;border-radius:3px;padding:2px 6px;letter-spacing:.04em}' +
  '.bp-links{display:flex;justify-content:space-between;align-items:center;margin-top:18px;font-size:18px;color:#444}' +
  '.bp-links a,.bp-links button{background:none;border:0;padding:6px 0;color:#444;text-decoration:underline;cursor:pointer;font:inherit;font-family:"PT Sans","Source Sans Pro",Arial,sans-serif}' +
  '.bp-close{position:absolute;top:14px;right:14px;width:40px;height:40px;border:0;background:transparent;cursor:pointer;color:#666;font-size:30px;line-height:40px;border-radius:50%}' +
  '.bp-close:hover{background:#f2f2f2;color:#000}' +
  '.bp-fine{font-size:12px;color:#777;margin-top:12px;line-height:1.4}' +
  '.bp-bar{position:fixed;left:0;right:0;bottom:0;z-index:' + (CONFIG.zIndex - 1) + ';background:#111;color:#fff;font-family:"Source Sans Pro",Arial,sans-serif;font-size:15px;display:flex;align-items:center;justify-content:center;gap:14px;padding:10px 44px 10px 16px;box-shadow:0 -6px 20px rgba(0,0,0,.25);transform:translateY(100%);transition:transform .3s ease}' +
  '.bp-bar.bp-in{transform:none}' +
  '.bp-bar .bp-btn{padding:8px 14px;font-size:15px}' +
  '.bp-bar .bp-close{top:6px;right:6px;color:#bbb}' +
  '@media (max-width:600px){.bp-backdrop{align-items:flex-end;padding:0 10px 12vh}.bp-modal{max-width:none;border-radius:14px;transform:translateY(40px)}.bp-inner{padding:22px 18px 20px}.bp-title{font-size:24px}.bp-head{gap:12px;padding-right:30px;margin-bottom:12px}.bp-body,.bp-tagline{font-size:17px}.bp-clips{padding:10px 8px 12px;margin-bottom:14px}.bp-clip{padding:8px 12px 7px;width:95%}.bp-clip-1,.bp-clip-2,.bp-clip-3{margin-top:-10px}.bp-clip-h{font-size:16px;margin:0}.bp-clip-p{display:none}.bp-body{margin-bottom:8px}.bp-btn{font-size:17px;padding:14px 18px}.bp-links{font-size:17px}.bp-bar{font-size:14px;padding:10px 40px 10px 12px;gap:10px}}' +
  '@media (prefers-reduced-motion:reduce){.bp-backdrop,.bp-modal,.bp-bar{transition:none}}';

  function injectCSS() {
    if (document.getElementById('bp-style')) return;
    var s = document.createElement('style'); s.id = 'bp-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------------- Kassa ----------------
  function goToCheckout(productKey, btn) {
    var product = CONFIG.products[productKey];
    track('click', { popup_product: productKey });
    var ls = readJSON('ls', LS); ls.quietUntil = now() + days(CONFIG.clickDays); writeJSON('ls', LS, ls);
    var ssc = readJSON('ss', SS); ssc.clicked = true; ssc.barClosed = true; writeJSON('ss', SS, ssc);
    if (btn) { btn.disabled = true; btn.textContent = 'Öppnar kassan…'; }
    var fallback = function () { location.href = CONFIG.fallbackUrl; };
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; fallback(); } }, 8000);
    try {
      fetch(CONFIG.backendUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productTag: product.tag, language: CONFIG.lang, email: null })
      }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (j) {
          if (done) return; done = true; clearTimeout(t);
          if (j && j.url) {
            try { sessionStorage.setItem('SESAMY_GUEST_CHECKOUT_ID', j.checkoutId || ''); } catch (e) {}
            location.href = j.url;
          } else fallback();
        })
        .catch(function () { if (!done) { done = true; clearTimeout(t); fallback(); } });
    } catch (e) { if (!done) { done = true; clearTimeout(t); fallback(); } }
  }

  // ---------------- Popup ----------------
  function fill(tpl) {
    return String(tpl).replace('{discountText}', CONFIG.discountText).replace('{code}', '<span class="bp-code">' + CONFIG.discountCode + '</span>');
  }
  function buildModal(v) {
    var c = materialize(CONFIG.variants[v]);
    var backdrop = document.createElement('div');
    backdrop.className = 'bp-backdrop'; backdrop.setAttribute('data-bp', '1');
    var yearBtnHtml =
        '<button type="button" class="bp-btn bp-primary" data-bp-product="month">' + c.primary + '</button>' +
        (c.secondary ? '<button type="button" class="bp-btn bp-secondary" data-bp-product="year">' + c.secondary + '</button>' : '');
    backdrop.innerHTML =
      '<div class="bp-modal" role="dialog" aria-modal="true" aria-labelledby="bp-title" aria-describedby="bp-body">' +
        '<button type="button" class="bp-close" aria-label="Stäng" data-bp-close>&times;</button>' +
        '<div class="bp-inner">' +
          '<div class="bp-head"><h2 class="bp-title" id="bp-title">' + fill(c.title) + '</h2></div>' +
          (c.kicker ? '<div class="bp-kicker">' + c.kicker + '</div>' : '') +
          (c.items && c.items.length ? '<div class="bp-clips">' + c.items.map(function (it, i) { return '<a class="bp-clip bp-clip-' + (i % 4) + '" href="' + it.url + '" data-bp-article><span class="bp-clip-h">' + it.title + '</span>' + (it.lead ? '<span class="bp-clip-p">' + it.lead + '</span>' : '') + '</a>'; }).join('') + '</div>' : '') +
          '<p class="bp-body" id="bp-body">' + fill(c.body) + '</p>' +
          (c.tagline ? '<p class="bp-tagline">' + c.tagline + '</p>' : '') +
          '<div class="bp-actions">' + yearBtnHtml + '</div>' +
          '<div class="bp-links">' +
            (CONFIG.showTrialLink ? '<button type="button" data-bp-product="trial">' + CONFIG.products.trial.label + '</button>' : '<span></span>') +
            '<button type="button" data-bp-close>Inte just nu</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return backdrop;
  }

  function showPopup(trigger, forcedVariant, loginSt) {
    if (state.shown) return;
    state.shown = true;
    clearTimers();
    state.trigger = trigger;
    state.variant = resolveVariant(forcedVariant) || pickVariant();
    injectCSS();
    var el = buildModal(state.variant);
    document.body.appendChild(el);
    var prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    setTimeout(function () { el.classList.add('bp-in'); }, 30); // setTimeout i st.f. rAF – rAF pausas i bakgrundsflikar
    var ss = readJSON('ss', SS); ss.shown = true; writeJSON('ss', SS, ss);
    track('view', loginSt === 'unknown' ? { popup_login: 'unknown' } : null);

    function close(reason) {
      el.classList.remove('bp-in');
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 250);
      if (reason !== 'click') {
        track('dismiss', { popup_reason: reason });
        var ls = readJSON('ls', LS); ls.quietUntil = now() + days(CONFIG.dismissDays); writeJSON('ls', LS, ls);
        var ss2 = readJSON('ss', SS); ss2.dismissed = true; writeJSON('ss', SS, ss2);
        if (CONFIG.barAfterDismiss) showBar();
      }
    }
    function onKey(e) { if (e.key === 'Escape') close('escape'); }
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', function (e) {
      var art = e.target.closest ? e.target.closest('[data-bp-article]') : null;
      if (art) { track('click_article', { popup_url: art.getAttribute('href') }); return; }
      var t = e.target.closest ? e.target.closest('[data-bp-close],[data-bp-product]') : null;
      if (e.target === el) { close('backdrop'); return; }
      if (!t) return;
      if (t.hasAttribute('data-bp-close')) { close(t.classList.contains('bp-close') ? 'x' : 'not-now'); return; }
      var p = t.getAttribute('data-bp-product');
      if (p) goToCheckout(p, t);
    });
    var first = el.querySelector('.bp-primary'); if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
  }

  function showBar() {
    if (document.querySelector('.bp-bar')) return;
    injectCSS();
    var bar = document.createElement('div');
    bar.className = 'bp-bar'; bar.setAttribute('role', 'complementary');
    bar.innerHTML = '<span>' + CONFIG.bar.text + '</span>' +
      '<button type="button" class="bp-btn bp-primary" data-bp-product="month">' + CONFIG.bar.button + '</button>' +
      '<button type="button" class="bp-close" aria-label="Stäng" data-bp-close>&times;</button>';
    document.body.appendChild(bar);
    setTimeout(function () { bar.classList.add('bp-in'); }, 30);
    track('bar_view');
    bar.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-bp-close],[data-bp-product]') : null;
      if (!t) return;
      if (t.hasAttribute('data-bp-close')) { bar.classList.remove('bp-in'); setTimeout(function () { bar.parentNode && bar.parentNode.removeChild(bar); }, 300); track('bar_dismiss'); var ss = readJSON('ss', SS); ss.barClosed = true; writeJSON('ss', SS, ss); return; }
      state.trigger = state.trigger || 'bar';
      goToCheckout(t.getAttribute('data-bp-product'), t);
    });
  }

  // ---------------- Triggers ----------------
  function clearTimers() { state.timers.forEach(clearTimeout); state.timers = []; }
  function scrollPct() {
    var h = document.documentElement, b = document.body;
    var total = Math.max(h.scrollHeight, b.scrollHeight) - window.innerHeight;
    return total <= 0 ? 100 : Math.round((window.pageYOffset || h.scrollTop) / total * 100);
  }
  function arm() {
    var ready = false;
    var t0 = setTimeout(function () { ready = true; }, CONFIG.minDelayMs);
    state.timers.push(t0);
    // Vid utlösning: vänta tills minDelay gått och sidhuvudet visar inloggningsläget (max 6 s extra);
    // inloggad läsare → ingen popup; okänt efter väntetiden → visa ändå (hellre det än aldrig).
    var loginTries = 0;
    function fire(trigger) {
      if (state.shown) return;
      var st = loginState();
      if (!ready || (st === 'unknown' && loginTries < 12)) { if (ready) loginTries++; var t = setTimeout(function () { fire(trigger); }, 500); state.timers.push(t); return; }
      if (st === 'in') { clearTimers(); state.shown = true; return; }
      showPopup(trigger, null, st);
    }

    // 0) ?bp_debug=1 → direkt (efter minDelay), för granskning
    if (debug) fire('debug');

    // 1) andra sidvisningen i sessionen
    var ss = readJSON('ss', SS);
    if ((ss.pv || 0) >= CONFIG.pageviewsBeforeShow) fire('pageviews');

    // 2) scrolldjup
    var onScroll = function () { if (scrollPct() >= CONFIG.scrollPercent) { window.removeEventListener('scroll', onScroll); fire('scroll'); } };
    window.addEventListener('scroll', onScroll, { passive: true });

    // 3) tid på sidan
    state.timers.push(setTimeout(function () { fire('time'); }, CONFIG.secondsOnPage * 1000));

    // 4) exit-intent (desktop)
    if (CONFIG.exitIntent && window.matchMedia('(pointer:fine)').matches) {
      var onLeave = function (e) { if (e.clientY <= 0) { document.removeEventListener('mouseout', onLeave); fire('exit'); } };
      document.addEventListener('mouseout', onLeave);
    }
  }

  function shouldRun() {
    if (debug) return true;
    if (CONFIG.enabled === false) return false;
    if (isExcludedPath()) return false;
    if (!isArticle()) return false;
    if (excludedUtm()) return false;
    var ls = readJSON('ls', LS);
    var ss = readJSON('ss', SS);
    var quiet = !!(ls.quietUntil && ls.quietUntil > now());
    if ((CONFIG.oncePerSession && ss.shown) || quiet) {
      // Popupen avvisad tidigare i sessionen → visa bara den diskreta listen (om den inte stängts)
      if (ss.dismissed && CONFIG.barAfterDismiss && !ss.barClosed && !isLoggedIn()) showBar();
      return false;
    }
    // inloggningsläget avgörs när triggern slår till (se fire) – sidhuvudet är inte alltid renderat vid start
    return true;
  }

  function init() {
    // räkna sidvisningar i sessionen (även SPA-navigering i Next.js)
    var ss = readJSON('ss', SS); ss.pv = (ss.pv || 0) + 1; writeJSON('ss', SS, ss);
    // hämta config.json (cache per session) och armera först därefter
    loadConfig(function () {
      if (debug) try { console.log('[BulletinPopup] konfiguration: ' + cfgSource, CONFIG); } catch (e) {}
      if (state.shown || !shouldRun()) return;
      arm();
    });
  }

  // Next.js byter sida utan omladdning – lyssna på history-ändringar
  (function hookHistory() {
    var push = history.pushState;
    history.pushState = function () { var r = push.apply(this, arguments); setTimeout(onRoute, 800); return r; };
    window.addEventListener('popstate', function () { setTimeout(onRoute, 800); });
    function onRoute() { clearTimers(); if (!state.shown) init(); }
  })();

  window.BulletinPopup = {
    show: function (variant) { state.shown = false; clearTimers(); showPopup('manual', variant); },
    bar: showBar,
    reset: function () { try { localStorage.removeItem(LS); sessionStorage.removeItem(SS); sessionStorage.removeItem(SS_CFG); localStorage.removeItem(LS_CFG); } catch (e) {} state.shown = false; },
    variants: function () { return Object.keys(CONFIG.variants).map(function (k) { return { key: k, name: CONFIG.variants[k].name, weight: CONFIG.variants[k].weight === undefined ? 1 : CONFIG.variants[k].weight }; }); },
    current: function () { return state.variant || readJSON('ls', LS).variant || null; },
    source: function () { return { source: cfgSource, url: remoteUrl, enabled: CONFIG.enabled !== false }; },
    reload: function (cb) { try { sessionStorage.removeItem(SS_CFG); } catch (e) {} loadConfig(cb || function () {}); },
    text: TEXT,
    config: CONFIG
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

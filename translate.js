(function() {
    const sourceLanguage = 'de';
    const storageKey = 'holstLanguage';
    const rtlLanguages = new Set(['ar', 'fa']);
    const languageList = [
        { code: 'de', label: 'Deutsch' },
        { code: 'en', label: 'English' },
        { code: 'ru', label: 'Русский' },
        { code: 'ar', label: 'العربية' },
        { code: 'tr', label: 'Türkçe' },
        { code: 'fa', label: 'فارسی' },
        { code: 'ha', label: 'Hausa' },
        { code: 'pl', label: 'Polski' },
        { code: 'fr', label: 'Français' }
    ];

    const originalText = new WeakMap();
    const originalAttributes = new WeakMap();
    let translateRequestId = 0;

    function getToggleButton() {
        return document.getElementById('google-translate-toggle');
    }

    function getLanguageMenu() {
        return document.querySelector('.language-selector-menu');
    }

    function getStoredLanguage() {
        return localStorage.getItem(storageKey) || sourceLanguage;
    }

    function updateTranslateButtonText(lang) {
        const button = getToggleButton();
        if (!button) return;
        const label = languageList.find(item => item.code === lang)?.label || 'Deutsch';
        button.textContent = label;
        button.setAttribute('aria-label', 'Sprache wechseln. Aktuell: ' + label);
    }

    function markActiveLanguage(lang) {
        document.querySelectorAll('.language-selector-item').forEach(item => {
            const isActive = item.dataset.lang === lang;
            item.classList.toggle('active', isActive);
            item.setAttribute('aria-current', isActive ? 'true' : 'false');
        });
    }

    function syncUiLanguage(lang) {
        updateTranslateButtonText(lang);
        markActiveLanguage(lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = rtlLanguages.has(lang) ? 'rtl' : 'ltr';
        localStorage.setItem(storageKey, lang);
    }

    function hideLanguageMenu() {
        const menu = getLanguageMenu();
        if (!menu) return;
        menu.classList.remove('active');
        getToggleButton()?.setAttribute('aria-expanded', 'false');
    }

    function toggleLanguageMenu() {
        const menu = getLanguageMenu();
        if (!menu) return;
        menu.classList.toggle('active');
        getToggleButton()?.setAttribute('aria-expanded', menu.classList.contains('active') ? 'true' : 'false');
    }

    function shouldSkipElement(element) {
        if (!element) return true;
        return Boolean(element.closest(
            'script, style, noscript, iframe, svg, canvas, .language-selector, #google_translate_element, .goog-te-banner-frame'
        ));
    }

    function getTextNodes() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }

    function captureOriginals() {
        getTextNodes().forEach(node => {
            if (!originalText.has(node)) originalText.set(node, node.nodeValue);
        });

        document.querySelectorAll('[placeholder], [title], [aria-label], img[alt]').forEach(element => {
            if (shouldSkipElement(element)) return;
            if (!originalAttributes.has(element)) {
                originalAttributes.set(element, {
                    placeholder: element.getAttribute('placeholder'),
                    title: element.getAttribute('title'),
                    ariaLabel: element.getAttribute('aria-label'),
                    alt: element.getAttribute('alt')
                });
            }
        });
    }

    function restoreGerman() {
        getTextNodes().forEach(node => {
            if (originalText.has(node)) node.nodeValue = originalText.get(node);
        });

        document.querySelectorAll('[placeholder], [title], [aria-label], img[alt]').forEach(element => {
            const attrs = originalAttributes.get(element);
            if (!attrs) return;
            if (attrs.placeholder !== null) element.setAttribute('placeholder', attrs.placeholder);
            if (attrs.title !== null) element.setAttribute('title', attrs.title);
            if (attrs.ariaLabel !== null) element.setAttribute('aria-label', attrs.ariaLabel);
            if (attrs.alt !== null) element.setAttribute('alt', attrs.alt);
        });
    }

    function splitIntoBatches(items, maxChars) {
        const batches = [];
        let batch = [];
        let length = 0;

        items.forEach(item => {
            const itemLength = item.text.length + 1;
            if (batch.length && length + itemLength > maxChars) {
                batches.push(batch);
                batch = [];
                length = 0;
            }
            batch.push(item);
            length += itemLength;
        });

        if (batch.length) batches.push(batch);
        return batches;
    }

    async function translateTexts(texts, targetLanguage) {
        if (!texts.length) return [];

        const separator = '\n\n[[HOLST_TRANSLATION_SPLIT]]\n\n';
        const joinedText = texts.join(separator);
        const localProxyAvailable = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const url = localProxyAvailable
            ? '/__translate?tl=' + encodeURIComponent(targetLanguage) + '&q=' + encodeURIComponent(joinedText)
            : 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
                encodeURIComponent(sourceLanguage) +
                '&tl=' + encodeURIComponent(targetLanguage) +
                '&dt=t&q=' + encodeURIComponent(joinedText);

        const response = await fetch(url);
        if (!response.ok) throw new Error('Translation request failed with status ' + response.status);

        const data = await response.json();
        const translated = (data[0] || []).map(part => part[0]).join('');
        return translated.split('[[HOLST_TRANSLATION_SPLIT]]').map(text => text.trim());
    }

    async function translatePage(targetLanguage) {
        const requestId = ++translateRequestId;
        captureOriginals();

        if (targetLanguage === sourceLanguage) {
            restoreGerman();
            syncUiLanguage(sourceLanguage);
            return;
        }

        const textItems = getTextNodes().map(node => ({
            node,
            text: originalText.get(node) || node.nodeValue
        }));

        const attrItems = [];
        originalAttributes.forEach?.(() => {});
        document.querySelectorAll('[placeholder], [title], [aria-label], img[alt]').forEach(element => {
            if (shouldSkipElement(element)) return;
            const attrs = originalAttributes.get(element);
            if (!attrs) return;
            [
                ['placeholder', attrs.placeholder],
                ['title', attrs.title],
                ['aria-label', attrs.ariaLabel],
                ['alt', attrs.alt]
            ].forEach(([name, value]) => {
                if (value && value.trim()) attrItems.push({ element, name, text: value });
            });
        });

        const allItems = [...textItems, ...attrItems];
        const batches = splitIntoBatches(allItems, 4200);

        try {
            for (const batch of batches) {
                const translations = await translateTexts(batch.map(item => item.text), targetLanguage);
                if (requestId !== translateRequestId) return;

                batch.forEach((item, index) => {
                    const translatedText = translations[index] || item.text;
                    if (item.node) item.node.nodeValue = translatedText;
                    if (item.element) item.element.setAttribute(item.name, translatedText);
                });
            }
        } catch (error) {
            console.warn('Automatic translation failed. Check browser internet access or translate.googleapis.com blocking.', error);
        }
    }

    function changeLanguage(lang) {
        hideLanguageMenu();
        syncUiLanguage(lang);
        translatePage(lang);
    }

    function buildLanguageMenu() {
        if (getLanguageMenu()) return;
        const selector = document.querySelector('.language-selector');
        if (!selector) return;

        const menu = document.createElement('div');
        menu.className = 'language-selector-menu';
        menu.setAttribute('role', 'menu');

        languageList.forEach(({ code, label }) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'language-selector-item';
            item.textContent = label;
            item.dataset.lang = code;
            item.setAttribute('role', 'menuitemradio');
            item.addEventListener('click', () => changeLanguage(code));
            menu.appendChild(item);
        });

        selector.appendChild(menu);
    }

    function initTranslate() {
        const button = getToggleButton();
        buildLanguageMenu();
        captureOriginals();

        if (button) {
            button.setAttribute('aria-haspopup', 'true');
            button.setAttribute('aria-expanded', 'false');
            button.addEventListener('click', event => {
                event.stopPropagation();
                toggleLanguageMenu();
            });
        }

        document.addEventListener('click', event => {
            if (!event.target.closest('.language-selector')) {
                hideLanguageMenu();
            }
        });

        const storedLanguage = getStoredLanguage();
        syncUiLanguage(storedLanguage);
        if (storedLanguage !== sourceLanguage) translatePage(storedLanguage);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTranslate);
    } else {
        initTranslate();
    }
})();

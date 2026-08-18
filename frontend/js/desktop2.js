document.addEventListener('DOMContentLoaded', () => {

    let zIndexCounter = 100;
    const openWindows = new Map();
    const openedApps  = new Set();
    const taskbar     = document.getElementById('taskbar');

    let currentMenu    = null;
    let currentTrigger = null;
    let windowIdSeq    = 0;
    let cascadeStep = 0;
    const CASCADE_OFFSET    = 32;
    const CASCADE_MAX_STEPS = 8;
    const $  = sel => document.querySelector(sel);
    const $$ = sel => document.querySelectorAll(sel);

    // ====================== SÉCURITÉ : helpers ======================

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    function isSafeInternalUrl(str) {
        if (typeof str !== 'string') return false;

        const cleaned = str.replace(/[\t\n\r]/g, '').trim();
        if (!cleaned) return false;

        // Bloque tout schéma d'URI (http:, https:, javascript:, data:, ...)
        if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return false;

        // Normalise les antislashs en slashs avant de tester le préfixe
        // "//" (URL protocol-relative / network-path reference).
        const slashNormalized = cleaned.replace(/\\/g, '/');
        if (slashNormalized.startsWith('//')) return false;

        return cleaned.startsWith('/');
    }

    // ====================== TAGS URL (base64url) ======================

    function slugTag(str) {
        return btoa(unescape(encodeURIComponent(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    function unslugTag(tag) {
        try {
            let b64 = tag.replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            return decodeURIComponent(escape(atob(b64)));
        } catch {
            return null;
        }
    }


    function setHash(tag) {
        if (tag) history.replaceState(null, '', `#${tag}`);
        else history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // ====================== SANDBOX IFRAMES ======================

    const defaultSandbox = 'allow-scripts allow-popups allow-forms';


    const explorerSandbox = 'allow-scripts allow-popups allow-forms allow-same-origin';


    const navigateurSandbox = 'allow-scripts allow-popups allow-forms allow-same-origin allow-popups-to-escape-sandbox';

    // ====================== ICON MAP ======================
    const iconMap = {
        'Terminal'             : '/assets/icons/terminal.png',
        'Curriculum'           : '/assets/icons/pdf.png',
        'Navigateur'           : '/assets/icons/oignon.png',
        'Explorateur'          : '/assets/icons/folder.png',
        'Gallerie'             : '/assets/icons/gallery.png',
        'Paramètres'           : '/assets/icons/parameter.png',
        'Informations systeme' : '/assets/icons/info.png',
        'À propos'             : '/assets/icons/info.png',
        'Redémarrer'           : '/assets/icons/restart.png',
        'Éteindre'             : '/assets/icons/start.png',
        'Luvix OS'             : '/assets/icons/parrot.png',
        'Luvix Engine'         : '/assets/icons/engine.png',
        'default'              : '/assets/icons/default.png'
    };

    function preloadIcons() {
        Object.values(iconMap).forEach(src => {
            if (src && src !== iconMap.default) { const i = new Image(); i.src = src; }
        });
    }

    const getIcon = (label) => {
        if (!label) return iconMap.default;
        if (iconMap[label]) return iconMap[label];
        const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        for (const [k, v] of Object.entries(iconMap))
            if (norm(k) === norm(label)) return v;
        return iconMap.default;
    };

    preloadIcons();


    const bringToFront = win => {
        win.style.zIndex = ++zIndexCounter;
        if (win.dataset.tag) setHash(win.dataset.tag);
    };

    const updateTaskbar = () => {
        taskbar.innerHTML = '';
        openWindows.forEach(win => {
            const item = document.createElement('div');
            item.className  = `taskbar-item${!win.classList.contains('minimized') ? ' active' : ''}`;
            item.textContent = win.dataset.title; // textContent : pas de risque d'injection ici
            item.onclick    = () => { win.classList.remove('minimized'); bringToFront(win); };
            taskbar.appendChild(item);
        });
    };

    // ====================== CREATE WINDOW ======================
    function createWindow(title, content, x, y, opts = {}) {

        x = x ?? 100;
        y = y ?? 80;

        const {
            isDialog    = false,
            width       = isDialog ? '460px' : '860px',
            height      = isDialog ? 'auto'  : '560px',
            centered    = true,
            resizable   = !isDialog,
            minimizable = !isDialog,
            buttons     = [],
            tag         = '',
            sandbox: sandboxOverride = null
        } = opts;

        // Fenêtre déjà ouverte → focus (et donc mise à jour du tag)
        if (openedApps.has(title)) {
            const existing = [...openWindows.values()].find(w => w.dataset.title === title);
            if (existing) { existing.classList.remove('minimized'); bringToFront(existing); }
            return existing;
        }
        openedApps.add(title);

        const win = document.createElement('div');
        win.className    = `window${isDialog ? ' dialog-window' : ''}`;
        win.dataset.title = title;
        win.dataset.tag   = tag;


        const cascadeOffset = (cascadeStep % CASCADE_MAX_STEPS) * CASCADE_OFFSET;
        cascadeStep++;

        if (centered) {
            win.style.left = `${Math.max(40, (innerWidth - (parseInt(width) || 860)) / 2) + cascadeOffset}px`;
            win.style.top  = `${(isDialog ? 120 : 80) + cascadeOffset}px`;
        } else {
            win.style.left = `${x + cascadeOffset}px`;
            win.style.top  = `${y + cascadeOffset}px`;
        }

        win.style.width = width;
        if (height !== 'auto') win.style.height = height;

        const isString = typeof content === 'string';
        const isUrl    = isString && isSafeInternalUrl(content);


        const rejectedUrl = isString && !isUrl && /^[a-z][a-z0-9+.-]*:\/\//i.test(content);

        let pathname = '';
        if (isUrl) {
            try { pathname = new URL(content, location.origin).pathname; }
            catch { pathname = content; }
        }
        const isPdf = /\.pdf$/i.test(pathname);


        const sandbox = isPdf
            ? null
            : (sandboxOverride ?? defaultSandbox);

        const safeTitle = escapeHtml(title);

        const contentHTML = isUrl
            ? `<iframe src="${content}" allowfullscreen${sandbox ? ` sandbox="${sandbox}"` : ''} referrerpolicy="no-referrer" loading="lazy"></iframe>`
            : rejectedUrl
                ? `<div class="dialog-content">Contenu externe bloqué pour raisons de sécurité.</div>`
                : `<div class="dialog-content">${content}</div>`;

        const btnHTML = (isDialog && buttons.length)
            ? `<div class="dialog-buttons">${buttons.map((b, i) =>
                `<button class="dialog-btn ${b.type || 'default'}" data-i="${i}">${escapeHtml(b.text)}</button>`
            ).join('')}</div>`
            : '';

        win.innerHTML = `
            <div class="title-bar">
                <div class="title-text">${safeTitle}</div>
                <div class="title-buttons">
                    ${minimizable ? '<button class="min-btn" title="Minimiser">─</button>' : ''}
                    ${!isDialog   ? '<button class="max-btn" title="Agrandir">□</button>'  : ''}
                    <button class="close-btn" title="Fermer">✕</button>
                </div>
            </div>
            <div class="window-content">${contentHTML}</div>
            ${btnHTML}`;

        $('#main-desktop').appendChild(win);
        openWindows.set(`win_${++windowIdSeq}`, win);

        // Dialog buttons
        win.querySelectorAll('.dialog-btn').forEach(btn => {
            btn.onclick = () => {
                const d = buttons[+btn.dataset.i];
                d?.action?.(win);
                if (!d?.keepOpen) closeWindow(win);
            };
        });

        const minBtn   = win.querySelector('.min-btn');
        const maxBtn   = win.querySelector('.max-btn');
        const closeBtn = win.querySelector('.close-btn');

        let isMaximized = false, restoreData = null;

        minBtn?.addEventListener('click', e => { e.stopPropagation(); minimizeWindow(win); });

        maxBtn?.addEventListener('click', e => {
            e.stopPropagation();
            win.classList.add('animating');
            const cleanup = () => win.classList.remove('animating');

            if (isMaximized) {
                win.classList.remove('maximized');
                maxBtn.textContent = '□';
                Object.assign(win.style, restoreData);
            } else {
                restoreData = { left: win.style.left, top: win.style.top,
                    width: win.style.width, height: win.style.height };
                win.classList.add('maximized');
                maxBtn.textContent = '❐';
            }
            isMaximized = !isMaximized;
            bringToFront(win);
            updateTaskbar();
            win.addEventListener('transitionend', cleanup, { once: true });
        });

        closeBtn.addEventListener('click', e => { e.stopPropagation(); closeWindow(win); });

        function minimizeWindow(w) {
            w.classList.add('minimizing');
            setTimeout(() => { w.classList.remove('minimizing'); w.classList.add('minimized'); updateTaskbar(); }, 280);
        }

        function closeWindow(w) {
            w.style.transition = 'transform .22s ease, opacity .22s ease';
            w.style.transform  = 'scale(0.85)';
            w.style.opacity    = '0';
            setTimeout(() => {
                w.remove();
                for (const [id, el] of openWindows) if (el === w) { openWindows.delete(id); break; }
                openedApps.delete(title);
                updateTaskbar();

                // Bureau vide → la prochaine fenêtre repart de la position
                // de base plutôt que de continuer à dériver en diagonale.
                if (openWindows.size === 0) cascadeStep = 0;


                const closedTag = w.dataset.tag;
                if (closedTag && window.location.hash.slice(1) === closedTag) {
                    const remainingTagged = [...openWindows.values()]
                        .filter(x => x.dataset.tag && !x.classList.contains('minimized'));
                    if (remainingTagged.length) {
                        const top = remainingTagged.reduce(
                            (a, b) => (+b.style.zIndex > +a.style.zIndex ? b : a)
                        );
                        setHash(top.dataset.tag);
                    } else {
                        setHash(null);
                    }
                }
            }, 230);
        }

        makeDraggable(win);
        if (resizable) makeResizable(win);
        win.addEventListener('mousedown', () => bringToFront(win));
        bringToFront(win); // met aussi à jour le tag/URL dès la création
        updateTaskbar();

        return win;
    }

    // ====================== OUVERTURE DE FICHIER ======================

    const ALLOWED_FILE_PREFIXES = ['/assets/files/', '/assets/photos/'];

    function isAllowedFilePath(path) {
        return typeof path === 'string'
            && isSafeInternalUrl(path)

            && !path.includes('..')
            && ALLOWED_FILE_PREFIXES.some(p => path.startsWith(p));
    }

    function openFile(path, extraOpts = {}) {
        if (!isAllowedFilePath(path)) {
            console.warn('openFile: chemin refusé', path);
            return;
        }


        let rawName;
        try {
            rawName = decodeURIComponent(path.split('/').pop());
        } catch {
            rawName = path.split('/').pop();
        }

        const ext     = (rawName.split('.').pop() || '').toLowerCase();
        const title   = extraOpts.title || rawName;

        const tag = extraOpts.tag || ('f-' + slugTag(path));

        let content, opts;

        if (ext === 'pdf') {
            content = path; // iframe directe, pas de sandbox (cf. commentaire dans createWindow)
            opts = { tag, width: '900px', height: '650px' };
        } else if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) {
            content = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:20px;">
                <img src="${path}" alt="${escapeHtml(rawName)}"
                     style="max-width:100%;max-height:100%;border:1px solid var(--c-border);border-radius:6px;"
                     onerror="this.replaceWith(Object.assign(document.createElement('div'),{textContent:'Aperçu indisponible',style:'color:rgba(224,255,255,.5);font-size:18px;'}))">
            </div>`;
            opts = { isDialog: true, width: '520px', height: '420px', tag };
        } else if (['md', 'txt'].includes(ext)) {
            content = `<div style="padding:16px;font-family:var(--font-mono);white-space:pre-wrap;line-height:1.5;">
                # ${escapeHtml(rawName)}<br><br>
                <span style="color:rgba(224,255,255,.5);">${escapeHtml(extraOpts.desc || 'Contenu du fichier non chargé.')}</span>
            </div>`;
            opts = { isDialog: true, width: '480px', height: 'auto', tag };
        } else {
            content = `Fichier "${escapeHtml(rawName)}" — aperçu non disponible pour le moment.`;
            opts = { isDialog: true, width: '380px', tag };
        }

        createWindow(title, content, 160, 100, { centered: false, ...opts });
    }
    window.openFile = openFile;

    // ====================== GALERIE : deep-link vers une photo précise ======================

    function isPlausibleGalleryPath(str) {
        return typeof str === 'string'
            && str.length > 0
            && str.length < 200
            && /^[a-zA-Z0-9_\-./]+$/.test(str)
            && !str.includes('..');
    }

    function openGalleryPhoto(filePath) {
        if (!isPlausibleGalleryPath(filePath)) return;

        const title = 'Gallerie';

        if (openedApps.has(title)) {

            const existing = [...openWindows.values()].find(w => w.dataset.title === title);
            if (existing) {
                existing.classList.remove('minimized');
                bringToFront(existing);
                const frame = existing.querySelector('iframe');
                frame?.contentWindow?.postMessage({ action: 'openPhoto', file: filePath }, window.location.origin);
            }
            return;
        }

        // Pas encore ouverte : galerie.html lit lui-même le hash à son
        // chargement et ouvre la bonne photo (cf. galerie.html).
        createWindow('Gallerie', `/galerie.html#photo=${encodeURIComponent(filePath)}`, 220, 120, {
            tag: 'Galerie',
            sandbox: explorerSandbox
        });
    }
    window.openGalleryPhoto = openGalleryPhoto;

    // ====================== KERNEL PANIC ======================
    window.addEventListener('message', e => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.action === 'kernelPanic') showKernelPanic(e.data.reason);
    });

    function showKernelPanic(reason = '') {

        const safeReason = reason ? escapeHtml(reason) : '';


        if (!document.getElementById('kernel-panic-style')) {
            const style = document.createElement('style');
            style.id = 'kernel-panic-style';
            style.textContent = `
            @keyframes kp-flicker-in {
                0%   { opacity: 0; transform: scale(.98); }
                15%  { opacity: .5; }
                30%  { opacity: .15; }
                45%  { opacity: 1; transform: scale(1); }
                100% { opacity: 1; }
            }
            @keyframes kp-blink {
                0%, 100% { opacity: 1; }
                50%      { opacity: .35; }
            }
            .kp-overlay { animation: kp-flicker-in .5s steps(6, end); }
            .kp-hint { animation: kp-blink 1.6s ease-in-out infinite; }
        `;
            document.head.appendChild(style);
        }

        const p = document.createElement('div');
        p.className = 'kp-overlay';
        p.style.cssText = `position:fixed;inset:0;background:#04110f;color:#cdfff5;
        font-family:'VT323',monospace;font-size:24px;padding:40px;
        display:flex;flex-direction:column;justify-content:center;align-items:center;
        z-index:999999;text-align:center;line-height:1.5;
        border:3px solid #ffb454;box-shadow:inset 0 0 90px rgba(255,180,84,.12);`;
        p.innerHTML = `
        <div style="font-size:15px;letter-spacing:3px;color:#ffb454;opacity:.8;margin-bottom:8px;">⚠ SIMULATION — AUCUN FICHIER N'A ÉTÉ SUPPRIMÉ ⚠</div>
        <h1 style="color:#ffb454;font-size:52px;margin:6px 0 20px;text-shadow:0 0 12px rgba(255,180,84,.5)">KERNEL PANIC</h1>
        <p style="font-size:28px;margin:15px 0">Tu viens vraiment de faire rm -rf / ...</p>
        <p style="color:#8de8ff;max-width:720px">Bravo champion.<br>Le portfolio entier vient de rejoindre /dev/null.</p>
        <p style="margin-top:50px;font-size:20px;color:#88ff9a">C'était sûr en fait.. C'ÉTAIT SÛR !</p>
        ${safeReason ? `<p style="margin-top:20px;font-size:15px;opacity:.5;">debug: ${safeReason}</p>` : ''}
        <p class="kp-hint" style="margin-top:70px;font-size:19px;opacity:.85;">
            Appuyez sur n'importe quelle touche pour redémarrer le système<br>
        </p>`;
        document.body.appendChild(p);
        document.addEventListener('keydown', () => location.reload(), { once: true });
        p.addEventListener('click', () => location.reload());
    }

    // ====================== DRAG ======================
    function makeDraggable(win) {
        win.querySelector('.title-bar').addEventListener('pointerdown', e => {
            if (e.target.tagName === 'BUTTON' || win.classList.contains('maximized')) return;
            e.preventDefault();
            bringToFront(win);
            win.classList.add('no-transition');

            const rect   = win.getBoundingClientRect();
            const oX     = e.clientX - rect.left;
            const oY     = e.clientY - rect.top;
            const frames = document.querySelectorAll('iframe');
            frames.forEach(f => f.style.pointerEvents = 'none');

            const onMove = ev => { win.style.left = `${ev.clientX - oX}px`; win.style.top = `${ev.clientY - oY}px`; };
            const onUp   = () => {
                win.classList.remove('no-transition');
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.body.style.userSelect = '';
                frames.forEach(f => f.style.pointerEvents = '');
            };
            document.addEventListener('pointermove', onMove, { passive: true });
            document.addEventListener('pointerup', onUp, { once: true });
            document.body.style.userSelect = 'none';
        });
    }

    // ====================== RESIZE ======================
    function makeResizable(win) {
        win.addEventListener('pointerdown', e => {
            if (e.target.tagName === 'BUTTON') return;
            if (win.classList.contains('maximized')) return;
            const rect = win.getBoundingClientRect();
            if (e.clientX < rect.right - 22 || e.clientY < rect.bottom - 22) return;

            e.preventDefault();
            e.stopPropagation();
            win.classList.add('no-transition', 'resizing');

            const frames = win.querySelectorAll('iframe');
            frames.forEach(f => f.style.pointerEvents = 'none');
            win.setPointerCapture(e.pointerId);

            const sW = win.offsetWidth, sH = win.offsetHeight, sX = e.clientX, sY = e.clientY;
            const onMove = ev => {
                win.style.width  = `${Math.max(420, sW + ev.clientX - sX)}px`;
                win.style.height = `${Math.max(280, sH + ev.clientY - sY)}px`;
            };
            const onUp = () => {
                win.classList.remove('no-transition', 'resizing');
                frames.forEach(f => f.style.pointerEvents = '');
                win.releasePointerCapture(e.pointerId);
                win.removeEventListener('pointermove', onMove);
                win.removeEventListener('pointerup', onUp);
            };
            win.addEventListener('pointermove', onMove);
            win.addEventListener('pointerup', onUp, { once: true });
        });
    }

    // ====================== MENUS ======================
    function closeCurrentMenu() {
        if (!currentMenu) return;
        const m = currentMenu;
        currentMenu = currentTrigger = null;
        m.style.transition = 'all 0.15s ease';
        m.style.opacity    = '0';
        m.style.transform  = 'scale(0.92) translateY(10px)';
        setTimeout(() => m.remove(), 160);
    }
    window.closeCurrentMenu = closeCurrentMenu;

    function buildMenuItem(label, action) {
        const div  = document.createElement('div');
        div.className = 'app-item';
        const img  = document.createElement('img');
        img.src = getIcon(label); img.className = 'menu-icon'; img.alt = label;
        const span = document.createElement('span');
        span.textContent = label;
        div.append(img, span);
        div.onclick = e => { e.stopImmediatePropagation(); action?.(); closeCurrentMenu(); };
        return div;
    }

    function buildMenuElement(title, items) {
        const menu = document.createElement('div');
        menu.className = 'popup-menu';
        const header = document.createElement('div');
        header.className = 'popup-menu-header'; header.textContent = title;
        const content = document.createElement('div');
        content.className = 'popup-menu-content';
        items.forEach(item => content.appendChild(buildMenuItem(item.label, item.action)));
        menu.append(header, content);
        return menu;
    }

    function showMenu(trigger, title, items = null, isStartMenu = false) {
        if (currentTrigger === trigger) return closeCurrentMenu();
        closeCurrentMenu();
        currentTrigger = trigger;

        if (isStartMenu) {
            const menu = document.createElement('div');
            menu.id = 'start-menu'; menu.className = 'start-menu';

            const header = document.createElement('div');
            header.className   = 'start-menu-header';
            header.textContent = '🦜 Luvix OS';

            const content = document.createElement('div');
            content.className = 'start-menu-content';
            [
                { label: 'Redémarrer', action: restartOS },
                { label: 'Éteindre',   action: shutdown  },
                { label: 'Paramètres', action: () => createWindow('Paramètres', 'Paramètres système bientôt disponibles.', null, null, { isDialog: true, tag: 'Parametres' }) },
            ].forEach(item => content.appendChild(buildMenuItem(item.label, item.action)));

            menu.append(header, content);
            $('#main-desktop').appendChild(menu);
            currentMenu = menu;
        } else {
            currentMenu = buildMenuElement(title, items);
            $('#main-desktop').appendChild(currentMenu);
        }

        currentMenu.style.opacity   = '0';
        currentMenu.style.transform = 'scale(0.92) translateY(10px)';
        requestAnimationFrame(() => {
            currentMenu.style.transition = 'all .22s cubic-bezier(0.23,1,0.32,1)';
            currentMenu.style.opacity    = '1';
            currentMenu.style.transform  = 'scale(1) translateY(0)';
        });
        if (!isStartMenu && trigger) {
            const r = trigger.getBoundingClientRect();
            currentMenu.style.top  = `${r.bottom + 8}px`;
            currentMenu.style.left = `${r.left}px`;
        }
        setTimeout(() => {
            document.addEventListener('click', e => {
                if (currentMenu && !currentMenu.contains(e.target)) closeCurrentMenu();
            }, { once: true });
        }, 100);
    }

    // ====================== LISTENERS BARRE ======================
    $('#parrot-menu').addEventListener('click', e => { e.stopPropagation(); showMenu(e.currentTarget, null, null, true); });

    $('#apps-button').addEventListener('click', e => {
        e.stopPropagation();
        showMenu(e.currentTarget, 'Applications', [
            { label: 'Terminal',     action: () => createWindow('Terminal',          '/terminal.html',   220, 120, { tag: 'Terminal', sandbox: explorerSandbox }) },
            { label: 'Curriculum',   action: () => openFile('/assets/files/CV.pdf', { tag: 'CV', title: 'Curriculum' }) },
            { label: 'Navigateur',   action: () => createWindow('Navigateur Oignon', '/navigateur.html', 180, 100, { tag: 'Navigateur', sandbox: navigateurSandbox }) },
            { label: 'Luvix Engine', action: () => createWindow('Luvix 3D Engine',   '/3DEngine.html',   180, 100, { tag: 'Luvix3DEngine', sandbox: explorerSandbox }) },
            { label: 'Explorateur',  action: () => createWindow('Explorateur', '/files.html', 180, 100, { tag: 'Explorateur', sandbox: explorerSandbox }) },
        ]);
    });

    $('#system-button').addEventListener('click', e => {
        e.stopPropagation();
        showMenu(e.currentTarget, 'Système', [
            { label: 'Paramètres', action: () => createWindow('Paramètres', 'Bientôt disponible...', null, null, { isDialog: true, tag: 'Parametres' }) },
            { label: 'À propos',   action: () => createWindow('À propos - Luvix OS', '/Apropos.html', 220, 120,
                    { isDialog: true, centered: true, width: '560px', height: '420px', tag: 'Apropos' }) },
            { label: 'Redémarrer', action: restartOS },
            { label: 'Éteindre',   action: shutdown  },
        ]);
    });

    // ====================== ONGLET "TOI" ======================
    $('#user-pill')?.addEventListener('click', e => {
        e.stopPropagation();
        createWindow('👤 toi', `
            <div style="text-align:center;padding:10px 0 6px;">
                <div style="font-size:52px;margin-bottom:14px;">👤</div>
                <div style="font-size:22px;color:var(--c-accent2);margin-bottom:6px;letter-spacing:1px;">toi</div>
                <div style="font-size:14px;color:rgba(224,255,255,.5);margin-bottom:20px;">Utilisateur actif · Session en cours</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 10px 10px;font-size:15px;">
                    <div style="background:rgba(0,229,216,.08);border:1px solid var(--c-border);border-radius:6px;padding:10px;">
                        <div style="color:var(--c-accent);margin-bottom:4px;">Système</div>
                        <div style="color:rgba(224,255,255,.7);">Luvix OS</div>
                    </div>
                    <div style="background:rgba(0,229,216,.08);border:1px solid var(--c-border);border-radius:6px;padding:10px;">
                        <div style="color:var(--c-accent);margin-bottom:4px;">Shell</div>
                        <div style="color:rgba(224,255,255,.7);">luvixsh</div>
                    </div>
                    <div style="background:rgba(0,229,216,.08);border:1px solid var(--c-border);border-radius:6px;padding:10px;">
                        <div style="color:var(--c-accent);margin-bottom:4px;">Droits</div>
                        <div style="color:rgba(224,255,255,.7);">visiteur</div>
                    </div>
                    <div style="background:rgba(0,229,216,.08);border:1px solid var(--c-border);border-radius:6px;padding:10px;">
                        <div style="color:var(--c-accent);margin-bottom:4px;">Statut</div>
                        <div style="color:#00ffaa;">● en ligne</div>
                    </div>
                </div>
            </div>`,
            null, null, { isDialog: true, centered: true, width: '380px', tag: 'toi' }
        );
    });

    // ====================== HASH ROUTING ======================
    const hashActions = {
        'Terminal'     : () => createWindow('Terminal',          '/terminal.html',   220, 120, { tag: 'Terminal', sandbox: explorerSandbox }),
        'Galerie'      : () => createWindow('Gallerie',          '/galerie.html',    220, 120, { tag: 'Galerie', sandbox: explorerSandbox }),
        'Navigateur'   : () => createWindow('Navigateur Oignon', '/navigateur.html', 180, 100, { tag: 'Navigateur', sandbox: navigateurSandbox }),
        'CV'           : () => openFile('/assets/files/CV.pdf', { tag: 'CV', title: 'Curriculum' }),
        'Luvix3DEngine': () => createWindow('Luvix 3D Engine',   '/3DEngine.html',   180, 100, { tag: 'Luvix3DEngine', sandbox: explorerSandbox }),
        'Explorateur'  : () => createWindow('Explorateur',       '/files.html',      180, 100, { tag: 'Explorateur', sandbox: explorerSandbox }),
        'Apropos'      : () => createWindow('À propos - Luvix OS', '/Apropos.html', 220, 120,
            { isDialog: true, centered: true, width: '560px', height: '420px', tag: 'Apropos' }),
    };

    function handleHash() {
        const h = window.location.hash.slice(1);
        if (!h) return;

        if (hashActions[h]) { setTimeout(() => hashActions[h](), 400); return; }
        if (h.startsWith('f-')) {
            const path = unslugTag(h.slice(2));
            if (path) setTimeout(() => openFile(path), 400);
        }
    }
    window.addEventListener('hashchange', handleHash);
    handleHash();

    // ====================== GLOBAL ======================
    window.restartOS = () => createWindow('Redémarrer Luvix OS', 'Êtes-vous sûr ?', null, null, {
        isDialog: true,
        buttons: [{ text: 'Annuler' }, { text: 'Redémarrer', type: 'danger', action: () => setTimeout(() => location.reload(), 300) }]
    });
    window.shutdown = () => createWindow('Éteindre Luvix OS', 'Êtes-vous sûr ?', null, null, {
        isDialog: true,
        buttons: [{ text: 'Annuler' }, { text: 'Éteindre', type: 'danger', action: () => setTimeout(() => location.href = '/', 300) }]
    });
    window.createWindow = createWindow;

    // ====================== HORLOGE ======================
    const updateClock = () => {
        const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        $$('.clock').forEach(c => c.textContent = t);
    };
    updateClock();
    setInterval(updateClock, 1000);

    // ====================== TOGGLES ======================
    let crtEnabled = false;
    $('#crt-toggle').addEventListener('click', () => {
        crtEnabled = !crtEnabled;
        document.body.classList.toggle('crt-enabled', crtEnabled);
        const el = $('#crt-toggle');
        el.textContent = crtEnabled ? '📺' : '🌍';
        el.style.color = crtEnabled ? '#00ffaa' : '';
    });

    let soundEnabled = true;
    $('#sound-toggle-desktop').addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        const el = $('#sound-toggle-desktop');
        el.textContent = soundEnabled ? '🔊' : '🔇';
        el.style.color = soundEnabled ? '#e0ffff' : '#ff6666';
    });

    $('#fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); $('#fullscreen-btn').textContent = '⬜'; }
        else { document.exitFullscreen(); $('#fullscreen-btn').textContent = '⛶'; }
    });

    // ====================== ICÔNES DU BUREAU ======================
    $('#CV')?.addEventListener('dblclick',            () => openFile('/assets/files/CV.pdf', { tag: 'CV', title: 'Curriculum' }));
    $('#Terminal')?.addEventListener('dblclick',      () => createWindow('Terminal',          '/terminal.html',    220, 120, { tag: 'Terminal', sandbox: explorerSandbox }));
    $('#Gallery')?.addEventListener('dblclick',       () => createWindow('Gallerie',          '/galerie.html',     220, 120, { tag: 'Galerie', sandbox: explorerSandbox }));
    $('#Navigateur')?.addEventListener('dblclick',    () => createWindow('Navigateur Oignon', '/navigateur.html',  180, 100, { tag: 'Navigateur', sandbox: navigateurSandbox }));
    $('#Luvix3DEngine')?.addEventListener('dblclick', () => createWindow('Luvix 3D Engine',   '/3DEngine.html',    180, 100, { tag: 'Luvix3DEngine', sandbox: explorerSandbox }));
    $('#Explorateur')?.addEventListener('dblclick',   () => createWindow('Explorateur',       '/files.html',       180, 100, { tag: 'Explorateur', sandbox: explorerSandbox }));
});
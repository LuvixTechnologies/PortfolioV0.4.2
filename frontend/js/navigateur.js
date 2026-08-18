// ===================== CONFIG =====================
const favorites = [
    { name: "LinkedIn", icon: "🔗", url: "https://www.linkedin.com/in/lucas-pettinato-b9439922b/" },
    { name: "GitHub",   icon: "🐙", url: "https://github.com/LuvixTechnologies" },
    { name: "Gmail", icon: "✉️", action: "openGmail" },
    { name: "Space Shooter", icon: "🚀", action: "startSpaceShooter" }
];

// ===================== UTILS SÉCURITÉ =====================

function isSafeUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}


function safeWindowOpen(url) {
    if (!isSafeUrl(url)) {
        console.warn("URL bloquée (protocole non autorisé) :", url);
        return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

// ===================== FAVORIS =====================
function loadFavorites() {
    const grid = document.getElementById("favorites-grid");
    if (!grid) return;
    grid.innerHTML = "";

    favorites.forEach(fav => {
        const btn = document.createElement("div");
        btn.className = "fav-button";

        // Construction via DOM plutôt qu'innerHTML avec du texte brut
        const icon = document.createElement("div");
        icon.style.fontSize = "42px";
        icon.style.marginBottom = "8px";
        icon.textContent = fav.icon;

        const label = document.createElement("div");
        label.textContent = fav.name;

        btn.appendChild(icon);
        btn.appendChild(label);

        if (fav.url) btn.onclick = () => openExternal(fav.url);
        else if (fav.action === "openGmail") btn.onclick = openGmail;
        else if (fav.action === "startSpaceShooter") btn.onclick = startSpaceShooter;

        grid.appendChild(btn);
    });
}

// ===================== BARRE D'ADRESSE =====================
function updateAddressBar(text) {
    const address = document.getElementById("address");
    if (address) address.value = text;
}

function openExternal(url) {
    if (!url) return;
    const normalized = url.startsWith("http") ? url : "https://" + url;
    if (!isSafeUrl(normalized)) return;
    updateAddressBar(normalized);
    safeWindowOpen(normalized);
}

// ===================== RECHERCHE =====================
function handleSearch() {
    const input = document.getElementById("address");
    if (!input) return;

    // On limite la longueur pour éviter les entrées abusives
    const value = input.value.trim().toLowerCase().slice(0, 500);
    if (!value) return;

    const known = favorites.find(f =>
        value.includes(f.name.toLowerCase()) ||
        (f.url && value.includes(f.url.replace("https://", "").toLowerCase()))
    );

    if (known?.url) openExternal(known.url);
    else if (known?.action === "openGmail") openGmail();
    else if (known?.action === "startSpaceShooter") startSpaceShooter();
    else showOfflinePage();
}

// ===================== GMAIL =====================
const fakeEmails = [
    { from: "Prince Nigérian", subject: "URGENT - 50 MILLIONS POUR TOI", preview: "Cher Lucas Pettinato,\n\nJe suis un prince en exil. J'ai 50 millions de dollars bloqués sur un compte.\nIl me faut juste tes coordonnées bancaires pour tout te transférer.\n\nMerci mon frère 🧅", time: "11:32" },
    { from: "Support Google", subject: "Sécurité de ton compte", preview: "Nous avons détecté une connexion depuis ton navigateur Oignon.\nTout est normal... pour l'instant.\n\nRestez vigilant !", time: "09:15" },
    { from: "xAI - Elon Musk", subject: "On veut toi chez Grok", preview: "Salut Lucas,\nTon style 16-bit nous plaît beaucoup.\nRejoins l'équipe, on te donne un Tesla Cybertruck en pixel art.\n\n- Elon", time: "Hier" },
    { from: "Admin Oignon", subject: "Dernier avertissement", preview: "Ton abonnement Dark Web expire dans 3 jours.\nPaie en Monero ou on révèle ton historique de recherche...\n\n(Blague, on t'aime bien)", time: "Mar" },
    { from: "Banque Postale", subject: "Virement reçu", preview: "Vous avez reçu 420,69 €\nDe : Satoshi Nakamoto\nMotif : Pour tes oignons\n\nMerci de ne pas tout dépenser en RAM RGB", time: "Lun" }
];

function openGmail() {
    hideAllPages();
    const page = document.getElementById("gmail-page");
    if (page) page.style.display = "flex";
    updateAddressBar("https://mail.google.com/mail/u/0/#inbox");

    const list = document.querySelector(".gmail-list");
    if (!list) return;
    list.innerHTML = "";

    fakeEmails.forEach(mail => {
        const div = document.createElement("div");
        div.className = "gmail-item";

        // escapeHtml() protège contre une future source de données dynamique
        div.innerHTML = `
            <div class="gmail-from">${escapeHtml(mail.from)}</div>
            <div class="gmail-subject">${escapeHtml(mail.subject)}</div>
            <div class="gmail-preview">${escapeHtml(mail.preview).replace(/\n/g, "<br>")}</div>
            <div class="gmail-time">${escapeHtml(mail.time)}</div>
        `;
        div.onclick = () => alert(`📬 Message de ${mail.from}\n\nObjet : ${mail.subject}\n\n${mail.preview}\n\n(Style Gmail 16-bit activé 🧅)`);
        list.appendChild(div);
    });
}

// ===================== NAVIGATION =====================
function hideAllPages() {
    document.querySelectorAll('#home-screen, #gmail-page, #offline-page, #shooter-game, #game-over')
        .forEach(el => {
            if (el) el.style.display = "none";
        });
    if (typeof stopShooterGame === "function") stopShooterGame();
}

function backToHome() {
    hideAllPages();
    const home = document.getElementById("home-screen");
    if (home) home.style.display = "flex";
    updateAddressBar("https://duckduckgo.com");
}

function showOfflinePage() {
    hideAllPages();
    const page = document.getElementById("offline-page");
    if (page) page.style.display = "flex";
    updateAddressBar("https://duckduckgo.com");
}

function startSpaceShooter() {
    hideAllPages();
    const game = document.getElementById("shooter-game");
    if (game) game.style.display = "block";
    updateAddressBar("oignon://space-shooter");
    // C'est cet appel qui manquait : sans lui, le canvas s'affiche mais
    // reste vide car le moteur de jeu (shooter.js) n'est jamais démarré.
    if (typeof initShooterGame === "function") initShooterGame();
}

// ===================== INIT =====================
window.onload = () => {
    loadFavorites();

    // On utilise le même mécanisme que hideAllPages/backToHome (style.display)
    // plutôt qu'une classe "show" séparée, pour éviter les incohérences d'état.
    hideAllPages();
    const home = document.getElementById("home-screen");
    if (home) home.style.display = "flex";

    const addressBar = document.getElementById("address");
    if (addressBar) {
        addressBar.addEventListener("keydown", e => {
            if (e.key === "Enter") handleSearch();
        });
    }
};
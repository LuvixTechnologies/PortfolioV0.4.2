// ====================== CONFIG ======================
const BOOT_SOUND_ID = 'boot-sound';

// ====================== BOOT MESSAGES ======================
const bootMessages = [
    "[ OK ] Initialisation du noyau Linux 6.8... (CVE-2025-1337 déjà patchée)",
    "[ OK ] Chargement des modules de sécurité Parrot... et du keylogger éducatif",
    "[ OK ] Démarrage du réseau anonyme via Tor... Vos logs partent chez /dev/null",
    "[ OK ] Activation du firewall et blocage des ports (sauf le 1337 ouvert exprès)",
    "[ OK ] Montage des volumes chiffrés LUKS... Mot de passe : 'correct horse battery staple'",
    "[ OK ] Lancement du gestionnaire de fenêtres i3... Parce que les GUIs c'est pour les normies",
    "[WARN] Botty détecté en mode dormant... Il prépare un zero-day sur ton webcam",
    "[ OK ] Chargement des outils de pentest : Metasploit, sqlmap, Burp & café noir...",
    "[ OK ] Initialisation de la base comportementale : 'Ne jamais cliquer sur les pièces jointes .exe'",
    "[ OK ] Système sécurisé prêt. (Si vous lisez ceci, vous n'êtes probablement pas encore pwned)"
];

// ====================== GESTION DU SON ======================
let bootAudio = null;

function initBootSound() {
    bootAudio = document.getElementById(BOOT_SOUND_ID);
    if (bootAudio) {
        bootAudio.volume = 0.70;
        bootAudio.loop = false;
    }
}

function playBootSound() {
    if (!bootAudio) return;
    bootAudio.currentTime = 0;
    bootAudio.play().catch(() => {});
}

function fadeOutBootSound(duration = 1200) {
    if (!bootAudio || bootAudio.paused) return;

    const startVolume = bootAudio.volume;
    const step = startVolume / (duration / 30);
    let currentVol = startVolume;

    const fadeInterval = setInterval(() => {
        currentVol -= step;
        if (currentVol <= 0) {
            bootAudio.pause();
            bootAudio.currentTime = 0;
            bootAudio.volume = startVolume;
            clearInterval(fadeInterval);
        } else {
            bootAudio.volume = Math.max(currentVol, 0);
        }
    }, 30);
}

// ====================== POWER BUTTON ======================
function startPowerSequence() {
    const powerBtn = document.getElementById('power-btn');
    const powerScreen = document.getElementById('power-screen');

    if (!powerBtn) return;

    powerBtn.addEventListener('click', () => {
        powerBtn.style.transform = 'scale(0.88)';
        setTimeout(() => powerBtn.style.transform = 'scale(1)', 160);

        powerScreen.style.opacity = '0';
        document.body.classList.add('crt-enabled');

        setTimeout(() => {
            powerScreen.classList.remove('active');
            document.getElementById('boot-screen-1').classList.add('active');
            startBootSequence1();
        }, 700);
    });
}

// ====================== BOOT 1 ======================
function startBootSequence1() {
    playBootSound();

    let i = 0;
    const interval = setInterval(() => {
        if (i < bootMessages.length) {
            addBootLine(bootMessages[i]);
            i++;
            const progress = Math.floor((i / bootMessages.length) * 100);
            document.getElementById('boot-progress').textContent = `${progress}%`;
        } else {
            clearInterval(interval);
            setTimeout(() => {
                document.getElementById('boot-screen-1').classList.remove('active');
                document.getElementById('boot-screen-2').classList.add('active');
                startBootSequence2();
            }, 700);
        }
    }, 280);
}

// ====================== BOOT 2 - VERSION AMÉLIORÉE ======================
function startBootSequence2() {
    const bar = document.getElementById('loading-bar');
    const text = document.getElementById('loading-text');

    let progress = 55;
    let bootFinished = false;

    const messages = [
        "Chargement de l'interface pixel 16-bit...",
        "Préchargement des mini-jeux retro...",
        "Injection des assets cybersécurité...",
        "Restauration de la session hacker...",
        "Vérification des backdoors cachées..."
    ];
    let msgIndex = 0;

    // Animation de la barre (jusqu'à ~94%)
    const progressInterval = setInterval(() => {
        if (progress < 94 && !bootFinished) {
            progress += Math.random() * 4 + 2.5;
            bar.style.width = `${Math.min(progress, 94)}%`;
        }
    }, 160);

    // Rotation des messages
    const textInterval = setInterval(() => {
        if (msgIndex < messages.length && !bootFinished) {
            text.textContent = messages[msgIndex];
            msgIndex++;
        }
    }, 1000);

    // Fonction qui termine le boot et redirige
    function finishBoot() {
        if (bootFinished) return;
        bootFinished = true;

        clearInterval(progressInterval);
        clearInterval(textInterval);

        bar.style.width = '100%';
        text.textContent = "LuvixDesk chargé avec succès • Redirection vers le bureau...";

        fadeOutBootSound(900);

        // Redirection propre vers desktop.html
        setTimeout(() => {
            window.location.href = '/desktop.html';   // ou 'desktop.html' si même dossier
        }, 800);
    }

    // === NOUVELLE LOGIQUE : attendre que desktop.html soit ENTIÈREMENT chargé ===
    const startTime = Date.now();

    fetch('desktop.html')
        .then(response => {
            if (!response.ok) throw new Error('Erreur lors du chargement');
            return response.text();
        })
        .then(html => {
            // On a le HTML → on crée un document temporaire pour parser et précharger les ressources
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Récupérer toutes les ressources critiques (images, scripts, css)
            const resources = [];

            // Images
            doc.querySelectorAll('img').forEach(img => {
                if (img.src) resources.push(img.src);
            });

            // CSS (link)
            doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                if (link.href) resources.push(link.href);
            });

            // Scripts
            doc.querySelectorAll('script[src]').forEach(script => {
                if (script.src) resources.push(script.src);
            });

            // Si aucune ressource supplémentaire → on termine directement
            if (resources.length === 0) {
                const elapsed = Date.now() - startTime;
                setTimeout(finishBoot, Math.max(1200 - elapsed, 0));
                return;
            }

            // Préchargement de toutes les ressources
            let loaded = 0;
            const total = resources.length;

            resources.forEach(url => {
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = url.endsWith('.css') ? 'style' :
                    url.endsWith('.js') ? 'script' : 'image';
                link.href = url;
                document.head.appendChild(link);

                // On simule le chargement (le preload ne donne pas d'événement onload fiable)
                const img = new Image();
                img.onload = img.onerror = () => {
                    loaded++;
                    if (loaded >= total) {
                        const elapsed = Date.now() - startTime;
                        setTimeout(finishBoot, Math.max(800 - elapsed, 0));
                    }
                };
                img.src = url;   // pour les images
            });
        })
        .catch(err => {
            console.warn("Erreur préchargement desktop.html :", err);
            // En cas d'erreur, on termine quand même après un délai raisonnable
            setTimeout(finishBoot, 2800);
        });

    // Sécurité : timeout maximal (au cas où quelque chose bloque)
    setTimeout(() => {
        if (!bootFinished) finishBoot();
    }, 15000);
}

// ====================== UTILITAIRES ======================
function addBootLine(text, type = "ok") {
    const log = document.getElementById('boot-log');
    if (!log) return;
    const line = document.createElement('div');
    if (type === "warn") line.style.color = "#ffaa00";
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

// ====================== INITIALISATION ======================
document.addEventListener('DOMContentLoaded', () => {
    initBootSound();

    // Cacher les écrans de boot au départ
    ['boot-screen-1', 'boot-screen-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.display = 'none';
        loginScreen.style.opacity = '0';
    }

    const powerScreen = document.getElementById('power-screen');
    if (powerScreen) powerScreen.classList.add('active');

    startPowerSequence();
});
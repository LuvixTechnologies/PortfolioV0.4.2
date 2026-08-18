document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('login-screen');
    const mainDesktop = document.getElementById('main-desktop');
    const loginBtn = document.getElementById('login-btn');

    let crtEnabled = true;
    let soundEnabled = true;
    let currentLang = 'fr';

    // === HORLOGE ===
    function updateClock() {
        const clocks = document.querySelectorAll('.clock');
        setInterval(() => {
            const now = new Date();
            const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            clocks.forEach(c => c.textContent = time);
        }, 1000);
    }
    updateClock();

    // === CONNEXION ===
    loginBtn.addEventListener('click', () => {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.style.display = 'none';
            mainDesktop.style.display = 'block';
            setTimeout(() => mainDesktop.style.opacity = '1', 50);
        }, 600);
    });

    // === TOGGLE SON (synchronisé) ===
    const soundToggles = [
        document.getElementById('sound-toggle'),
        document.getElementById('sound-toggle-desktop')
    ];

    function toggleSound() {
        soundEnabled = !soundEnabled;
        const icon = soundEnabled ? '🔊' : '🔇';
        soundToggles.forEach(btn => {
            if (btn) btn.textContent = icon;
        });
    }

    soundToggles.forEach(btn => btn?.addEventListener('click', toggleSound));

    // === TOGGLE CRT ===
    const crtToggle = document.getElementById('crt-toggle');
    crtToggle.addEventListener('click', () => {
        crtEnabled = !crtEnabled;
        if (crtEnabled) {
            document.body.classList.add('crt-enabled');
            crtToggle.textContent = '🌍';
        } else {
            document.body.classList.remove('crt-enabled');
            crtToggle.textContent = '🌑';
        }
    });

    // === MENU DÉMARRER ===
    document.getElementById('parrot-menu').addEventListener('click', toggleStartMenu);

    // Entrée pour se connecter
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && loginScreen.classList.contains('active')) loginBtn.click();
    });
});
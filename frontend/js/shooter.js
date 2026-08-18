// ===================== OIGNON SPACE SHOOTER =====================

(function () {
    "use strict";

    const HIGH_SCORE_KEY = "oignonShooterHighScore";

    // Résolution logique : toute la logique de jeu (positions, collisions,
    // spawn) travaille dans ce repère fixe, quelle que soit la taille réelle
    // du canvas à l'écran. Seul le rendu est mis à l'échelle -> le jeu
    // s'adapte à n'importe quelle taille de frame sans rien recalculer.
    const LOGICAL_W = 900;
    const LOGICAL_H = 600;

    let canvas, ctx;
    let renderScale = 1;
    let resizeObserver = null;
    let resizeBound = false;
    let running = false;
    let rafId = null;
    let lastTime = 0;
    let spawnTimer = 0;
    let elapsed = 0;

    let score = 0;
    let lives = 4;
    let killCount = 0;      // compte les ennemis normaux tués (déclenche le boss)
    let comboTimer = 0;
    let combo = 0;

    const keys = {};
    let listenersBound = false;

    // -------- Joueur --------
    const player = {
        w: 40, h: 34,
        x: 0, y: 0,
        baseSpeed: 420,
        boostSpeed: 760,
        cooldown: 0,
        invuln: 0,           // secondes d'invulnérabilité après un dégât
        boosting: false
    };

    // Jauge de boost (0-100)
    let boostEnergy = 100;
    const BOOST_DRAIN_RATE = 42;   // par seconde en boost
    const BOOST_REGEN_RATE = 30;   // par seconde au repos

    let bullets = [];        // tirs du joueur
    let enemyBullets = [];   // tirs ennemis (boss)
    let enemies = [];
    let particles = [];      // étincelles / débris
    let floatingTexts = [];  // texte de score flottant
    let starsFar = [];
    let starsNear = [];

    // -------- Système d'arme (upgrades / downgrades) --------
    // Niveau -1 (dégradé) -> 0 (standard) -> 1,2,3 (amélioré)
    let weaponLevel = 0;
    const WEAPON_LABELS = ["FAIBLE", "STANDARD", "DOUBLE", "TRIPLE", "SUPRA"];
    // Chaque niveau définit : cadence de tir, vitesse, taille, couleur,
    // et la liste des tirs simultanés (décalage horizontal + angle en radians)
    const WEAPON_CONFIGS = [
        { cooldown: 0.30, speed: 560, w: 4, h: 12, color: "#94a3b8",
            shots: [{ dx: 0, angle: 0 }] },                                    // -1 faible
        { cooldown: 0.18, speed: 620, w: 6, h: 16, color: "#fbbf24",
            shots: [{ dx: 0, angle: 0 }] },                                    //  0 standard
        { cooldown: 0.16, speed: 640, w: 6, h: 16, color: "#fbbf24",
            shots: [{ dx: -9, angle: 0 }, { dx: 9, angle: 0 }] },              //  1 double
        { cooldown: 0.15, speed: 650, w: 6, h: 16, color: "#f97316",
            shots: [{ dx: 0, angle: 0 }, { dx: 0, angle: -0.22 }, { dx: 0, angle: 0.22 }] }, // 2 triple
        { cooldown: 0.11, speed: 680, w: 6, h: 16, color: "#f43f5e",
            shots: [{ dx: -10, angle: -0.14 }, { dx: 0, angle: -0.3 }, { dx: 0, angle: 0 },
                { dx: 0, angle: 0.3 }, { dx: 10, angle: 0.14 }] }         // 3 supra
    ];

    let pickups = [];        // power-ups d'arme qui tombent
    let pickupTimer = 8;

    // -------- Boss --------
    let boss = null;
    let bossActive = false;
    let bossWarningTimer = 0; // petite alerte avant l'arrivée du boss

    // -------- Effets d'écran --------
    let shakeTime = 0;
    let shakeMag = 0;
    let flashTime = 0;       // flash rouge quand le joueur encaisse un coup
    let flashColor = "255,80,80";

    function triggerShake(mag, dur) {
        shakeMag = Math.max(shakeMag, mag);
        shakeTime = Math.max(shakeTime, dur);
    }

    function triggerFlash(color = "255,80,80", dur = 0.18) {
        flashColor = color;
        flashTime = dur;
    }

    // -------- Redimensionnement responsive --------
    function resizeCanvasToContainer() {
        if (!canvas) return;
        const container = canvas.parentElement || canvas;
        const availW = container.clientWidth || LOGICAL_W;
        const availH = container.clientHeight || LOGICAL_H;
        if (availW <= 0 || availH <= 0) return;

        const scale = Math.min(availW / LOGICAL_W, availH / LOGICAL_H);
        const cssW = Math.max(1, Math.floor(LOGICAL_W * scale));
        const cssH = Math.max(1, Math.floor(LOGICAL_H * scale));
        const dpr = window.devicePixelRatio || 1;

        canvas.style.width = cssW + "px";
        canvas.style.height = cssH + "px";
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);

        renderScale = (cssW * dpr) / LOGICAL_W;
    }

    function bindResize() {
        if (resizeBound) return;
        resizeBound = true;

        window.addEventListener("resize", resizeCanvasToContainer);

        if (typeof ResizeObserver !== "undefined" && canvas && canvas.parentElement) {
            resizeObserver = new ResizeObserver(() => resizeCanvasToContainer());
            resizeObserver.observe(canvas.parentElement);
        }
    }

    // -------- Étoiles de fond (deux couches -> effet de profondeur) --------
    function initStars() {
        starsFar = [];
        starsNear = [];
        for (let i = 0; i < 70; i++) {
            starsFar.push({
                x: Math.random() * LOGICAL_W,
                y: Math.random() * LOGICAL_H,
                size: Math.random() * 1.4 + 0.4,
                speed: 15 + Math.random() * 30
            });
        }
        for (let i = 0; i < 40; i++) {
            starsNear.push({
                x: Math.random() * LOGICAL_W,
                y: Math.random() * LOGICAL_H,
                size: Math.random() * 2 + 1.2,
                speed: 60 + Math.random() * 90
            });
        }
    }

    // -------- Utils --------
    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
            a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function pad(n) {
        return String(Math.max(0, Math.floor(n))).padStart(5, "0");
    }

    function updateHud() {
        const scoreEl = document.getElementById("score");
        const livesEl = document.getElementById("lives");
        if (scoreEl) scoreEl.textContent = `SCORE: ${pad(score)}`;
        if (livesEl) livesEl.textContent = "❤️".repeat(Math.max(lives, 0)) || "💀";
    }

    // -------- État --------
    function resetState() {
        score = 0;
        lives = 4;
        killCount = 0;
        combo = 0;
        comboTimer = 0;
        bullets = [];
        enemyBullets = [];
        enemies = [];
        particles = [];
        floatingTexts = [];
        spawnTimer = 0;
        elapsed = 0;
        boostEnergy = 100;
        weaponLevel = 0;
        pickups = [];
        pickupTimer = 6 + Math.random() * 4;
        player.x = LOGICAL_W / 2 - player.w / 2;
        player.y = LOGICAL_H - player.h - 24;
        player.cooldown = 0;
        player.invuln = 1.6; // petit répit au démarrage
        player.boosting = false;
        boss = null;
        bossActive = false;
        bossWarningTimer = 0;
        shakeTime = 0;
        shakeMag = 0;
        flashTime = 0;
        initStars();
        updateHud();
    }

    function spawnEnemy() {
        const size = 30 + Math.random() * 18;
        enemies.push({
            x: Math.random() * (LOGICAL_W - size),
            y: -size,
            w: size, h: size,
            speed: 65 + Math.random() * 35 + Math.min(elapsed, 60) * 1.1,
            wobble: Math.random() * Math.PI * 2,
            hue: Math.random() * 30 - 15
        });
    }

    function spawnBoss() {
        bossActive = true;
        const maxHp = 28;
        boss = {
            x: LOGICAL_W / 2 - 70,
            y: -160,
            w: 140, h: 100,
            targetY: 70,
            speed: 120,
            dir: 1,
            hp: maxHp,
            maxHp,
            shootTimer: 2,
            hitFlash: 0,
            entering: true,
            t: 0
        };
        floatingTexts.push({
            x: LOGICAL_W / 2, y: LOGICAL_H / 2 - 40,
            text: "⚠ BOSS ⚠", life: 2.2, maxLife: 2.2, size: 42, color: "#ff5577"
        });
    }

    function spawnExplosion(x, y, color, count = 12, spread = 260) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * spread,
                vy: (Math.random() - 0.5) * spread,
                life: 0.5,
                maxLife: 0.5,
                size: 3 + Math.random() * 3,
                color
            });
        }
    }

    function spawnScoreText(x, y, text, color = "#fbbf24") {
        floatingTexts.push({ x, y, text, life: 0.7, maxLife: 0.7, size: 16, color });
    }

    // -------- Arme --------
    function changeWeaponLevel(delta, x, y) {
        const prev = weaponLevel;
        weaponLevel = Math.max(-1, Math.min(3, weaponLevel + delta));
        if (weaponLevel === prev) return; // déjà au maximum/minimum
        if (delta > 0) {
            spawnScoreText(x, y, "ARME ▲ " + WEAPON_LABELS[weaponLevel + 1], "#4ade80");
        } else {
            spawnScoreText(x, y, "ARME ▼ " + WEAPON_LABELS[weaponLevel + 1], "#f87171");
        }
    }

    function shoot() {
        if (player.cooldown > 0) return;
        const cfg = WEAPON_CONFIGS[weaponLevel + 1];
        player.cooldown = cfg.cooldown * (player.boosting ? 0.75 : 1);
        cfg.shots.forEach(s => {
            const vx = Math.sin(s.angle) * cfg.speed;
            const vy = -Math.cos(s.angle) * cfg.speed;
            bullets.push({
                x: player.x + player.w / 2 - cfg.w / 2 + s.dx,
                y: player.y - 4,
                w: cfg.w, h: cfg.h,
                vx, vy,
                color: cfg.color
            });
        });
    }

    // -------- Power-ups d'arme --------
    function spawnPickup(x, type) {
        pickups.push({
            x: Math.max(10, Math.min(LOGICAL_W - 32, x)),
            y: -24, w: 22, h: 22,
            vy: 110 + Math.random() * 30,
            type // "up" ou "down"
        });
    }

    function bossShoot() {
        if (!boss) return;
        const cx = boss.x + boss.w / 2;
        const cy = boss.y + boss.h;
        // 3 tirs en éventail visant approximativement le joueur
        const targetX = player.x + player.w / 2;
        const baseAngle = Math.atan2((player.y - cy), (targetX - cx));
        [-0.3, 0, 0.3].forEach(offset => {
            const angle = baseAngle + offset;
            enemyBullets.push({
                x: cx - 4, y: cy,
                w: 8, h: 8,
                vx: Math.cos(angle) * 200,
                vy: Math.sin(angle) * 200
            });
        });
    }

    // -------- Update --------
    function update(dt) {
        elapsed += dt;

        if (shakeTime > 0) shakeTime -= dt;
        if (flashTime > 0) flashTime -= dt;
        if (player.invuln > 0) player.invuln -= dt;
        if (comboTimer > 0) {
            comboTimer -= dt;
            if (comboTimer <= 0) combo = 0;
        }

        // Étoiles (parallaxe)
        starsFar.forEach(s => {
            s.y += s.speed * dt;
            if (s.y > LOGICAL_H) { s.y = 0; s.x = Math.random() * LOGICAL_W; }
        });
        starsNear.forEach(s => {
            s.y += s.speed * dt;
            if (s.y > LOGICAL_H) { s.y = 0; s.x = Math.random() * LOGICAL_W; }
        });

        // Boost : actif tant que Shift est maintenu et qu'il reste de l'énergie
        player.boosting = !!(keys["shift"] && boostEnergy > 0 && (keys["arrowleft"] || keys["a"] || keys["arrowright"] || keys["d"]));
        if (player.boosting) {
            boostEnergy = Math.max(0, boostEnergy - BOOST_DRAIN_RATE * dt);
        } else {
            boostEnergy = Math.min(100, boostEnergy + BOOST_REGEN_RATE * dt);
        }

        // Déplacement joueur (horizontal), vitesse accrue en boost
        let vx = 0;
        if (keys["arrowleft"] || keys["a"]) vx -= 1;
        if (keys["arrowright"] || keys["d"]) vx += 1;
        const curSpeed = player.boosting ? player.boostSpeed : player.baseSpeed;
        player.x = Math.max(0, Math.min(LOGICAL_W - player.w, player.x + vx * curSpeed * dt));

        // Traînée du réacteur (plus dense en boost)
        if (vx !== 0 || Math.random() < 0.3) {
            const trailColor = player.boosting ? "#ffcf5c" : "#6a8cff";
            particles.push({
                x: player.x + player.w / 2 + (Math.random() - 0.5) * 10,
                y: player.y + player.h,
                vx: (Math.random() - 0.5) * 30,
                vy: 80 + Math.random() * 60,
                life: 0.25,
                maxLife: 0.25,
                size: player.boosting ? 4 : 2.5,
                color: trailColor
            });
        }

        if (player.cooldown > 0) player.cooldown -= dt;
        if (keys[" "]) shoot();

        // -------- Déclenchement du boss --------
        if (!bossActive && killCount > 0 && killCount % 18 === 0) {
            spawnBoss();
            killCount = 0; // évite un re-trigger immédiat
        }

        // Spawn ennemis normaux (coupé pendant un combat de boss)
        if (!bossActive) {
            spawnTimer -= dt;
            if (spawnTimer <= 0) {
                spawnEnemy();
                spawnTimer = Math.max(0.55, 1.3 - elapsed * 0.006);
            }
        }

        // Projectiles joueur
        bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
        bullets = bullets.filter(b => b.y + b.h > 0 && b.x > -30 && b.x < LOGICAL_W + 30);

        // Power-ups d'arme : apparition périodique + chute
        pickupTimer -= dt;
        if (pickupTimer <= 0) {
            const type = Math.random() < 0.78 ? "up" : "down";
            spawnPickup(30 + Math.random() * (LOGICAL_W - 60), type);
            pickupTimer = 7 + Math.random() * 5;
        }
        pickups.forEach(p => p.y += p.vy * dt);
        pickups = pickups.filter(p => p.y < LOGICAL_H + 30);

        for (let pi = pickups.length - 1; pi >= 0; pi--) {
            if (rectsOverlap(player, pickups[pi])) {
                const p = pickups[pi];
                const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
                if (p.type === "up") {
                    changeWeaponLevel(1, cx, cy);
                    spawnExplosion(cx, cy, "#4ade80", 14, 150);
                    triggerFlash("120,255,150", 0.1);
                } else {
                    changeWeaponLevel(-1, cx, cy);
                    spawnExplosion(cx, cy, "#c084fc", 14, 150);
                    triggerFlash("200,120,255", 0.1);
                }
                pickups.splice(pi, 1);
            }
        }

        // Projectiles ennemis
        enemyBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
        enemyBullets = enemyBullets.filter(b => b.y < LOGICAL_H + 20 && b.y > -20 && b.x > -20 && b.x < LOGICAL_W + 20);

        // Ennemis normaux
        enemies.forEach(e => {
            e.y += e.speed * dt;
            e.wobble += dt * 3;
            e.x += Math.sin(e.wobble) * 40 * dt;
        });

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            if (enemies[ei].y > LOGICAL_H) {
                enemies.splice(ei, 1);
                loseLife();
                if (!running) return;
            }
        }

        // Boss : entrée, déplacement, tir
        if (boss) {
            boss.t += dt;
            if (boss.hitFlash > 0) boss.hitFlash -= dt;
            if (boss.entering) {
                boss.y += 90 * dt;
                if (boss.y >= boss.targetY) {
                    boss.y = boss.targetY;
                    boss.entering = false;
                }
            } else {
                boss.x += boss.dir * boss.speed * dt;
                if (boss.x <= 20) { boss.x = 20; boss.dir = 1; }
                if (boss.x >= LOGICAL_W - boss.w - 20) { boss.x = LOGICAL_W - boss.w - 20; boss.dir = -1; }

                boss.shootTimer -= dt;
                if (boss.shootTimer <= 0) {
                    bossShoot();
                    boss.shootTimer = 1.6;
                }
            }
        }

        // Collision bullet joueur -> ennemi normal
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                if (rectsOverlap(bullets[bi], enemies[ei])) {
                    const e = enemies[ei];
                    spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ff8899");
                    enemies.splice(ei, 1);
                    bullets.splice(bi, 1);
                    combo += 1;
                    comboTimer = 1.4;
                    const gained = 10 + Math.min(combo, 10) * 2;
                    score += gained;
                    killCount += 1;
                    spawnScoreText(e.x + e.w / 2, e.y, `+${gained}${combo > 1 ? " x" + combo : ""}`);
                    updateHud();
                    if (Math.random() < 0.16) spawnPickup(e.x + e.w / 2, "up");
                    break;
                }
            }
        }

        // Collision bullet joueur -> boss
        if (boss) {
            for (let bi = bullets.length - 1; bi >= 0; bi--) {
                if (rectsOverlap(bullets[bi], boss)) {
                    bullets.splice(bi, 1);
                    boss.hp -= 1;
                    boss.hitFlash = 0.08;
                    triggerShake(4, 0.08);
                    spawnExplosion(
                        boss.x + Math.random() * boss.w,
                        boss.y + Math.random() * boss.h,
                        "#ffd166", 4, 120
                    );
                    if (boss.hp <= 0) {
                        spawnExplosion(boss.x + boss.w / 2, boss.y + boss.h / 2, "#ffd166", 40, 380);
                        spawnExplosion(boss.x + boss.w / 2, boss.y + boss.h / 2, "#ff5577", 24, 260);
                        triggerShake(14, 0.5);
                        triggerFlash("255,220,120", 0.25);
                        score += 500;
                        spawnScoreText(boss.x + boss.w / 2, boss.y + boss.h / 2, "+500", "#ffd166");
                        updateHud();
                        spawnPickup(boss.x + boss.w / 2, "up"); // récompense garantie
                        boss = null;
                        bossActive = false;
                        enemyBullets = [];
                    }
                    break;
                }
            }
        }

        // Collision ennemi normal -> joueur
        if (player.invuln <= 0) {
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                if (rectsOverlap(player, enemies[ei])) {
                    spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#a0d8ff", 20);
                    enemies.splice(ei, 1);
                    loseLife();
                    if (!running) return;
                    break;
                }
            }
        }

        // Collision tir ennemi -> joueur
        if (player.invuln <= 0) {
            for (let bi = enemyBullets.length - 1; bi >= 0; bi--) {
                if (rectsOverlap(player, enemyBullets[bi])) {
                    enemyBullets.splice(bi, 1);
                    spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#ff9955", 14);
                    loseLife();
                    if (!running) return;
                    break;
                }
            }
        }

        // Collision corps du boss -> joueur
        if (boss && player.invuln <= 0 && rectsOverlap(player, boss)) {
            spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#a0d8ff", 24);
            triggerShake(10, 0.3);
            loseLife();
            if (!running) return;
        }

        // Particules
        particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 40 * dt; // légère gravité pour du dynamisme
            p.life -= dt;
        });
        particles = particles.filter(p => p.life > 0);

        // Textes flottants
        floatingTexts.forEach(t => { t.y -= 35 * dt; t.life -= dt; });
        floatingTexts = floatingTexts.filter(t => t.life > 0);
    }

    function loseLife() {
        lives -= 1;
        player.invuln = 1.8;
        triggerShake(9, 0.25);
        triggerFlash("255,80,80", 0.2);
        updateHud();
        if (lives <= 0) gameOver();
    }

    // -------- Rendu --------
    function drawPlayer() {
        const { x, y, w, h } = player;

        // Clignotement pendant l'invulnérabilité
        if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;

        // Flamme réacteur (plus grande et plus vive en boost)
        const flameH = (player.boosting ? 14 : 8) + Math.random() * 6;
        const flameGrad = player.boosting ? "#ffdd77" : "#ffbb55";
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.35, y + h);
        ctx.lineTo(x + w * 0.65, y + h);
        ctx.lineTo(x + w * 0.5, y + h + flameH);
        ctx.closePath();
        ctx.fill();

        if (player.boosting) {
            ctx.save();
            ctx.shadowColor = "#ffcf5c";
            ctx.shadowBlur = 18;
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = "#ffcf5c";
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h * 0.5, w * 0.75, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.fillStyle = "#a0d8ff";
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w * 0.7, y + h * 0.7);
        ctx.lineTo(x + w * 0.3, y + h * 0.7);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#6a8cff";
        ctx.fillRect(x + w * 0.42, y + h * 0.35, w * 0.16, h * 0.3);
    }

    function drawEnemy(e) {
        ctx.fillStyle = `hsl(${350 + e.hue}, 90%, 70%)`;
        ctx.beginPath();
        ctx.moveTo(e.x + e.w / 2, e.y + e.h);
        ctx.lineTo(e.x + e.w, e.y);
        ctx.lineTo(e.x + e.w * 0.7, e.y + e.h * 0.3);
        ctx.lineTo(e.x + e.w * 0.3, e.y + e.h * 0.3);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#16213e";
        ctx.fillRect(e.x + e.w * 0.4, e.y + e.h * 0.35, e.w * 0.2, e.h * 0.2);
    }

    function drawBullet(b) {
        ctx.save();
        const c = b.color || "#fbbf24";
        ctx.shadowColor = c;
        ctx.shadowBlur = 8;
        ctx.fillStyle = c;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.restore();
    }

    function drawPickup(p) {
        const color = p.type === "up" ? "#4ade80" : "#c084fc";
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(p.x + p.w / 2, p.y);
        ctx.lineTo(p.x + p.w, p.y + p.h / 2);
        ctx.lineTo(p.x + p.w / 2, p.y + p.h);
        ctx.lineTo(p.x, p.y + p.h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#0c1326";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.type === "up" ? "+" : "–", p.x + p.w / 2, p.y + p.h / 2 + 5);
    }

    function drawEnemyBullet(b) {
        ctx.save();
        ctx.shadowColor = "#ff5577";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#ff5577";
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawBoss() {
        if (!boss) return;
        const { x, y, w, h } = boss;

        ctx.save();
        if (boss.hitFlash > 0) {
            ctx.shadowColor = "#ffffff";
            ctx.shadowBlur = 20;
        } else {
            ctx.shadowColor = "#ff5577";
            ctx.shadowBlur = 14;
        }

        ctx.fillStyle = boss.hitFlash > 0 ? "#ffffff" : "#7a2e46";
        ctx.beginPath();
        ctx.moveTo(x + w * 0.5, y);
        ctx.lineTo(x + w, y + h * 0.35);
        ctx.lineTo(x + w * 0.85, y + h);
        ctx.lineTo(x + w * 0.15, y + h);
        ctx.lineTo(x, y + h * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Coeur / noyau
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.5, 14 + Math.sin(boss.t * 6) * 2, 0, Math.PI * 2);
        ctx.fill();

        // Barre de vie du boss
        const barW = 300, barH = 14;
        const barX = LOGICAL_W / 2 - barW / 2, barY = 18;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(barX - 3, barY - 3, barW + 6, barH + 6);
        ctx.fillStyle = "#3a1020";
        ctx.fillRect(barX, barY, barW, barH);
        const ratio = Math.max(boss.hp / boss.maxHp, 0);
        ctx.fillStyle = ratio > 0.3 ? "#ff5577" : "#ff9955";
        ctx.fillRect(barX, barY, barW * ratio, barH);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BOSS", LOGICAL_W / 2, barY + barH + 14);
    }

    function drawBoostBar() {
        const barW = 140, barH = 8;
        const barX = 16, barY = LOGICAL_H - 24;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = "#1c2540";
        ctx.fillRect(barX, barY, barW, barH);
        const ratio = boostEnergy / 100;
        ctx.fillStyle = player.boosting ? "#ffcf5c" : "#6a8cff";
        ctx.fillRect(barX, barY, barW * ratio, barH);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("BOOST (Shift)", barX, barY - 4);
    }

    function drawWeaponIndicator() {
        const idx = weaponLevel + 1;
        const barW = 140, barH = 8;
        const barX = LOGICAL_W - 16 - barW, barY = LOGICAL_H - 24;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = "#1c2540";
        ctx.fillRect(barX, barY, barW, barH);
        const ratio = idx / (WEAPON_LABELS.length - 1);
        const color = weaponLevel < 0 ? "#94a3b8" : weaponLevel === 0 ? "#fbbf24" : weaponLevel < 3 ? "#f97316" : "#f43f5e";
        ctx.fillStyle = color;
        ctx.fillRect(barX, barY, barW * ratio, barH);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("ARME: " + WEAPON_LABELS[idx], barX + barW, barY - 4);
    }

    function render() {
        ctx.save();
        ctx.scale(renderScale, renderScale);

        // Secousse d'écran
        if (shakeTime > 0) {
            const s = shakeMag * (shakeTime > 0 ? 1 : 0);
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        } else {
            shakeMag = 0;
        }

        ctx.fillStyle = "#0c1326";
        ctx.fillRect(-20, -20, LOGICAL_W + 40, LOGICAL_H + 40);

        ctx.fillStyle = "#ffffff";
        starsFar.forEach(s => {
            ctx.globalAlpha = 0.35;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        });
        starsNear.forEach(s => {
            ctx.globalAlpha = 0.6 + Math.random() * 0.4;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        });
        ctx.globalAlpha = 1;

        bullets.forEach(drawBullet);
        enemyBullets.forEach(drawEnemyBullet);
        pickups.forEach(drawPickup);
        enemies.forEach(drawEnemy);
        drawBoss();
        drawPlayer();

        particles.forEach(p => {
            ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size || 4, p.size || 4);
        });
        ctx.globalAlpha = 1;

        floatingTexts.forEach(t => {
            ctx.globalAlpha = Math.max(t.life / t.maxLife, 0);
            ctx.fillStyle = t.color;
            ctx.font = `bold ${t.size}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(t.text, t.x, t.y);
        });
        ctx.globalAlpha = 1;

        drawBoostBar();
        drawWeaponIndicator();

        ctx.restore();

        // Flash de dégâts (par-dessus la secousse, en repère écran)
        if (flashTime > 0) {
            ctx.save();
            ctx.globalAlpha = Math.max(flashTime, 0) * 2.2;
            ctx.fillStyle = `rgb(${flashColor})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
    }

    function loop(timestamp) {
        if (!running) return;
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05) || 0;
        lastTime = timestamp;

        update(dt);
        if (!running) return; // gameOver() a pu couper la partie pendant update()
        render();

        rafId = requestAnimationFrame(loop);
    }

    // -------- Game over --------
    function gameOver() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);

        const best = Math.max(score, parseInt(localStorage.getItem(HIGH_SCORE_KEY) || "0", 10));
        localStorage.setItem(HIGH_SCORE_KEY, best);

        const overlay = document.getElementById("game-over");
        const finalScoreEl = document.getElementById("final-score");
        if (finalScoreEl) finalScoreEl.textContent = `Score : ${pad(score)}  (Record : ${pad(best)})`;
        if (overlay) overlay.style.display = "flex";
    }

    // -------- Entrées clavier --------
    function bindKeyboard() {
        if (listenersBound) return;
        listenersBound = true;

        window.addEventListener("keydown", e => {
            const key = e.key.toLowerCase();
            if (!running) return;
            keys[key] = true;
            if (key === " ") e.preventDefault(); // évite le scroll pendant le jeu
            if (key === "escape") {
                if (typeof backToHome === "function") backToHome();
            }
        });
        window.addEventListener("keyup", e => {
            keys[e.key.toLowerCase()] = false;
        });
    }

    // -------- API exposée (branchée sur navigateur.js et index.html) --------
    window.initShooterGame = function () {
        canvas = document.getElementById("shooter-canvas");
        if (!canvas) return;
        ctx = canvas.getContext("2d");

        const overlay = document.getElementById("game-over");
        if (overlay) overlay.style.display = "none";

        bindKeyboard();
        bindResize();
        resizeCanvasToContainer();
        resetState();
        running = true;
        lastTime = performance.now();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    };

    window.stopShooterGame = function () {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
    };

    window.restartGame = function () {
        const overlay = document.getElementById("game-over");
        if (overlay) overlay.style.display = "none";
        if (!canvas) canvas = document.getElementById("shooter-canvas");
        if (!ctx && canvas) ctx = canvas.getContext("2d");
        bindResize();
        resizeCanvasToContainer();
        resetState();
        running = true;
        lastTime = performance.now();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    };
})();
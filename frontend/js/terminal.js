// ============================================================
//  LUVIX OS — terminal.js
//  Système de fichiers avec navigation complète (cd a/b, .., etc.)
// ============================================================

// ---------- SYSTÈME DE FICHIERS (arbre réel) ----------
const FS = {
    type: "dir",
    children: {
        "readme.txt":    { type:"file", content:"Bienvenue sur LUVIX OS v0.16.4\nTape 'help' pour la liste des commandes.\n\nCe système est surveillé. Toute intrusion sera logguée." },
        "note.txt":      { type:"file", content:"TODO: changer le mot de passe root\nTODO: supprimer les anciens logs\nTODO: déplacer le flag dans /vault" },
        "projects": {
            type: "dir",
            children: {
                "game.txt":      { type:"file", content:"[PROJET: VOID_RUNNER]\nStatut: en développement\nMoteur: custom C++\nNote: les assets sont dans /projects/assets — accès restreint" },
                "portfolio.txt": { type:"file", content:"Tu es actuellement dedans.\nCe terminal est lui-même un portfolio.\nMeta, non ?" },
                "assets": {
                    type: "dir",
                    children: {
                        "sprites.dat":         { type:"file", content:"[BINARY DATA — 0xDEADBEEF]\nFichier corrompu. Utilise 'strings sprites.dat' pour extraire." },
                        "strings_sprites.dat": { type:"file", content:"Extraction de chaînes...\n...\n...\nLUVIX{h1dd3n_1n_th3_n0is3}\n...\n[FIN DES DONNÉES]", flag: "LUVIX{h1dd3n_1n_th3_n0is3}" },
                    }
                },
                "old_projects": {
                    type: "dir",
                    children: {
                        "2023.txt": { type:"file", content:"Premier site en HTML pur. Très moche.\nMais c'était le début." },
                        "2024.txt": { type:"file", content:"Version dark retro. Un peu mieux.\nC'est là que tout a commencé." },
                    }
                },
            }
        },
        "system": {
            type: "dir",
            children: {
                "kernel.log": { type:"file", content:"[OK] Kernel 4.20-retro chargé\n[OK] Modules chargés: 42\n[WARN] Processus suspect détecté: pid 1337\n[OK] Système opérationnel" },
                "users.db":   { type:"file", content:"# Base utilisateurs — NE PAS PARTAGER\nroot:x:0:0::/root:/bin/bash\nvisitor:x:1000:1000::/home/visitor:/bin/sh\nguest:x:1001:1001::/home/guest:/bin/false\n# hash root: $2b$12$sEcReT.hAsH" },
                "auth.log":   { type:"file", content:"May 23 03:12 visitor LOGIN\nMay 23 03:14 visitor FAILED sudo\nMay 23 03:14 visitor FAILED sudo\nMay 23 03:14 root LOGIN (su)\nMay 23 03:15 root EXEC: cat /vault/flag.txt" },
                "config": {
                    type: "dir",
                    children: {
                        "theme.conf":   { type:"file", content:"crt_enabled=true\nscanlines=true\nretro_mode=maximum\ncolor_scheme=phosphor_green" },
                        "network.conf": { type:"file", content:"hostname=luvix\ndomain=local\n# clé de chiffrement: base64:TFVWSVh7YjRzM182NF9pNV90aDNfMW5zdGFuY30=" },
                    }
                },
                "vault": {
                    type: "dir",
                    locked: true,
                    children: {
                        "flag.txt":    { type:"file", content:"LUVIX{r00t_4cc3ss_gr4nt3d_n1c3_w0rk}", flag: "LUVIX{r00t_4cc3ss_gr4nt3d_n1c3_w0rk}" },
                        "private.key": { type:"file", content:"-----BEGIN PRIVATE KEY-----\nM1IEvgIBADANBgkqhkiG9w0BAQEFAA...\n[TRONQUÉ — accès root requis pour lire]\n-----END PRIVATE KEY-----" },
                    }
                },
            }
        },
        ".hidden": {
            type: "dir",
            children: {
                ".bashrc":       { type:"file", content:"# Config bash cachée\nalias ll='ls -la'\nexport FLAG2='LUVIX{d0t_f1l3s_4r3_y0ur_fr13nds}'\nexport PATH=$PATH:/opt/luvix/bin", flag: "LUVIX{d0t_f1l3s_4r3_y0ur_fr13nds}" },
                ".bash_history": { type:"file", content:"ls\ncd system\ncat users.db\nsudo su\ncd vault\ncat flag.txt\ncd .hidden\ncat .bashrc" },
            }
        },
    }
};

const FLAGS = {
    "LUVIX{h1dd3n_1n_th3_n0is3}":            "Flag 1 — caché dans le bruit",
    "LUVIX{d0t_f1l3s_4r3_y0ur_fr13nds}":     "Flag 2 — dotfiles are your friends",
    "LUVIX{r00t_4cc3ss_gr4nt3d_n1c3_w0rk}":  "Flag 3 — escalade de privilèges",
};

// ---------- ÉTAT ----------
let cwd = [];           // tableau de segments de chemin depuis la racine, ex: ["projects","assets"]
let isRoot = false;
let foundFlags = new Set();
let hist = [];
let histIdx = -1;

const out         = document.getElementById("output");
const inp         = document.getElementById("cmd-input");
const promptLabel = document.getElementById("prompt-label");
const flagCount   = document.getElementById("flag-count");

// ---------- UTILITAIRES AFFICHAGE ----------
function print(text, cls = "c-white") {
    const d = document.createElement("div");
    d.className = "line " + cls;
    d.textContent = text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}
function printHTML(html, cls = "c-white") {
    const d = document.createElement("div");
    d.className = "line " + cls;
    d.innerHTML = html;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}
function printPrompt(cmd) {
    const d = document.createElement("div");
    d.className = "line";
    d.innerHTML = `<span class="c-green">${escHtml(promptStr())}</span><span class="c-lime">${escHtml(cmd)}</span>`;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}
function escHtml(t) {
    return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function promptStr() {
    const user = isRoot ? "root" : "visitor";
    const path = cwd.length === 0 ? "~" : "~/" + cwd.join("/");
    const sym  = isRoot ? "#" : "$";
    return `${user}@luvix:${path}${sym} `;
}
function updatePrompt() {
    promptLabel.textContent = promptStr();
}

// ---------- NAVIGATION SYSTÈME DE FICHIERS ----------

/** Résout un chemin absolu (tableau de segments) → nœud FS ou null */
function resolveAbs(segments) {
    let node = FS;
    for (const seg of segments) {
        if (!node.children || !node.children[seg]) return null;
        node = node.children[seg];
    }
    return node;
}

/** Résout un chemin (string) depuis cwd → { node, absPath[] } ou null */
function resolvePath(rawPath) {
    if (!rawPath) return { node: resolveAbs(cwd), absPath: [...cwd] };

    let base;
    let parts;

    if (rawPath.startsWith("/")) {
        // chemin absolu depuis la racine
        base = [];
        parts = rawPath.replace(/^\/+/, "").split("/").filter(Boolean);
    } else {
        // chemin relatif
        base = [...cwd];
        parts = rawPath.split("/").filter(p => p !== "");
    }

    const abs = [...base];
    for (const seg of parts) {
        if (seg === "." || seg === "") continue;
        if (seg === "..") {
            if (abs.length > 0) abs.pop();
        } else {
            abs.push(seg);
        }
    }

    const node = resolveAbs(abs);
    return node ? { node, absPath: abs } : null;
}

/** Renvoie le nœud courant */
function currentNode() {
    return resolveAbs(cwd);
}

// ---------- FLAGS ----------
function checkFlag(content) {
    for (const f in FLAGS) {
        if (content.includes(f) && !foundFlags.has(f)) {
            foundFlags.add(f);
            flagCount.textContent = foundFlags.size;
            setTimeout(() => {
                print("", "c-dim");
                print("╔══════════════════════════════════════════════╗", "c-gold");
                print("║  🚩  FLAG CAPTURÉ !                          ║", "c-gold");
                print(`║  ${f}  ║`, "c-cyan");
                print(`║  ${FLAGS[f]}  ║`, "c-dim");
                print("╚══════════════════════════════════════════════╝", "c-gold");
                if (foundFlags.size === 3) setTimeout(triggerWin, 1200);
            }, 80);
        }
    }
    if (content.includes("TFVWSVh7YjRzM182NF9pNV90aDNfMW5zdGFuY30=") && !foundFlags.has("base64_hint")) {
        foundFlags.add("base64_hint");
        setTimeout(() => {
            print("", "c-dim");
            print("[HINT] Chaîne base64 détectée dans network.conf", "c-yellow");
            print("       Essaie: echo TFVWSVh7YjRzM182NF9pNV90aDNfMW5zdGFuY30= | base64 -d", "c-dim");
        }, 80);
    }
}

// ---------- AUTOCOMPLÉTION ----------
function tabComplete() {
    const v   = inp.value;
    const parts = v.split(/\s+/);
    const last  = parts[parts.length - 1];

    // Détermine le répertoire de complétion selon ce qui est déjà tapé
    const slashIdx = last.lastIndexOf("/");
    let prefix, dirPath;
    if (slashIdx === -1) {
        prefix  = last;
        dirPath = null;   // compléter dans cwd
    } else {
        prefix  = last.slice(slashIdx + 1);
        dirPath = last.slice(0, slashIdx) || "/";
    }

    const resolved = dirPath ? resolvePath(dirPath) : { node: currentNode(), absPath: cwd };
    if (!resolved || resolved.node.type !== "dir") return;

    const showHidden = prefix.startsWith(".");
    const matches = Object.keys(resolved.node.children).filter(k =>
        k.startsWith(prefix) && (showHidden || !k.startsWith("."))
    );

    if (matches.length === 0) return;
    if (matches.length === 1) {
        const completed = (slashIdx === -1 ? "" : last.slice(0, slashIdx + 1)) + matches[0];
        parts[parts.length - 1] = completed;
        // Ajoute "/" si c'est un dossier
        if (resolved.node.children[matches[0]].type === "dir") parts[parts.length - 1] += "/";
        inp.value = parts.join(" ");
    } else {
        print(matches.join("    "), "c-dim");
    }
}

// ---------- EXÉCUTION ----------
function execute(cmd) {
    if (!cmd.trim()) { print(""); return; }
    printPrompt(cmd);
    hist.unshift(cmd);
    histIdx = -1;

    // Gestion du pipe simple: cmd | base64 -d
    const pipeIdx = cmd.indexOf("|");
    let mainCmd = cmd, pipeCmd = null;
    if (pipeIdx !== -1) {
        mainCmd = cmd.slice(0, pipeIdx).trim();
        pipeCmd = cmd.slice(pipeIdx + 1).trim();
    }

    const parts = mainCmd.trim().split(/\s+/);
    const c = parts[0].toLowerCase();

    switch(c) {

        // ---- HELP ----
        case "help":
            print("Commandes disponibles :", "c-cyan");
            print("");
            print("  ls [-a] [chemin]   → lister le contenu d'un répertoire", "c-white");
            print("  cd [chemin | ..]   → changer de répertoire (chemins relatifs et absolus)", "c-white");
            print("  cat [chemin]       → afficher un fichier", "c-white");
            print("  strings [fichier]  → extraire les chaînes d'un binaire", "c-white");
            print("  pwd                → chemin courant", "c-white");
            print("  whoami             → utilisateur actuel", "c-white");
            print("  id                 → identité complète", "c-white");
            print("  sudo su            → escalade de privilèges", "c-white");
            print("  echo [texte]       → afficher du texte", "c-white");
            print("  tree [chemin]      → arborescence", "c-white");
            print("  file [chemin]      → type d'un fichier", "c-white");
            print("  find [motif]       → rechercher un fichier", "c-white");
            print("  clear              → nettoyer l'écran", "c-white");
            print("  rm -rf /           → ...", "c-white");
            print("  hint               → indice CTF", "c-white");
            print("");
            print("Navigation :", "c-yellow");
            print("  cd projects/assets    chemin relatif multi-niveaux", "c-dim");
            print("  cd /system/config     chemin absolu", "c-dim");
            print("  cd ..                 répertoire parent", "c-dim");
            print("  cd ../..              deux niveaux en arrière", "c-dim");
            print("  cd ~  ou  cd          retour à la racine", "c-dim");
            print("  Tab                   autocomplétion", "c-dim");
            print("");
            print("Objectif : trouver les 3 flags cachés dans le système.", "c-yellow");
            break;

        // ---- LS ----
        case "ls": {
            const flags    = parts.filter(p => p.startsWith("-"));
            const showHidden = flags.some(f => f.includes("a"));
            const target   = parts.find(p => !p.startsWith("-") && p !== "ls");

            let dirNode, dirLabel;
            if (target) {
                const resolved = resolvePath(target);
                if (!resolved) { print(`ls: ${target}: Aucun fichier ou dossier de ce type`, "c-red"); break; }
                if (resolved.node.type !== "dir") { print(`ls: ${target}: n'est pas un répertoire`, "c-red"); break; }
                dirNode  = resolved.node;
                dirLabel = target;
            } else {
                dirNode  = currentNode();
                dirLabel = "";
            }

            if (dirNode.locked && !isRoot) {
                print(`ls: ${dirLabel || "."}: Permission refusée`, "c-red"); break;
            }

            const items = Object.keys(dirNode.children).filter(k => showHidden || !k.startsWith("."));
            if (!items.length) { print("(vide)", "c-dim"); break; }

            const cols = items.map(k => {
                const e      = dirNode.children[k];
                const isDir  = e.type === "dir";
                const locked = isDir && e.locked && !isRoot;
                const color  = isDir ? "c-cyan" : "c-white";
                return `<span class="${color}">${escHtml(k)}${isDir ? "/" : ""}${locked ? " 🔒" : ""}</span>`;
            });
            printHTML(cols.join("    "));
            break;
        }

        // ---- CD ----
        case "cd": {
            const dest = parts[1];

            // cd ou cd ~ → racine
            if (!dest || dest === "~" || dest === "/") { cwd = []; break; }

            const resolved = resolvePath(dest);
            if (!resolved) {
                print(`cd: ${dest}: Aucun fichier ou dossier de ce type`, "c-red"); break;
            }
            if (resolved.node.type !== "dir") {
                print(`cd: ${dest}: N'est pas un répertoire`, "c-red"); break;
            }
            if (resolved.node.locked && !isRoot) {
                print(`cd: ${dest}: Permission refusée (accès root requis)`, "c-red"); break;
            }
            cwd = resolved.absPath;
            break;
        }

        // ---- CAT ----
        case "cat": {
            const fname = parts[1];
            if (!fname) { print("usage: cat [fichier]", "c-red"); break; }

            const resolved = resolvePath(fname);
            if (!resolved) {
                print(`cat: ${fname}: Aucun fichier ou dossier de ce type`, "c-red"); break;
            }
            if (resolved.node.type === "dir") {
                print(`cat: ${fname}: est un répertoire`, "c-red"); break;
            }

            // Vérif lock sur le répertoire parent
            const parentPath = resolved.absPath.slice(0, -1);
            const parentNode = resolveAbs(parentPath);
            if (parentNode && parentNode.locked && !isRoot) {
                print(`cat: ${fname}: Permission refusée`, "c-red"); break;
            }

            let content = resolved.node.content;

            // Pipe base64 -d
            if (pipeCmd && pipeCmd.includes("base64")) {
                try {
                    content = atob(content.trim());
                } catch(e) {
                    print("base64: données invalides", "c-red"); break;
                }
            }

            content.split("\n").forEach(l => print(l, "c-cyan"));
            checkFlag(content);
            break;
        }

        // ---- STRINGS ----
        case "strings": {
            const fname = parts[1];
            if (!fname) { print("usage: strings [fichier]", "c-red"); break; }

            // Cherche d'abord strings_<fname> dans le même dossier
            const dir = currentNode();
            const baseName = fname.includes("/") ? fname.split("/").pop() : fname;
            const altName  = "strings_" + baseName;

            let resolved = null;
            if (dir.children && dir.children[altName]) {
                resolved = { node: dir.children[altName], absPath: [...cwd, altName] };
            } else {
                resolved = resolvePath(fname);
            }

            if (!resolved || resolved.node.type === "dir") {
                print(`strings: ${fname}: Aucun fichier ou dossier de ce type`, "c-red"); break;
            }

            resolved.node.content.split("\n").forEach(l => print(l, "c-lime"));
            checkFlag(resolved.node.content);
            break;
        }

        // ---- PWD ----
        case "pwd": {
            const path = cwd.length === 0 ? "/" : "/" + cwd.join("/");
            print(path, "c-white");
            break;
        }

        // ---- WHOAMI ----
        case "whoami":
            print(isRoot ? "root" : "visitor", "c-green");
            break;

        // ---- ID ----
        case "id":
            if (isRoot) {
                print("uid=0(root) gid=0(root) groupes=0(root)", "c-orange");
            } else {
                print("uid=1000(visitor) gid=1000(visitor) groupes=1000(visitor)", "c-white");
            }
            break;

        // ---- ECHO ----
        case "echo": {
            const text = parts.slice(1).join(" ");
            if (text.includes("TFVWSVh7YjRzM182NF9pNV90aDNfMW5zdGFuY30=")) {
                if (pipeCmd && pipeCmd.includes("base64")) {
                    print("LUVIX{b4s3_64_i5_th3_1nstanc}", "c-gold");
                    print("[bonus: flag bonus décodé !]", "c-yellow");
                } else {
                    print(text, "c-white");
                    print("[HINT] Essaie de piper dans 'base64 -d'", "c-dim");
                }
            } else {
                print(text, "c-white");
            }
            break;
        }

        // ---- FILE ----
        case "file": {
            const fname = parts[1];
            if (!fname) { print("usage: file [chemin]", "c-red"); break; }
            const resolved = resolvePath(fname);
            if (!resolved) { print(`file: ${fname}: Aucun fichier ou dossier de ce type`, "c-red"); break; }
            const n = resolved.node;
            if (n.type === "dir") {
                print(`${fname}: répertoire${n.locked ? " (protégé)" : ""}`, "c-cyan");
            } else if (fname.endsWith(".dat")) {
                print(`${fname}: données binaires`, "c-white");
            } else if (fname.endsWith(".key")) {
                print(`${fname}: clé PEM`, "c-white");
            } else {
                print(`${fname}: fichier texte ASCII`, "c-white");
            }
            break;
        }

        // ---- FIND ----
        case "find": {
            const pattern = parts[1] || "";
            const results = [];
            function walk(node, path) {
                if (!node.children) return;
                for (const [k, v] of Object.entries(node.children)) {
                    const p = path ? path + "/" + k : k;
                    if (!pattern || k.includes(pattern)) results.push(p);
                    if (v.type === "dir") walk(v, p);
                }
            }
            walk(FS, "");
            if (!results.length) { print("(aucun résultat)", "c-dim"); break; }
            results.forEach(r => print(r, "c-white"));
            break;
        }

        // ---- SUDO ----
        case "sudo":
            if (parts[1] === "su") {
                print("[sudo] Mot de passe pour visitor: ", "c-yellow");
                setTimeout(() => {
                    print("Authentification en cours...", "c-dim");
                    setTimeout(() => {
                        print("Accès root obtenu.", "c-orange");
                        print("Bienvenue, root. Tu te sens puissant maintenant ?", "c-orange");
                        isRoot = true;
                        inp.style.color = "#ff9944";
                        updatePrompt();
                    }, 600);
                }, 800);
            } else {
                print(`sudo: ${parts[1] || "(null)"}: commande introuvable`, "c-red");
            }
            break;

        // ---- TREE ----
        case "tree": {
            const startPath = parts[1] ? resolvePath(parts[1]) : { node: currentNode(), absPath: cwd };
            if (!startPath || startPath.node.type !== "dir") {
                print("tree: répertoire introuvable", "c-red"); break;
            }
            const label = parts[1] || (cwd.length === 0 ? "~" : cwd[cwd.length - 1]);
            print(label + "/", "c-cyan");
            function printTree(node, indent) {
                if (!node.children) return;
                const keys = Object.keys(node.children);
                keys.forEach((k, i) => {
                    const e      = node.children[k];
                    const isLast = i === keys.length - 1;
                    const branch = isLast ? "└── " : "├── ";
                    const color  = e.type === "dir" ? "c-cyan" : "c-white";
                    const lock   = e.locked && !isRoot ? " 🔒" : "";
                    print(indent + branch + k + (e.type === "dir" ? "/" : "") + lock, color);
                    if (e.type === "dir" && !(e.locked && !isRoot)) {
                        printTree(e, indent + (isLast ? "    " : "│   "));
                    }
                });
            }
            printTree(startPath.node, "");
            break;
        }

        // ---- CLEAR ----
        case "clear":
            out.innerHTML = "";
            return;

        // ---- RM ----
        case "rm":
            if (parts[1] === "-rf" && (parts[2] === "/" || parts[2] === "*" || parts[2] === "/*")) {
                triggerPanic();
            } else {
                print("rm: spécifie une cible. (Essaie rm -rf / si tu veux vraiment...)", "c-orange");
            }
            break;

        // ---- HINT ----
        case "hint": {
            const hints = [
                "🔍 Il existe des fichiers que ls ne montre pas par défaut... (ls -a)",
                "🔍 Les fichiers binaires cachent parfois des chaînes lisibles (strings).",
                "🔍 Le vault est verrouillé. Qui pourrait y accéder ?",
                "🔍 Vérifie les variables d'environnement dans .bashrc",
                "🔍 sudo su — l'escalade de privilèges ouvre des portes.",
                "🔍 cd projects/assets — les chemins multi-niveaux fonctionnent.",
            ];
            print(hints[Math.floor(Math.random() * hints.length)], "c-yellow");
            break;
        }

        // ---- INCONNU ----
        default:
            print(`bash: ${escHtml(c)}: commande introuvable. Tape 'help'.`, "c-red");
    }

    updatePrompt();
}

// ---------- OVERLAYS ----------
function triggerPanic() {
    try {
        window.parent.postMessage({ action: "kernelPanic", reason: "rm -rf /" }, window.location.origin);
    } catch (e) {
        // Fallback si jamais postMessage échoue (contexte inattendu)
        document.getElementById("panic")?.classList.add("show");
        setTimeout(() => document.getElementById("panic")?.classList.remove("show"), 4000);
    }
}

function triggerWin() {
    const winFlags = document.getElementById("win-flags-list");
    winFlags.innerHTML = [...foundFlags].filter(f => f in FLAGS)
        .map(f => `<span style="display:block">✓ ${escHtml(f)}</span>`).join("");
    document.getElementById("winner").classList.add("show");
}

function resetGame() {
    cwd      = [];
    isRoot   = false;
    foundFlags = new Set();
    histIdx  = -1;
    hist     = [];
    flagCount.textContent = "0";
    inp.style.color = "#ccffcc";
    document.getElementById("winner").classList.remove("show");
    out.innerHTML = "";
    updatePrompt();
    boot();
}

// ---------- ENTRÉE CLAVIER ----------
inp.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        const v = inp.value;
        inp.value = "";
        execute(v.trim() ? v : "");
    }
    if (e.key === "ArrowUp") {
        e.preventDefault();
        if (hist.length) {
            histIdx = Math.min(histIdx + 1, hist.length - 1);
            inp.value = hist[histIdx];
        }
    }
    if (e.key === "ArrowDown") {
        e.preventDefault();
        histIdx = Math.max(histIdx - 1, -1);
        inp.value = histIdx >= 0 ? hist[histIdx] : "";
    }
    if (e.key === "Tab") {
        e.preventDefault();
        tabComplete();
    }
});

document.getElementById("luvix").addEventListener("click", () => inp.focus());

// ---------- BOOT ----------
function boot() {
    const lines = [
        ["", "c-dim"],
        ["  ██╗     ██╗   ██╗██╗   ██╗██╗██╗  ██╗", "c-green"],
        ["  ██║     ██║   ██║██║   ██║██║╚██╗██╔╝", "c-green"],
        ["  ██║     ██║   ██║██║   ██║██║ ╚███╔╝ ", "c-green"],
        ["  ██║     ██║   ██║╚██╗ ██╔╝██║ ██╔██╗ ", "c-lime"],
        ["  ███████╗╚██████╔╝ ╚████╔╝ ██║██╔╝ ██╗", "c-lime"],
        ["  ╚══════╝ ╚═════╝   ╚═══╝  ╚═╝╚═╝  ╚═╝", "c-lime"],
        ["", "c-dim"],
        ["  OS v0.16.4 — Phosphor Green Edition", "c-dim"],
        ["  Kernel 4.20-retro | tty0 | May 23 2026", "c-dim"],
        ["", ""],
        ["Système initialisé. Connecté en tant que: visitor", "c-white"],
        ["", ""],
        ["┌─ OBJECTIF CTF ──────────────────────────────────┐", "c-yellow"],
        ["│  3 flags sont cachés dans ce système.           │", "c-yellow"],
        ["│  Format: LUVIX{...}                             │", "c-yellow"],
        ["│  Tape 'help' pour commencer, 'hint' si bloqué.  │", "c-yellow"],
        ["└─────────────────────────────────────────────────┘", "c-yellow"],
        ["", ""],
    ];
    let delay = 0;
    lines.forEach(([text, cls]) => {
        setTimeout(() => print(text, cls), delay);
        delay += 30;
    });
    setTimeout(() => { updatePrompt(); inp.focus(); }, delay + 100);
}

boot();
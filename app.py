"""
app.py — VERSION DEBUG / TEST UNIQUEMENT
==========================================
Sert TOUT le contenu de /frontend sans filtrage (pas de whitelist
d'extensions, pas de CSP, pas de Permissions-Policy). L'unique protection
gardée est anti path-traversal (via safe_join), parce que sans elle un
`GET /../../etc/passwd` sort carrément du dossier frontend et ça n'aide en
rien à débugger une texture ou un CDN bloqué.

⚠️ NE JAMAIS DÉPLOYER CETTE VERSION EN PRODUCTION NI L'EXPOSER SUR INTERNET.
Pas de CSP = pas de protection XSS. Pas de whitelist = n'importe quel
fichier posé dans /frontend (y compris par erreur) devient téléchargeable.
Elle sert uniquement à vérifier, en local, si un bug vient du frontend
lui-même ou des restrictions du serveur — une fois la cause identifiée,
revenir à la version stricte/conditionnelle (app.py "normal").
"""

import logging
from pathlib import Path

from flask import Flask, send_from_directory, abort
from werkzeug.utils import safe_join

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

if not FRONTEND_DIR.is_dir():
    raise RuntimeError(f"Dossier frontend introuvable : {FRONTEND_DIR}")

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
logger = logging.getLogger("debug-server")

app = Flask(__name__)


@app.route("/", defaults={"path": "index.html"})
@app.route("/<path:path>")
def serve_anything(path: str):
    """
    Sert n'importe quel fichier sous /frontend, sans whitelist de dossier
    ni d'extension. Seule garde-fou : le fichier doit rester DANS
    /frontend (safe_join renvoie None sinon, ex: ../../secret.env).
    """
    full_path = safe_join(str(FRONTEND_DIR), path)
    if full_path is None:
        logger.warning(f"Tentative de path traversal bloquée : {path}")
        abort(404)

    full_path = Path(full_path)

    # Si on demande un dossier, on tente index.html dedans
    if full_path.is_dir():
        path = f"{path.rstrip('/')}/index.html"

    try:
        return send_from_directory(FRONTEND_DIR, path, conditional=True)
    except FileNotFoundError:
        abort(404)


@app.after_request
def no_cache(response):
    # Pas de cache du tout en debug : on veut voir chaque changement
    # immédiatement, sans avoir à vider le cache du navigateur.
    response.headers["Cache-Control"] = "no-store"
    return response


@app.errorhandler(404)
def not_found(e):
    return "Not Found (debug server)", 404


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("SERVEUR DE DEBUG — sécurité désactivée, /frontend entier exposé")
    logger.info(f"Frontend directory : {FRONTEND_DIR}")
    logger.info("NE PAS EXPOSER SUR INTERNET NI UTILISER EN PRODUCTION")
    logger.info("=" * 60)
    app.run(host="127.0.0.1", port=5000, debug=True)
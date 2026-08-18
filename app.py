"""
Application Flask — sert des fichiers statiques (frontend) avec contrôles
d'accès stricts. Conçue pour tourner derrière un reverse proxy (nginx) et
un serveur WSGI de production (gunicorn / waitress), voir wsgi.py.
"""

import os
import re
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, send_from_directory, abort, request
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import safe_join

# ====================== CONFIGURATION GÉNÉRALE ======================
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

# "production" par défaut : le mode debug ne s'active QUE si la variable
# d'environnement FLASK_ENV=development est explicitement définie.
ENV = os.environ.get("FLASK_ENV", "production").lower()
DEBUG = ENV == "development"

if not FRONTEND_DIR.is_dir():
    raise RuntimeError(f"Dossier frontend introuvable : {FRONTEND_DIR}")

ALLOWED_FOLDERS = {"css", "js", "assets"}
ALLOWED_EXTENSIONS = {
    ".html", ".css", ".js",
    ".png", ".jpg", ".jpeg", ".webp", ".ico",
    ".pdf", ".mp3",
}

# Pages HTML statiques exposées à la racine (route -> fichier physique)
HTML_ROUTES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/desktop.html": "desktop.html",
    "/files.html": "files.html",
    "/terminal.html": "terminal.html",
    "/galerie.html": "galerie.html",
    "/navigateur.html": "navigateur.html",
    "/3DEngine.html": "3DEngine.html",
    "/Apropos.html": "Apropos.html",
}

# ====================== LOGGING ======================

def sanitize_for_log(value, max_len: int = 200) -> str:
    """Neutralise les retours à la ligne (injection de logs) et tronque."""
    if value is None:
        return "-"
    value = str(value).replace("\r", "").replace("\n", "")
    value = re.sub(r"[\x00-\x1f\x7f]", "", value)
    return value[:max_len]


log_formatter = logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger("app")
logger.setLevel(logging.INFO)

file_handler = RotatingFileHandler(
    LOG_DIR / "app.log", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
)
file_handler.setFormatter(log_formatter)
logger.addHandler(file_handler)

# La console n'est utile qu'en développement
if DEBUG:
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    logger.addHandler(console_handler)

access_logger = logging.getLogger("access")
access_logger.setLevel(logging.INFO)
access_handler = RotatingFileHandler(
    LOG_DIR / "access.log", maxBytes=10 * 1024 * 1024, backupCount=7, encoding="utf-8"
)
access_handler.setFormatter(
    logging.Formatter("%(asctime)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
)
access_logger.addHandler(access_handler)
access_logger.propagate = False

# ====================== APPLICATION ======================
app = Flask(__name__)

# Si l'app tourne derrière un reverse proxy (nginx, Cloudflare...), on fait
# confiance à UN SEUL saut de proxy pour X-Forwarded-For / -Proto / -Host.
# Adapter x_for/x_proto au nombre réel de proxies devant l'app.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

app.config.update(
    MAX_CONTENT_LENGTH=20 * 1024 * 1024,  # 20 Mo max par requête
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "script-src 'self'; frame-ancestors 'self'"
    )
    if not DEBUG:
        # HSTS : à activer uniquement si le site est bien servi en HTTPS.
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
    response.headers.pop("Server", None)  # évite de divulguer la stack
    return response


@app.before_request
def log_request():
    access_logger.info(
        f"{sanitize_for_log(request.remote_addr)} | {request.method} "
        f"{sanitize_for_log(request.path)} | "
        f"UA: {sanitize_for_log(request.headers.get('User-Agent', 'Unknown'), 80)}"
    )


@app.after_request
def log_response(response):
    if response.status_code >= 400:
        logger.warning(
            f"{sanitize_for_log(request.remote_addr)} -> {request.method} "
            f"{sanitize_for_log(request.path)} -> {response.status_code}"
        )
    return response


@app.errorhandler(404)
def not_found(e):
    return "Not Found", 404


@app.errorhandler(403)
def forbidden(e):
    logger.warning(
        f"403 | {sanitize_for_log(request.remote_addr)} | {sanitize_for_log(request.path)}"
    )
    return "Forbidden", 403


@app.errorhandler(413)
def too_large(e):
    return "Payload Too Large", 413


@app.errorhandler(500)
def internal_error(e):
    logger.exception("500 Internal Server Error")
    return "Internal Server Error", 500


# ====================== ROUTES HTML ======================
def _make_html_view(filename: str):
    def _view():
        return send_from_directory(FRONTEND_DIR, filename)
    return _view


for _route, _target_file in HTML_ROUTES.items():
    _endpoint = "html_" + (_route if _route != "/" else "root").strip("/").replace("/", "_").replace(".", "_")
    app.add_url_rule(
        _route, endpoint=_endpoint, view_func=_make_html_view(_target_file)
    )


# ====================== FICHIERS STATIQUES (css/js/assets) ======================
@app.route("/<folder>/<path:filename>")
def serve_static(folder: str, filename: str):
    # <folder> (sans "path:") empêche folder de contenir des "/" et donc
    # de contourner la vérification ALLOWED_FOLDERS.
    if folder not in ALLOWED_FOLDERS:
        logger.warning(f"Dossier non autorisé : {sanitize_for_log(folder)}")
        abort(404)

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        logger.warning(
            f"Extension interdite : {sanitize_for_log(ext)} sur {sanitize_for_log(filename)}"
        )
        abort(403)

    directory = FRONTEND_DIR / folder

    # Défense en profondeur contre le path traversal, en plus de la
    # protection déjà intégrée à send_from_directory.
    if safe_join(str(directory), filename) is None:
        abort(404)

    try:
        response = send_from_directory(directory, filename, conditional=True)
    except FileNotFoundError:
        abort(404)

    if ext == ".pdf":
        response.headers["Content-Disposition"] = f'inline; filename="{Path(filename).name}"'
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    else:
        response.headers["Cache-Control"] = "public, max-age=3600"

    return response


# ====================== ROUTE SPÉCIALE PDF ======================
@app.route("/assets/files/<path:filename>")
def serve_pdf(filename: str):
    if not filename.lower().endswith(".pdf"):
        abort(403)

    directory = FRONTEND_DIR / "assets" / "files"

    if safe_join(str(directory), filename) is None:
        abort(404)

    try:
        response = send_from_directory(directory, filename, conditional=True)
    except FileNotFoundError:
        abort(404)

    response.headers.update({
        "Content-Disposition": f'inline; filename="{Path(filename).name}"',
        "Cache-Control": "no-cache, must-revalidate",
    })
    return response


# ====================== POINT D'ENTRÉE (développement uniquement) ======================
if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Démarrage en mode développement — NE PAS utiliser en production")
    logger.info(f"Frontend directory : {FRONTEND_DIR}")
    logger.info("=" * 60)
    # host=127.0.0.1 : n'écoute que localement en dev. En prod, ne pas
    # utiliser app.run() du tout — voir wsgi.py + gunicorn.
    app.run(host="127.0.0.1", port=5000, debug=DEBUG)
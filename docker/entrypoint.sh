#!/bin/sh

# --- Auto-install Composer dependencies (fresh clone) ---
if [ ! -f vendor/autoload.php ]; then
    echo "[entrypoint] vendor/ not found — running composer install..."
    # Docker Desktop Windows volume mounts have filesystem race conditions
    # that break composer's parallel downloads. Work around by installing
    # to a container-local path first, then copying to the mounted volume.
    cp composer.json /tmp/composer.json
    cp composer.lock /tmp/composer.lock
    cd /tmp
    composer install --no-interaction --no-progress --no-scripts
    cd /var/www/html
    cp -r /tmp/vendor vendor
    rm -rf /tmp/vendor /tmp/composer.json /tmp/composer.lock
    # Run post-install scripts (package:discover, etc.)
    composer run-script post-autoload-dump 2>/dev/null || true
    if [ ! -f vendor/autoload.php ]; then
        echo "[entrypoint] ERROR: composer install failed"
        exit 1
    fi
    echo "[entrypoint] composer install complete"
fi

# --- [OPTIONAL] First-run auto-setup ---
# Uncomment the block below for full one-shot deploy.
# NOTE: key:generate writes to backend/.env, but docker-compose.yml
# environment variables override it. After first run, copy the generated
# APP_KEY from backend/.env to root .env and restart: docker compose up -d api
#
# if [ ! -f .env ]; then
#     cp .env.example .env
#     php artisan key:generate --force
#     echo "[entrypoint] .env created and APP_KEY generated"
# fi
#
# # Wait for database (simple retry loop)
# until php artisan db:monitor --databases=pgsql 2>/dev/null; do
#     echo "[entrypoint] waiting for database..."
#     sleep 2
# done
#
# php artisan migrate --force 2>/dev/null || true
# echo "[entrypoint] migrations complete"

exec "$@"

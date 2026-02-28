#!/bin/sh
set -e

# --- Auto-install Composer dependencies (fresh clone) ---
if [ ! -f vendor/autoload.php ]; then
    echo "[entrypoint] vendor/ not found — running composer install..."
    mkdir -p vendor
    COMPOSER_PROCESS_TIMEOUT=600 composer install --no-interaction --no-progress
fi

# --- [OPTIONAL] First-run auto-setup ---
# Uncomment the block below for full one-shot deploy.
# It will auto-create .env, generate APP_KEY, wait for DB, and run migrations.
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

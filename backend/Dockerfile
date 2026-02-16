FROM php:8.4-fpm

# System dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpq-dev \
    libcurl4-openssl-dev \
    unzip \
    && docker-php-ext-install pdo pdo_pgsql curl pcntl \
    && rm -rf /var/lib/apt/lists/*

# Install Composer (for artisan commands inside container)
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# In dev, the entire backend/ is volume-mounted, 
# so vendor/ already exists from the host.
# For production, uncomment the following:
# COPY composer.json composer.lock ./
# RUN composer install --no-dev --no-scripts --no-autoloader
# COPY . .
# RUN composer dump-autoload --optimize

# Set permissions for Laravel storage and cache
RUN mkdir -p /var/www/html/storage /var/www/html/bootstrap/cache \
    && chown -R www-data:www-data /var/www/html

EXPOSE 9000
CMD ["php-fpm"]

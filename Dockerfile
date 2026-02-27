ARG BUILD_FROM
FROM $BUILD_FROM

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        php-fpm \
        php-cli \
        mplayer \
        alsa-utils \
        bc \
        cron \
    && rm -rf /var/lib/apt/lists/*

# Remove default nginx site
RUN rm -f /etc/nginx/sites-enabled/default

# Copy nginx config (PHP_FPM_SOCK placeholder replaced at runtime)
COPY ha-nginx.conf /etc/nginx/sites-available/trafficcontrol
RUN ln -sf /etc/nginx/sites-available/trafficcontrol /etc/nginx/sites-enabled/trafficcontrol

# Copy app files
COPY css/ /var/www/html/trafficcontrol/css/
COPY js/ /var/www/html/trafficcontrol/js/
COPY img/ /var/www/html/trafficcontrol/img/
COPY php/ /var/www/html/trafficcontrol/php/
COPY elFinder-2.1.65/ /var/www/html/trafficcontrol/elFinder-2.1.65/
COPY jquery-ui-1.13.3/ /var/www/html/trafficcontrol/jquery-ui-1.13.3/
COPY index.html more.html find.html info.php /var/www/html/trafficcontrol/

# Bundle chime files; they are copied to /media on first run
COPY Music/.system/ /app-defaults/.system/

# Copy startup script
COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]

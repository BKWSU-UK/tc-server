ARG BUILD_FROM
FROM $BUILD_FROM

# Install dependencies (works on both Alpine and Debian base images).
# On Alpine we also pull the GNU toolchain (coreutils, grep w/ PCRE, procps,
# bash, util-linux) plus tzdata so the app's exec() commands behave like GNU.
RUN if command -v apk >/dev/null 2>&1; then \
        # --- Alpine ---
        PHPV=""; \
        for v in 84 83 82 81; do \
            if apk info "php$v" >/dev/null 2>&1 || apk add --no-cache --simulate "php$v" >/dev/null 2>&1; then PHPV="$v"; break; fi; \
        done; \
        [ -n "$PHPV" ] || PHPV=83; \
        apk add --no-cache \
            nginx \
            "php${PHPV}" "php${PHPV}-fpm" "php${PHPV}-cli" \
            "php${PHPV}-json" "php${PHPV}-mbstring" "php${PHPV}-session" \
            "php${PHPV}-ctype" "php${PHPV}-fileinfo" "php${PHPV}-calendar" \
            "php${PHPV}-opcache" "php${PHPV}-phar" "php${PHPV}-openssl" \
            mplayer alsa-utils pulseaudio-utils bc \
            coreutils grep procps bash util-linux tzdata \
        && ln -sf "/usr/bin/php${PHPV}" /usr/bin/php \
        && rm -f /etc/nginx/http.d/default.conf; \
    else \
        # --- Debian / Ubuntu ---
        apt-get update && \
        apt-get install -y --no-install-recommends \
            nginx \
            php-fpm php-cli php-mbstring php-calendar \
            mplayer alsa-utils pulseaudio-utils bc cron \
        && rm -rf /var/lib/apt/lists/* \
        && rm -f /etc/nginx/sites-enabled/default; \
    fi

# Stage nginx config; run.sh installs it into the correct dir for the distro
# (sites-available on Debian, http.d on Alpine) and patches PHP_FPM_SOCK at runtime.
COPY ha-nginx.conf /app-defaults/trafficcontrol.conf

# Copy app files
COPY css/ /var/www/html/trafficcontrol/css/
COPY js/ /var/www/html/trafficcontrol/js/
COPY img/ /var/www/html/trafficcontrol/img/
COPY php/ /var/www/html/trafficcontrol/php/
COPY scripts/ /var/www/html/trafficcontrol/scripts/
COPY elFinder-2.1.65/ /var/www/html/trafficcontrol/elFinder-2.1.65/
COPY jquery-ui-1.13.3/ /var/www/html/trafficcontrol/jquery-ui-1.13.3/
COPY index.html more.html /var/www/html/trafficcontrol/

# Bundle chime files; they are copied to /media on first run
COPY Music/.system/ /app-defaults/.system/

# Bundle default playlist; copied to /data on first run
COPY .tcsys/playListDbDefault.JSON /app-defaults/playListDbDefault.JSON

# Copy startup script
COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]

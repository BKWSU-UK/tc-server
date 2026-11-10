FROM php:8.5-fpm-alpine

# Install required PHP extensions
RUN apk add --no-cache \
    php85-mbstring \
    php85-session \
    php85-ctype \
    php85-fileinfo \
    php85-pcntl \
    mplayer \
    alsa-utils \
    pulseaudio-utils \
    bc \
    coreutils \
    grep \
    procps \
    bash \
    util-linux \
    tzdata

# Set working directory
WORKDIR /var/www/html

# Copy the application (will be mounted as volume in docker-compose)
# This is just to have a working base
COPY . /var/www/html/

# Create .tcsys directory with default playlist
RUN mkdir -p .tcsys && \
    cp .tcsys/playListDbDefault.JSON .tcsys/playListDb.JSON && \
    mkdir -p Music/.system && \
    touch Music/.system/Chime_start.flac Music/.system/Chime_end.flac

# Set permissions
RUN chown -R www-data:www-data /var/www/html

# Give www-data access to the host's /dev/snd devices (passed through in
# docker-compose.yml). AUDIO_GID must match the host's audio group GID.
ARG AUDIO_GID=29
RUN if getent group "$AUDIO_GID" >/dev/null; then \
      grp=$(getent group "$AUDIO_GID" | cut -d: -f1); \
    else \
      addgroup -g "$AUDIO_GID" hostaudio && grp=hostaudio; \
    fi && \
    addgroup www-data "$grp"

# Configure PHP
RUN echo "date.timezone = UTC" > /usr/local/etc/php/conf.d/timezone.ini

# Copy custom PHP-FPM pool configuration
COPY test-rig/php-fpm.conf /usr/local/etc/php-fpm.d/www.conf

EXPOSE 9000

CMD ["php-fpm"]

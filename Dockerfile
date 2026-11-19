# 찰랑찰랑 미용실 예약 – php:apache + SQLite
FROM php:8.3-apache

ENV TZ=Asia/Seoul \
    DATA_DIR=/var/www/data

# php:apache 이미지에는 pdo_sqlite 가 기본 포함되어 있음
RUN set -eux; \
    cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"; \
    { \
      echo "date.timezone=Asia/Seoul"; \
      echo "upload_max_filesize=10M"; \
      echo "post_max_size=12M"; \
      echo "expose_php=Off"; \
      echo "display_errors=Off"; \
      echo "log_errors=On"; \
      echo "session.use_strict_mode=1"; \
    } > /usr/local/etc/php/conf.d/salon.ini; \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone; \
    a2enmod headers rewrite >/dev/null; \
    { \
      echo "ServerTokens Prod"; \
      echo "ServerSignature Off"; \
      echo "TraceEnable Off"; \
      echo "<Directory /var/www/html>"; \
      echo "  Options -Indexes +FollowSymLinks"; \
      echo "  AllowOverride All"; \
      echo "</Directory>"; \
    } > /etc/apache2/conf-available/salon.conf; \
    a2enconf salon >/dev/null; \
    mkdir -p /var/www/data && chown -R www-data:www-data /var/www/data

COPY src/ /var/www/html/
COPY docker/entrypoint.sh /usr/local/bin/salon-entrypoint
RUN chmod 755 /usr/local/bin/salon-entrypoint \
 && rm -rf /var/www/html/data \
 && chown -R root:root /var/www/html && chmod -R a+rX,go-w /var/www/html

VOLUME ["/var/www/data"]
EXPOSE 80
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS -o /dev/null http://127.0.0.1/api.php?a=bootstrap || exit 1

ENTRYPOINT ["salon-entrypoint"]
CMD ["apache2-foreground"]

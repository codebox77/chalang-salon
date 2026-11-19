#!/bin/sh
# NAS 공유 폴더를 /var/www/data 에 연결해도 Apache(www-data)가 쓸 수 있도록 권한을 맞춘다.
#  - PUID/PGID 를 주면 www-data 를 그 사용자/그룹 번호로 바꿔 실행 (NAS 파일 소유자와 일치)
#  - 안 주면 데이터 폴더 소유자를 www-data 로 변경
set -e
DATA_DIR="${DATA_DIR:-/var/www/data}"
mkdir -p "$DATA_DIR"
if [ -n "${PGID:-}" ] && [ "$PGID" != "$(id -g www-data)" ]; then
  groupmod -o -g "$PGID" www-data
fi
if [ -n "${PUID:-}" ] && [ "$PUID" != "$(id -u www-data)" ]; then
  usermod -o -u "$PUID" www-data
fi
chown -R www-data:www-data "$DATA_DIR" 2>/dev/null || echo "[salon] 경고: $DATA_DIR 권한을 바꾸지 못했습니다. PUID/PGID 를 NAS 사용자 번호로 지정해 보세요." >&2
chmod 750 "$DATA_DIR" 2>/dev/null || true
exec docker-php-entrypoint "$@"

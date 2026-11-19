<?php
declare(strict_types=1);

date_default_timezone_set('Asia/Seoul');
// Docker: DATA_DIR=/var/www/data (웹 루트 밖). 일반 호스팅: 앱 폴더 안 data/ (.htaccess 로 접근 차단)
define('DATA_DIR', rtrim(getenv('DATA_DIR') ?: __DIR__ . '/data', '/\\'));
const DEFAULT_LOGO_URL = 'https://minsol.pe.kr/crcr/assets/img/logo.png';
const TOKEN_COOKIE = 'crcr_token';
const USER_COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#ea580c'];

const PW_MIN = 6;               // 새 비밀번호 최소 길이
const THROTTLE_MAX_KEY = 8;     // 같은 아이디로 15분에 8번 틀리면 잠시 잠금
const THROTTLE_MAX_IP = 30;     // 같은 IP 에서 15분에 30번 틀리면 잠시 잠금
const THROTTLE_WINDOW = 900;

class ApiError extends Exception {}

/** 모든 응답에 붙이는 보안 헤더 (클릭재킹·MIME 스니핑 방지 등) */
function security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
        . "img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
}

/** 첫 관리자 생성 시 필요한 설치 코드 (Docker 환경변수 SETUP_CODE). 없으면 '' */
function setup_code(): string
{
    return trim((string)(getenv('SETUP_CODE') ?: ''));
}

/** 실제 접속자 IP. NAS 역방향 프록시(사설/루프백 주소) 뒤에서는 프록시가 붙인 마지막 X-Forwarded-For 사용 */
function client_ip(): string
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $xff = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($xff !== '' && !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        $parts = array_map('trim', explode(',', $xff));
        $last = end($parts);
        if (filter_var($last, FILTER_VALIDATE_IP)) return $last;
    }
    return $ip;
}

/* ---------- 로그인 시도 제한 (무차별 대입 방지) ---------- */
function throttle_check(string $key): void
{
    $since = time() - THROTTLE_WINDOW;
    $db = db();
    $db->prepare('DELETE FROM login_fail WHERE at < ?')->execute([time() - 86400]);
    $st = $db->prepare('SELECT COUNT(*) FROM login_fail WHERE k=? AND at>=?');
    $st->execute([$key, $since]);
    $byKey = (int)$st->fetchColumn();
    $st = $db->prepare('SELECT COUNT(*) FROM login_fail WHERE ip=? AND at>=?');
    $st->execute([client_ip(), $since]);
    $byIp = (int)$st->fetchColumn();
    if ($byKey >= THROTTLE_MAX_KEY || $byIp >= THROTTLE_MAX_IP) {
        fail('비밀번호를 여러 번 틀려 잠시 잠겼습니다. 15분 후 다시 시도해 주세요.', 429);
    }
}
function throttle_fail(string $key): void
{
    db()->prepare('INSERT INTO login_fail(k, ip, at) VALUES(?,?,?)')->execute([$key, client_ip(), time()]);
}
function throttle_clear(string $key): void
{
    db()->prepare('DELETE FROM login_fail WHERE k=?')->execute([$key]);
}

function now(): string { return date('Y-m-d H:i:s'); }
function today(): string { return date('Y-m-d'); }
function fail(string $msg, int $code = 400): never { throw new ApiError($msg, $code); }

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(DATA_DIR)) @mkdir(DATA_DIR, 0775, true);
    if (!is_file(DATA_DIR . '/.htaccess')) {
        @file_put_contents(DATA_DIR . '/.htaccess', "Require all denied\n");
        @file_put_contents(DATA_DIR . '/index.html', '');
    }
    $pdo = new PDO('sqlite:' . db_path());
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('PRAGMA busy_timeout=5000');
    migrate($pdo);
    return $pdo;
}

/** DB 파일 이름에 임의 문자열을 붙여 웹에서 추측해 내려받을 수 없게 한다. */
function db_path(): string
{
    $found = glob(DATA_DIR . '/salon_*.db');
    if ($found) return $found[0];
    return DATA_DIR . '/salon_' . bin2hex(random_bytes(12)) . '.db';
}

function migrate(PDO $db): void
{
    $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pw TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_staff INTEGER NOT NULL DEFAULT 1,
  color TEXT,
  tpl_free TEXT DEFAULT '',
  tpl_appt TEXT DEFAULT '',
  lunch_start TEXT DEFAULT '',
  lunch_end TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT, last_used TEXT, ua TEXT);
CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 30, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS statuses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT, blocks INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '', memo TEXT DEFAULT '', created_at TEXT);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'appt',
  staff_id INTEGER,
  customer_id INTEGER,
  customer_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  services TEXT DEFAULT '',
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  status_id INTEGER,
  memo TEXT DEFAULT '',
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_sched_date ON schedules(date);
CREATE INDEX IF NOT EXISTS ix_sched_cust ON schedules(customer_id);
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT, action TEXT, target TEXT, detail TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_logs_time ON logs(created_at);
CREATE TABLE IF NOT EXISTS login_fail (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT NOT NULL, ip TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_login_fail ON login_fail(k, at);
CREATE TABLE IF NOT EXISTS suggestions (kind TEXT NOT NULL, value TEXT NOT NULL, cnt INTEGER NOT NULL DEFAULT 1, last_used TEXT, PRIMARY KEY(kind, value));
SQL);

    $seeded = $db->query("SELECT v FROM settings WHERE k='seeded'")->fetchColumn();
    if (!$seeded) {
        $db->beginTransaction();
        $services = [
            ['남성 커트', 30], ['여성 커트', 40], ['앞머리 커트', 10], ['드라이', 30], ['샴푸', 10],
            ['일반펌', 120], ['디지털펌', 150], ['셋팅펌', 150], ['다운펌', 30], ['볼륨매직', 150],
            ['매직 스트레이트', 150], ['뿌리 염색', 60], ['전체 염색', 120], ['탈색', 120],
            ['클리닉', 60], ['두피 케어', 60], ['업스타일', 60],
        ];
        $st = $db->prepare('INSERT INTO services(name, minutes, sort) VALUES(?,?,?)');
        foreach ($services as $i => [$n, $m]) $st->execute([$n, $m, $i]);

        $statuses = [
            ['임시', '#f59e0b', 1], ['확정', '#10b981', 1], ['변경됨', '#6366f1', 1],
            ['취소됨', '#9ca3af', 0], ['통화함', '#0ea5e9', 1], ['문자 전송함', '#ec4899', 1],
        ];
        $st = $db->prepare('INSERT INTO statuses(name, color, blocks, sort) VALUES(?,?,?,?)');
        foreach ($statuses as $i => [$n, $c, $b]) $st->execute([$n, $c, $b, $i]);
        $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('seeded','1')");
        $db->commit();
    }
}

function default_settings(): array
{
    $hours = [];
    for ($d = 0; $d < 7; $d++) {
        // 0=일 … 6=토. 기본: 월~토 10~20시, 일요일 10~18시
        $hours[] = ['closed' => false, 'open' => '10:00', 'close' => $d === 0 ? '18:00' : '20:00'];
    }
    return [
        'shop_name' => '찰랑찰랑',
        'logo_file' => '',
        'logo_ver' => '1',
        'hours' => json_encode($hours),
        'break_per_hour' => '0',
        'breaks' => '[]',
        'lunch_start' => '13:00',
        'lunch_end' => '14:00',
        'slot_step' => '30',
        'allow_edit_others' => '1',
        'tpl_free' => "안녕하세요, {미용실}입니다 😊\n예약 가능한 시간 안내드려요.\n\n{빈시간}\n\n원하시는 시간을 알려주시면 예약 도와드릴게요!",
        'tpl_appt' => "[{미용실}] 예약 안내\n{고객}님, 예약 내용 안내드립니다.\n\n📅 {날짜} {시간}\n✂️ {시술}\n💇 담당: {담당}\n\n변경이 필요하시면 편하게 연락 주세요. 감사합니다!",
    ];
}

function settings(): array
{
    $s = default_settings();
    foreach (db()->query('SELECT k, v FROM settings') as $r) $s[$r['k']] = $r['v'];
    return $s;
}

function setting(string $k): string { return settings()[$k] ?? ''; }

function set_setting(string $k, string $v): void
{
    db()->prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')->execute([$k, $v]);
}

/* ---------- 인증 ---------- */

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function issue_token(int $uid): void
{
    $t = bin2hex(random_bytes(32));
    db()->prepare('INSERT INTO tokens(hash, user_id, created_at, last_used, ua) VALUES(?,?,?,?,?)')
        ->execute([hash('sha256', $t), $uid, now(), now(), substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250)]);
    // 비밀번호를 바꾸기 전까지 이 기기에서 계속 로그인 유지 (10년)
    setcookie(TOKEN_COOKIE, $t, [
        'expires' => time() + 86400 * 3650, 'path' => '/', 'httponly' => true,
        'samesite' => 'Lax', 'secure' => is_https(),
    ]);
}

function clear_token_cookie(): void
{
    setcookie(TOKEN_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => is_https()]);
}

function current_user(): ?array
{
    static $cached = false;
    if ($cached !== false) return $cached;
    $cached = null;
    $t = $_COOKIE[TOKEN_COOKIE] ?? '';
    if (!is_string($t) || strlen($t) !== 64) return null;
    $h = hash('sha256', $t);
    $st = db()->prepare('SELECT u.*, t.last_used AS token_used FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ? AND u.deleted = 0');
    $st->execute([$h]);
    $u = $st->fetch();
    if (!$u) return null;
    if (($u['token_used'] ?? '') < date('Y-m-d H:i:s', time() - 3600)) {
        db()->prepare('UPDATE tokens SET last_used=? WHERE hash=?')->execute([now(), $h]);
    }
    unset($u['token_used']);
    $cached = $u;
    return $u;
}

function need_user(): array
{
    $u = current_user();
    if (!$u) fail('로그인이 필요합니다.', 401);
    return $u;
}

function need_admin(): array
{
    $u = need_user();
    if (!(int)$u['is_admin']) fail('관리자만 할 수 있습니다.', 403);
    return $u;
}

function public_user(array $u): array
{
    return [
        'id' => (int)$u['id'], 'username' => $u['username'], 'name' => $u['name'],
        'is_admin' => (int)$u['is_admin'], 'is_staff' => (int)$u['is_staff'], 'color' => $u['color'],
        'lunch_start' => $u['lunch_start'] ?? '', 'lunch_end' => $u['lunch_end'] ?? '',
        'sort' => (int)$u['sort'], 'created_at' => $u['created_at'],
    ];
}

/* ---------- 로그 / 자동완성 ---------- */

function logit(string $action, string $target, string $detail = ''): void
{
    $u = current_user();
    db()->prepare('INSERT INTO logs(user_id, user_name, action, target, detail, created_at) VALUES(?,?,?,?,?,?)')
        ->execute([$u['id'] ?? null, $u ? ($u['name'] . ' (' . $u['username'] . ')') : '-', $action, $target, $detail, now()]);
}

function remember(string $kind, $v): void
{
    $v = trim((string)$v);
    if ($v === '' || mb_strlen($v) > 300) return;
    db()->prepare('INSERT INTO suggestions(kind, value, cnt, last_used) VALUES(?,?,1,?)
        ON CONFLICT(kind, value) DO UPDATE SET cnt = cnt + 1, last_used = excluded.last_used')
        ->execute([$kind, $v, now()]);
}

/* ---------- 검증 ---------- */

function v_str($v, int $max = 200): string
{
    $v = trim((string)($v ?? ''));
    if (mb_strlen($v) > $max) $v = mb_substr($v, 0, $max);
    return $v;
}

function v_date($v): string
{
    $v = (string)$v;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || !strtotime($v)) fail('날짜 형식이 올바르지 않습니다.');
    return $v;
}

function v_time($v, bool $allowEmpty = false): string
{
    $v = trim((string)$v);
    if ($allowEmpty && $v === '') return '';
    if (preg_match('/^(\d{1,2}):?(\d{2})$/', $v, $m) && (int)$m[1] < 24 && (int)$m[2] < 60) {
        return sprintf('%02d:%02d', (int)$m[1], (int)$m[2]);
    }
    fail('시간 형식이 올바르지 않습니다: ' . $v);
}

function v_color($v, string $def = '#888888'): string
{
    $v = (string)$v;
    return preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? $v : $def;
}

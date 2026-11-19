<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
ini_set('display_errors', '0');
security_headers();

$a = (string)($_GET['a'] ?? '');

/* ---------- 로고 (이미지 응답) ---------- */
if ($a === 'logo') {
    serve_logo();
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$in = [];
if ($isPost) {
    // 다른 사이트에서의 요청 차단 (커스텀 헤더는 교차 출처에서 임의로 보낼 수 없음)
    if (($_SERVER['HTTP_X_REQ'] ?? '') !== '1') {
        http_response_code(403);
        echo json_encode(['error' => '잘못된 요청입니다.']);
        exit;
    }
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_starts_with($ct, 'application/json')) {
        $in = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
    } else {
        $in = $_POST;
    }
}

function out(array $data): never
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function need_post(): void
{
    global $isPost;
    if (!$isPost) fail('POST 요청이 필요합니다.', 405);
}

try {
    switch ($a) {
        case 'bootstrap': out(bootstrap());
        case 'setup': need_post(); out(do_setup($in));
        case 'login': need_post(); out(do_login($in));
        case 'logout': need_post(); out(do_logout());
        case 'logout_others': need_post(); out(logout_others());
        case 'schedules': need_user(); out(['schedules' => get_schedules(v_date($_GET['from'] ?? ''), v_date($_GET['to'] ?? ''))]);
        case 'schedule_save': need_post(); out(schedule_save($in));
        case 'schedule_status': need_post(); out(schedule_status($in));
        case 'schedule_delete': need_post(); out(schedule_delete($in));
        case 'customers': need_user(); out(['customers' => get_customers()]);
        case 'customer': need_user(); out(get_customer((string)($_GET['name'] ?? '')));
        case 'customer_save': need_post(); out(customer_save($in));
        case 'settings_save': need_post(); out(settings_save($in));
        case 'logo_upload': need_post(); out(logo_upload());
        case 'logo_reset': need_post(); need_admin(); set_setting('logo_file', ''); bump_logo(); logit('설정', '로고', '기본 로고로 되돌림'); out(['ok' => 1, 'logo_ver' => setting('logo_ver')]);
        case 'services_save': need_post(); out(services_save($in));
        case 'statuses_save': need_post(); out(statuses_save($in));
        case 'user_save': need_post(); out(user_save($in));
        case 'user_delete': need_post(); out(user_delete($in));
        case 'me_save': need_post(); out(me_save($in));
        case 'password': need_post(); out(change_password($in));
        case 'logs': need_admin(); out(get_logs());
        case 'suggestions': need_user(); out(['suggestions' => get_suggestions()]);
        default: fail('알 수 없는 요청입니다.', 404);
    }
} catch (ApiError $e) {
    http_response_code($e->getCode() ?: 400);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    error_log((string)$e);
    // 내부 오류 내용(경로·SQL 등)은 서버 로그에만 남기고 사용자에게는 일반 메시지
    echo json_encode(['error' => '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'], JSON_UNESCAPED_UNICODE);
}

/* =========================================================
 *  기본 정보
 * ========================================================= */

function client_settings(): array
{
    $s = settings();
    return [
        'shop_name' => $s['shop_name'],
        'logo_ver' => $s['logo_ver'],
        'has_custom_logo' => $s['logo_file'] !== '' ? 1 : 0,
        'hours' => json_decode($s['hours'], true),
        'break_per_hour' => (int)$s['break_per_hour'],
        'breaks' => json_decode($s['breaks'], true) ?: [],
        'lunch_start' => $s['lunch_start'],
        'lunch_end' => $s['lunch_end'],
        'slot_step' => (int)$s['slot_step'] ?: 30,
        'allow_edit_others' => (int)$s['allow_edit_others'],
        'tpl_free' => $s['tpl_free'],
        'tpl_appt' => $s['tpl_appt'],
    ];
}

function bootstrap(): array
{
    $s = settings();
    $hasUsers = (int)db()->query('SELECT COUNT(*) FROM users WHERE deleted=0')->fetchColumn() > 0;
    $res = [
        'needSetup' => !$hasUsers,
        'setupCode' => !$hasUsers && setup_code() !== '',
        'pwMin' => PW_MIN,
        'shop' => ['name' => $s['shop_name'], 'logo_ver' => $s['logo_ver']],
        'today' => today(),
        'me' => null,
    ];
    $me = current_user();
    if (!$me) return $res;
    $res['me'] = public_user($me) + ['tpl_free' => $me['tpl_free'] ?? '', 'tpl_appt' => $me['tpl_appt'] ?? ''];
    $res['settings'] = client_settings();
    $res['users'] = get_users();
    $res['services'] = db()->query('SELECT id, name, minutes FROM services ORDER BY sort, id')->fetchAll();
    $res['statuses'] = db()->query('SELECT id, name, color, blocks FROM statuses ORDER BY sort, id')->fetchAll();
    $res['customers'] = get_customers();
    $res['suggestions'] = get_suggestions();
    return $res;
}

function get_users(): array
{
    $rows = db()->query('SELECT * FROM users WHERE deleted=0 ORDER BY sort, id')->fetchAll();
    return array_map('public_user', $rows);
}

function get_suggestions(): object
{
    $out = [];
    $rows = db()->query('SELECT kind, value FROM suggestions ORDER BY cnt DESC, last_used DESC')->fetchAll();
    foreach ($rows as $r) {
        if (count($out[$r['kind']] ?? []) < 300) $out[$r['kind']][] = $r['value'];
    }
    return (object)$out;
}

/* =========================================================
 *  설치 / 로그인
 * ========================================================= */

function do_setup(array $in): array
{
    $db = db();
    // 설치 코드(SETUP_CODE 환경변수)가 정해져 있으면 그 코드를 아는 사람만 첫 관리자가 될 수 있음
    $code = setup_code();
    if ($code !== '') {
        throttle_check('setup');
        if (!hash_equals($code, (string)($in['setup_code'] ?? ''))) {
            throttle_fail('setup');
            fail('설치 코드가 올바르지 않습니다.', 403);
        }
    }
    [$username, $name, $pw] = [v_str($in['username'] ?? '', 40), v_str($in['name'] ?? '', 40), (string)($in['password'] ?? '')];
    validate_account($username, $name, $pw, true);
    // 동시에 두 명이 설치하는 경우를 막기 위해 즉시 쓰기 잠금
    $db->exec('BEGIN IMMEDIATE');
    if ((int)$db->query('SELECT COUNT(*) FROM users WHERE deleted=0')->fetchColumn() > 0) {
        $db->exec('ROLLBACK');
        fail('이미 관리자 계정이 있습니다. 로그인해 주세요.');
    }
    $db->prepare('INSERT INTO users(username, name, pw, is_admin, is_staff, color, sort, created_at) VALUES(?,?,?,1,1,?,0,?)')
        ->execute([$username, $name, password_hash($pw, PASSWORD_DEFAULT), USER_COLORS[0], now()]);
    $id = (int)$db->lastInsertId();
    if (!empty($in['shop_name'])) set_setting('shop_name', v_str($in['shop_name'], 60));
    $db->exec('COMMIT');
    issue_token($id);
    logit('계정', $name, '최초 관리자 계정 생성 (' . $username . ')');
    return ['ok' => 1];
}

function validate_account(string $username, string $name, string $pw, bool $pwRequired): void
{
    if ($name === '') fail('이름을 입력해 주세요.');
    if (!preg_match('/^[A-Za-z0-9_.@\-가-힣]{2,40}$/u', $username)) fail('아이디는 2자 이상, 한글/영문/숫자/_.-@ 만 쓸 수 있습니다.');
    if ($pwRequired || $pw !== '') {
        if (mb_strlen($pw) < PW_MIN) fail('비밀번호는 ' . PW_MIN . '자 이상이어야 합니다.');
    }
}

function do_login(array $in): array
{
    $username = v_str($in['username'] ?? '', 40);
    $key = 'login:' . mb_strtolower($username);
    throttle_check($key);
    $st = db()->prepare('SELECT * FROM users WHERE username=? AND deleted=0');
    $st->execute([$username]);
    $u = $st->fetch();
    // 없는 아이디여도 같은 시간이 걸리도록 가짜 해시로 검사 (아이디 존재 여부 추측 방지)
    $hash = $u['pw'] ?? '$2y$10$abcdefghijklmnopqrstuuJ6p5o1n8sQyJ3m7y0b1x9cV2n4t6K8i';
    $ok = password_verify((string)($in['password'] ?? ''), $hash);
    if (!$u || !$ok) {
        throttle_fail($key);
        usleep(300000);
        fail('아이디 또는 비밀번호가 올바르지 않습니다.', 401);
    }
    throttle_clear($key);
    issue_token((int)$u['id']);
    return ['ok' => 1];
}

function do_logout(): array
{
    $t = $_COOKIE[TOKEN_COOKIE] ?? '';
    if (is_string($t) && $t !== '') db()->prepare('DELETE FROM tokens WHERE hash=?')->execute([hash('sha256', $t)]);
    clear_token_cookie();
    return ['ok' => 1];
}

/** 이 기기만 남기고 다른 모든 기기 로그아웃 (휴대폰 분실 시) */
function logout_others(): array
{
    $me = need_user();
    $h = hash('sha256', (string)($_COOKIE[TOKEN_COOKIE] ?? ''));
    $st = db()->prepare('DELETE FROM tokens WHERE user_id=? AND hash<>?');
    $st->execute([$me['id'], $h]);
    logit('로그아웃', $me['name'], '다른 기기 ' . $st->rowCount() . '대 로그아웃');
    return ['ok' => 1, 'count' => $st->rowCount()];
}

/* =========================================================
 *  스케줄
 * ========================================================= */

function get_schedules(string $from, string $to): array
{
    $st = db()->prepare("
      SELECT s.*, c.phone AS customer_phone,
        (SELECT MAX(p.date) FROM schedules p LEFT JOIN statuses ps ON ps.id = p.status_id
          WHERE p.customer_id = s.customer_id AND s.customer_id IS NOT NULL AND p.kind = 'appt' AND p.id <> s.id
            AND IFNULL(ps.blocks, 1) = 1 AND p.date < s.date) AS prev_date
      FROM schedules s LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.date BETWEEN ? AND ?
      ORDER BY s.date, s.start, s.id");
    $st->execute([$from, $to]);
    return array_map('norm_schedule', $st->fetchAll());
}

function norm_schedule(array $r): array
{
    foreach (['id', 'staff_id', 'customer_id', 'minutes', 'status_id', 'created_by', 'updated_by'] as $k) {
        $r[$k] = $r[$k] === null ? null : (int)$r[$k];
    }
    if (($r['phone'] ?? '') === '' && !empty($r['customer_phone'])) $r['phone'] = $r['customer_phone'];
    unset($r['customer_phone']);
    return $r;
}

function find_schedule(int $id): array
{
    $st = db()->prepare('SELECT * FROM schedules WHERE id=?');
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) fail('일정을 찾을 수 없습니다. 다른 사람이 삭제했을 수 있습니다.', 404);
    return norm_schedule($r);
}

function can_edit(array $row, array $me): bool
{
    if ((int)$me['is_admin'] || (int)setting('allow_edit_others')) return true;
    return (int)$row['created_by'] === (int)$me['id'] || (int)$row['staff_id'] === (int)$me['id'];
}

function name_of_user(?int $id): string
{
    static $c = [];
    if (!$id) return '-';
    if (!isset($c[$id])) {
        $st = db()->prepare('SELECT name FROM users WHERE id=?');
        $st->execute([$id]);
        $c[$id] = (string)($st->fetchColumn() ?: '(삭제된 계정)');
    }
    return $c[$id];
}

function name_of_status(?int $id): string
{
    static $c = [];
    if (!$id) return '-';
    if (!isset($c[$id])) {
        $st = db()->prepare('SELECT name FROM statuses WHERE id=?');
        $st->execute([$id]);
        $c[$id] = (string)($st->fetchColumn() ?: '-');
    }
    return $c[$id];
}

function status_blocks(?int $id): bool
{
    if (!$id) return true;
    $st = db()->prepare('SELECT blocks FROM statuses WHERE id=?');
    $st->execute([$id]);
    $b = $st->fetchColumn();
    return $b === false ? true : (bool)(int)$b;
}

function end_time(string $start, int $minutes): string
{
    [$h, $m] = array_map('intval', explode(':', $start));
    $t = $h * 60 + $m + $minutes;
    return sprintf('%02d:%02d', intdiv($t, 60) % 24, $t % 60) . ($t >= 1440 ? '(+1)' : '');
}

function describe_schedule(array $r): string
{
    $when = substr($r['date'], 5) . ' ' . $r['start'] . '~' . end_time($r['start'], (int)$r['minutes']);
    if ($r['kind'] === 'away') {
        return '[부재] ' . name_of_user($r['staff_id']) . ' ' . $when . ($r['memo'] !== '' ? ' / ' . $r['memo'] : '');
    }
    $parts = ['[예약] ' . $r['customer_name'], $when];
    if ($r['services'] !== '') $parts[] = $r['services'];
    $parts[] = '담당 ' . name_of_user($r['staff_id']);
    $parts[] = '상태 ' . name_of_status($r['status_id']);
    if (($r['phone'] ?? '') !== '') $parts[] = $r['phone'];
    if (($r['memo'] ?? '') !== '') $parts[] = '메모: ' . $r['memo'];
    return implode(' / ', $parts);
}

function diff_schedule(array $old, array $new): string
{
    $labels = [
        'customer_name' => '고객', 'phone' => '연락처', 'staff_id' => '담당', 'date' => '날짜', 'start' => '시작',
        'minutes' => '소요(분)', 'services' => '시술', 'status_id' => '상태', 'memo' => '메모',
    ];
    $out = [];
    foreach ($labels as $k => $label) {
        $a = $old[$k] ?? '';
        $b = $new[$k] ?? '';
        if ((string)$a === (string)$b) continue;
        if ($k === 'staff_id') { $a = name_of_user($a ? (int)$a : null); $b = name_of_user($b ? (int)$b : null); }
        if ($k === 'status_id') { $a = name_of_status($a ? (int)$a : null); $b = name_of_status($b ? (int)$b : null); }
        $out[] = "$label: " . ($a === '' ? '(없음)' : $a) . ' → ' . ($b === '' ? '(없음)' : $b);
    }
    return implode("\n", $out);
}

function to_min(string $t): int
{
    [$h, $m] = array_map('intval', explode(':', $t));
    return $h * 60 + $m;
}

function upsert_customer(string $name, string $phone): int
{
    $db = db();
    $st = $db->prepare('SELECT id, phone FROM customers WHERE name=?');
    $st->execute([$name]);
    $c = $st->fetch();
    if ($c) {
        if ($phone !== '' && $phone !== $c['phone']) {
            $db->prepare('UPDATE customers SET phone=? WHERE id=?')->execute([$phone, $c['id']]);
        }
        return (int)$c['id'];
    }
    $db->prepare('INSERT INTO customers(name, phone, created_at) VALUES(?,?,?)')->execute([$name, $phone, now()]);
    return (int)$db->lastInsertId();
}

function schedule_save(array $in): array
{
    $me = need_user();
    $db = db();
    $id = (int)($in['id'] ?? 0);
    $kind = ($in['kind'] ?? 'appt') === 'away' ? 'away' : 'appt';
    $old = $id ? find_schedule($id) : null;
    if ($old && !can_edit($old, $me)) fail('다른 사람이 등록한 일정은 수정할 수 없습니다. (관리자 설정)', 403);
    if ($old) $kind = $old['kind'];

    $staffId = (int)($in['staff_id'] ?? 0) ?: (int)$me['id'];
    $st = $db->prepare('SELECT id FROM users WHERE id=? AND deleted=0');
    $st->execute([$staffId]);
    if (!$st->fetchColumn()) fail('담당자를 선택해 주세요.');

    // 새로 만들 때뿐 아니라 수정하면서 담당자를 바꿀 때도 확인 (자기 부재를 남에게 옮기는 것 방지)
    if ($kind === 'away' && $staffId !== (int)$me['id'] && (!$old || $staffId !== (int)$old['staff_id'])
        && !(int)$me['is_admin'] && !(int)setting('allow_edit_others')) {
        fail('다른 사람의 부재 시간은 등록할 수 없습니다.', 403);
    }

    $row = [
        'kind' => $kind,
        'staff_id' => $staffId,
        'customer_name' => $kind === 'appt' ? v_str($in['customer_name'] ?? '', 40) : '',
        'phone' => $kind === 'appt' ? v_str($in['phone'] ?? '', 30) : '',
        'services' => $kind === 'appt' ? v_str($in['services'] ?? '', 200) : '',
        'date' => v_date($in['date'] ?? ''),
        'start' => v_time($in['start'] ?? ''),
        'minutes' => (int)($in['minutes'] ?? 0),
        'status_id' => $kind === 'appt' ? ((int)($in['status_id'] ?? 0) ?: null) : null,
        'memo' => v_str($in['memo'] ?? '', 1000),
    ];
    if ($row['minutes'] < 5 || $row['minutes'] > 1440) fail('소요 시간은 5분 ~ 1440분 사이로 입력해 주세요.');
    if ($kind === 'appt' && $row['customer_name'] === '') fail('고객 이름을 입력해 주세요.');

    // 같은 담당자의 겹치는 일정 확인
    $blocking = $kind === 'away' || status_blocks($row['status_id']);
    if ($blocking && empty($in['force'])) {
        $q = $db->prepare("SELECT s.* FROM schedules s LEFT JOIN statuses t ON t.id = s.status_id
            WHERE s.staff_id = ? AND s.date = ? AND s.id <> ? AND (s.kind = 'away' OR IFNULL(t.blocks, 1) = 1)");
        $q->execute([$staffId, $row['date'], $id]);
        $s0 = to_min($row['start']);
        $e0 = $s0 + $row['minutes'];
        $conf = [];
        foreach ($q->fetchAll() as $o) {
            $s1 = to_min($o['start']);
            $e1 = $s1 + (int)$o['minutes'];
            if ($s0 < $e1 && $s1 < $e0) $conf[] = describe_schedule(norm_schedule($o));
        }
        if ($conf) return ['conflict' => $conf];
    }

    $db->beginTransaction();
    $row['customer_id'] = $kind === 'appt' ? upsert_customer($row['customer_name'], $row['phone']) : null;
    if ($old) {
        $row['updated_by'] = (int)$me['id'];
        $row['updated_at'] = now();
        $sets = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($row)));
        $db->prepare("UPDATE schedules SET $sets WHERE id = :id")->execute($row + ['id' => $id]);
        $db->commit();
        $diff = diff_schedule($old, $row);
        logit($kind === 'away' ? '부재 수정' : '일정 수정', describe_schedule($row), $diff ?: '(변경 없음)');
    } else {
        $row['created_by'] = (int)$me['id'];
        $row['created_at'] = now();
        $row['updated_by'] = (int)$me['id'];
        $row['updated_at'] = now();
        $cols = implode(', ', array_keys($row));
        $vals = implode(', ', array_map(fn($k) => ":$k", array_keys($row)));
        $db->prepare("INSERT INTO schedules($cols) VALUES($vals)")->execute($row);
        $id = (int)$db->lastInsertId();
        $db->commit();
        logit($kind === 'away' ? '부재 추가' : '일정 추가', describe_schedule($row));
    }

    if ($kind === 'appt') {
        remember('phone', $row['phone']);
        remember('memo', $row['memo']);
        foreach (preg_split('/\s*[,·+]\s*/u', $row['services']) as $sv) remember('service', $sv);
    } else {
        remember('away', $row['memo']);
    }
    $sched = get_schedules($row['date'], $row['date']);
    $saved = null;
    foreach ($sched as $s) if ($s['id'] === $id) $saved = $s;
    return ['ok' => 1, 'schedule' => $saved, 'customers' => get_customers()];
}

function schedule_status(array $in): array
{
    $me = need_user();
    $old = find_schedule((int)($in['id'] ?? 0));
    if (!can_edit($old, $me)) fail('다른 사람이 등록한 일정은 수정할 수 없습니다. (관리자 설정)', 403);
    $sid = (int)($in['status_id'] ?? 0) ?: null;
    db()->prepare('UPDATE schedules SET status_id=?, updated_by=?, updated_at=? WHERE id=?')
        ->execute([$sid, $me['id'], now(), $old['id']]);
    $new = $old;
    $new['status_id'] = $sid;
    logit('상태 변경', describe_schedule($new), diff_schedule($old, $new));
    return ['ok' => 1];
}

function schedule_delete(array $in): array
{
    $me = need_user();
    $old = find_schedule((int)($in['id'] ?? 0));
    if (!can_edit($old, $me)) fail('다른 사람이 등록한 일정은 삭제할 수 없습니다. (관리자 설정)', 403);
    db()->prepare('DELETE FROM schedules WHERE id=?')->execute([$old['id']]);
    logit($old['kind'] === 'away' ? '부재 삭제' : '일정 삭제', describe_schedule($old));
    return ['ok' => 1, 'customers' => get_customers()];
}

/* =========================================================
 *  고객
 * ========================================================= */

function get_customers(): array
{
    $st = db()->prepare("
      SELECT c.id, c.name, c.phone, c.memo,
        MAX(CASE WHEN s.date <= :today THEN s.date END) AS last_date,
        MIN(CASE WHEN s.date > :today THEN s.date END) AS next_date,
        SUM(CASE WHEN s.date <= :today THEN 1 ELSE 0 END) AS visits
      FROM customers c
      LEFT JOIN schedules s ON s.customer_id = c.id AND s.kind = 'appt'
        AND IFNULL((SELECT blocks FROM statuses WHERE id = s.status_id), 1) = 1
      GROUP BY c.id
      ORDER BY (last_date IS NULL), last_date DESC, c.name");
    $st->execute(['today' => today()]);
    return array_map(function ($r) {
        $r['id'] = (int)$r['id'];
        $r['visits'] = (int)$r['visits'];
        return $r;
    }, $st->fetchAll());
}

function get_customer(string $name): array
{
    $st = db()->prepare('SELECT * FROM customers WHERE name=?');
    $st->execute([trim($name)]);
    $c = $st->fetch();
    if (!$c) fail('고객을 찾을 수 없습니다.', 404);
    $st = db()->prepare("SELECT s.*, NULL AS customer_phone, NULL AS prev_date FROM schedules s WHERE s.customer_id=? AND s.kind='appt' ORDER BY s.date DESC, s.start DESC");
    $st->execute([$c['id']]);
    return ['customer' => $c, 'history' => array_map('norm_schedule', $st->fetchAll())];
}

function customer_save(array $in): array
{
    need_user();
    $id = (int)($in['id'] ?? 0);
    $st = db()->prepare('SELECT * FROM customers WHERE id=?');
    $st->execute([$id]);
    $old = $st->fetch();
    if (!$old) fail('고객을 찾을 수 없습니다.', 404);
    $phone = v_str($in['phone'] ?? '', 30);
    $memo = v_str($in['memo'] ?? '', 1000);
    db()->prepare('UPDATE customers SET phone=?, memo=? WHERE id=?')->execute([$phone, $memo, $id]);
    $d = [];
    if ($old['phone'] !== $phone) $d[] = "연락처: {$old['phone']} → $phone";
    if ($old['memo'] !== $memo) $d[] = "메모: {$old['memo']} → $memo";
    if ($d) logit('고객 수정', $old['name'], implode("\n", $d));
    remember('phone', $phone);
    remember('cmemo', $memo);
    return ['ok' => 1, 'customers' => get_customers()];
}

/* =========================================================
 *  관리자 설정
 * ========================================================= */

function settings_save(array $in): array
{
    need_admin();
    $old = settings();
    $changes = [];
    $labels = [
        'shop_name' => '미용실 이름', 'hours' => '영업시간', 'break_per_hour' => '시간당 휴식(분)', 'breaks' => '휴식 시간',
        'lunch_start' => '점심 시작', 'lunch_end' => '점심 종료', 'slot_step' => '시간 단위', 'allow_edit_others' => '다른 사람 일정 수정 허용',
        'tpl_free' => '빈 시간 공유 문구', 'tpl_appt' => '예약 공유 문구',
    ];
    foreach ($in as $k => $v) {
        if (!isset($labels[$k])) continue;
        switch ($k) {
            case 'shop_name':
                $v = v_str($v, 60);
                if ($v === '') fail('미용실 이름을 입력해 주세요.');
                remember('shop_name', $v);
                break;
            case 'hours':
                if (!is_array($v) || count($v) !== 7) fail('영업시간 형식 오류');
                $h = [];
                foreach (array_values($v) as $d) {
                    $o = v_time($d['open'] ?? '10:00');
                    $c = v_time($d['close'] ?? '20:00');
                    if (empty($d['closed']) && to_min($c) <= to_min($o)) fail('영업 종료 시간은 시작 시간보다 늦어야 합니다.');
                    $h[] = ['closed' => !empty($d['closed']), 'open' => $o, 'close' => $c];
                }
                $v = json_encode($h);
                break;
            case 'breaks':
                $b = [];
                foreach ((array)$v as $d) {
                    if (($d['start'] ?? '') === '' && ($d['end'] ?? '') === '') continue;
                    $s = v_time($d['start'] ?? '');
                    $e = v_time($d['end'] ?? '');
                    if (to_min($e) <= to_min($s)) fail('휴식 종료 시간은 시작 시간보다 늦어야 합니다.');
                    $b[] = ['start' => $s, 'end' => $e];
                }
                usort($b, fn($x, $y) => strcmp($x['start'], $y['start']));
                $v = json_encode($b);
                break;
            case 'lunch_start':
            case 'lunch_end':
                $v = v_time($v, true);
                break;
            case 'break_per_hour':
                $v = (string)max(0, min(30, (int)$v));
                break;
            case 'slot_step':
                $v = (string)(in_array((int)$v, [5, 10, 15, 20, 30, 60], true) ? (int)$v : 30);
                break;
            case 'allow_edit_others':
                $v = $v ? '1' : '0';
                break;
            case 'tpl_free':
            case 'tpl_appt':
                $v = v_str($v, 2000);
                if ($v === '') $v = default_settings()[$k];
                break;
        }
        $v = (string)$v;
        if (($old[$k] ?? '') !== $v) {
            set_setting($k, $v);
            $changes[] = $labels[$k] . ': ' . short($old[$k] ?? '') . ' → ' . short($v);
        }
    }
    if (isset($in['lunch_start'], $in['lunch_end'])) {
        $ls = setting('lunch_start');
        $le = setting('lunch_end');
        if (($ls === '') !== ($le === '') || ($ls !== '' && to_min($le) <= to_min($ls))) fail('점심 시간을 확인해 주세요.');
    }
    if ($changes) logit('설정 변경', '관리자 설정', implode("\n", $changes));
    return ['ok' => 1, 'settings' => client_settings()];
}

function short(string $s): string
{
    $s = str_replace("\n", ' ', $s);
    return mb_strlen($s) > 60 ? mb_substr($s, 0, 60) . '…' : $s;
}

function bump_logo(): void
{
    set_setting('logo_ver', (string)((int)setting('logo_ver') + 1));
}

function logo_upload(): array
{
    need_admin();
    $f = $_FILES['logo'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail('파일 업로드에 실패했습니다. (10MB 이하 이미지)');
    $info = @getimagesize($f['tmp_name']);
    $types = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($types[$info[2]])) fail('PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다.');
    $old = setting('logo_file');
    $name = 'logo_' . time() . '.' . $types[$info[2]];
    if (!move_uploaded_file($f['tmp_name'], DATA_DIR . '/' . $name)) fail('파일 저장에 실패했습니다.');
    if ($old !== '' && is_file(DATA_DIR . '/' . basename($old))) @unlink(DATA_DIR . '/' . basename($old));
    set_setting('logo_file', $name);
    bump_logo();
    logit('설정 변경', '로고', '새 로고 등록');
    return ['ok' => 1, 'logo_ver' => setting('logo_ver')];
}

function serve_logo(): void
{
    $file = basename(setting('logo_file'));
    $path = $file !== '' ? DATA_DIR . '/' . $file : '';
    if ($path === '' || !is_file($path)) {
        // 기본 로고 (원본: DEFAULT_LOGO_URL) – 같은 출처로 제공해야 이미지 공유(canvas)에 쓸 수 있음
        $path = __DIR__ . '/img/default_logo.png';
    }
    $info = @getimagesize($path);
    header('Content-Type: ' . ($info['mime'] ?? 'image/png'));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . filesize($path));
    readfile($path);
}

function services_save(array $in): array
{
    need_admin();
    $list = (array)($in['services'] ?? []);
    $db = db();
    $old = $db->query('SELECT id, name, minutes FROM services ORDER BY sort, id')->fetchAll();
    $oldMap = array_column($old, null, 'id');
    $db->beginTransaction();
    $keep = [];
    $log = [];
    foreach (array_values($list) as $i => $s) {
        $name = v_str($s['name'] ?? '', 40);
        $min = (int)($s['minutes'] ?? 0);
        if ($name === '') continue;
        if ($min < 5 || $min > 720) fail("'$name' 소요 시간을 5~720분으로 입력해 주세요.");
        $id = (int)($s['id'] ?? 0);
        if ($id && isset($oldMap[$id])) {
            $db->prepare('UPDATE services SET name=?, minutes=?, sort=? WHERE id=?')->execute([$name, $min, $i, $id]);
            $o = $oldMap[$id];
            if ($o['name'] !== $name || (int)$o['minutes'] !== $min) $log[] = "수정: {$o['name']}({$o['minutes']}분) → $name({$min}분)";
        } else {
            $db->prepare('INSERT INTO services(name, minutes, sort) VALUES(?,?,?)')->execute([$name, $min, $i]);
            $id = (int)$db->lastInsertId();
            $log[] = "추가: $name({$min}분)";
        }
        $keep[] = $id;
        remember('service', $name);
    }
    foreach ($old as $o) {
        if (!in_array((int)$o['id'], $keep, true)) {
            $db->prepare('DELETE FROM services WHERE id=?')->execute([$o['id']]);
            $log[] = "삭제: {$o['name']}";
        }
    }
    $db->commit();
    if ($log) logit('설정 변경', '시술 종류', implode("\n", $log));
    return ['ok' => 1, 'services' => $db->query('SELECT id, name, minutes FROM services ORDER BY sort, id')->fetchAll()];
}

function statuses_save(array $in): array
{
    need_admin();
    $list = (array)($in['statuses'] ?? []);
    $db = db();
    $old = $db->query('SELECT * FROM statuses ORDER BY sort, id')->fetchAll();
    $oldMap = array_column($old, null, 'id');
    $db->beginTransaction();
    $keep = [];
    $log = [];
    foreach (array_values($list) as $i => $s) {
        $name = v_str($s['name'] ?? '', 30);
        if ($name === '') continue;
        $color = v_color($s['color'] ?? '');
        $blocks = !empty($s['blocks']) ? 1 : 0;
        $id = (int)($s['id'] ?? 0);
        if ($id && isset($oldMap[$id])) {
            $db->prepare('UPDATE statuses SET name=?, color=?, blocks=?, sort=? WHERE id=?')->execute([$name, $color, $blocks, $i, $id]);
            $o = $oldMap[$id];
            if ($o['name'] !== $name || $o['color'] !== $color || (int)$o['blocks'] !== $blocks) $log[] = "수정: {$o['name']} → $name";
        } else {
            $db->prepare('INSERT INTO statuses(name, color, blocks, sort) VALUES(?,?,?,?)')->execute([$name, $color, $blocks, $i]);
            $id = (int)$db->lastInsertId();
            $log[] = "추가: $name";
        }
        $keep[] = $id;
        remember('status', $name);
    }
    if (!$keep) fail('상태는 최소 1개 이상 있어야 합니다.');
    foreach ($old as $o) {
        if (!in_array((int)$o['id'], $keep, true)) {
            $db->prepare('DELETE FROM statuses WHERE id=?')->execute([$o['id']]);
            $db->prepare('UPDATE schedules SET status_id=NULL WHERE status_id=?')->execute([$o['id']]);
            $log[] = "삭제: {$o['name']}";
        }
    }
    $db->commit();
    if ($log) logit('설정 변경', '일정 상태', implode("\n", $log));
    return ['ok' => 1, 'statuses' => $db->query('SELECT id, name, color, blocks FROM statuses ORDER BY sort, id')->fetchAll()];
}

function user_save(array $in): array
{
    $me = need_admin();
    $db = db();
    $id = (int)($in['id'] ?? 0);
    $username = v_str($in['username'] ?? '', 40);
    $name = v_str($in['name'] ?? '', 40);
    $pw = (string)($in['password'] ?? '');
    validate_account($username, $name, $pw, !$id);
    $isAdmin = !empty($in['is_admin']) ? 1 : 0;
    $isStaff = !empty($in['is_staff']) ? 1 : 0;
    $ls = v_time($in['lunch_start'] ?? '', true);
    $le = v_time($in['lunch_end'] ?? '', true);
    if (($ls === '') !== ($le === '') || ($ls !== '' && to_min($le) <= to_min($ls))) fail('개별 점심 시간을 확인해 주세요. (비워두면 기본 점심 시간 사용)');

    $st = $db->prepare('SELECT id FROM users WHERE username=? AND id<>?');
    $st->execute([$username, $id]);
    if ($st->fetchColumn()) fail('이미 사용 중인 아이디입니다.');

    if ($id) {
        $st = $db->prepare('SELECT * FROM users WHERE id=? AND deleted=0');
        $st->execute([$id]);
        $old = $st->fetch();
        if (!$old) fail('계정을 찾을 수 없습니다.', 404);
        if ((int)$old['is_admin'] && !$isAdmin) {
            $cnt = (int)$db->query('SELECT COUNT(*) FROM users WHERE is_admin=1 AND deleted=0')->fetchColumn();
            if ($cnt <= 1) fail('관리자는 최소 1명 있어야 합니다.');
        }
        $color = v_color($in['color'] ?? '', $old['color'] ?: USER_COLORS[0]);
        $db->prepare('UPDATE users SET username=?, name=?, is_admin=?, is_staff=?, color=?, lunch_start=?, lunch_end=? WHERE id=?')
            ->execute([$username, $name, $isAdmin, $isStaff, $color, $ls, $le, $id]);
        $d = [];
        foreach (['username' => '아이디', 'name' => '이름', 'is_admin' => '관리자', 'is_staff' => '시술 담당', 'lunch_start' => '점심 시작', 'lunch_end' => '점심 종료'] as $k => $l) {
            $nv = ['username' => $username, 'name' => $name, 'is_admin' => $isAdmin, 'is_staff' => $isStaff, 'lunch_start' => $ls, 'lunch_end' => $le][$k];
            if ((string)$old[$k] !== (string)$nv) $d[] = "$l: {$old[$k]} → $nv";
        }
        if ($pw !== '') {
            $db->prepare('UPDATE users SET pw=? WHERE id=?')->execute([password_hash($pw, PASSWORD_DEFAULT), $id]);
            // 비밀번호가 바뀌면 모든 기기에서 다시 로그인
            $db->prepare('DELETE FROM tokens WHERE user_id=?')->execute([$id]);
            $d[] = '비밀번호 변경 (모든 기기 로그아웃)';
            if ($id === (int)$me['id']) issue_token($id);
        }
        logit('계정 수정', "$name ($username)", implode("\n", $d));
    } else {
        $cnt = (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $color = v_color($in['color'] ?? '', USER_COLORS[$cnt % count(USER_COLORS)]);
        $sort = (int)$db->query('SELECT IFNULL(MAX(sort),0)+1 FROM users')->fetchColumn();
        $db->prepare('INSERT INTO users(username, name, pw, is_admin, is_staff, color, lunch_start, lunch_end, sort, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
            ->execute([$username, $name, password_hash($pw, PASSWORD_DEFAULT), $isAdmin, $isStaff, $color, $ls, $le, $sort, now()]);
        logit('계정 추가', "$name ($username)", ($isAdmin ? '관리자' : '일반') . ($isStaff ? ', 시술 담당' : ''));
    }
    remember('username', $username);
    remember('name', $name);
    return ['ok' => 1, 'users' => get_users()];
}

function user_delete(array $in): array
{
    $me = need_admin();
    $db = db();
    $id = (int)($in['id'] ?? 0);
    if ($id === (int)$me['id']) fail('자기 자신은 삭제할 수 없습니다.');
    $st = $db->prepare('SELECT * FROM users WHERE id=? AND deleted=0');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) fail('계정을 찾을 수 없습니다.', 404);
    if ((int)$u['is_admin'] && (int)$db->query('SELECT COUNT(*) FROM users WHERE is_admin=1 AND deleted=0')->fetchColumn() <= 1) {
        fail('관리자는 최소 1명 있어야 합니다.');
    }
    // 지난 일정 기록 보존을 위해 실제로 지우지 않고 숨김 처리, 아이디는 재사용 가능하게 변경
    $db->prepare('UPDATE users SET deleted=1, username=? WHERE id=?')->execute([$u['username'] . '#deleted#' . $id, $id]);
    $db->prepare('DELETE FROM tokens WHERE user_id=?')->execute([$id]);
    logit('계정 삭제', "{$u['name']} ({$u['username']})");
    return ['ok' => 1, 'users' => get_users()];
}

function me_save(array $in): array
{
    $me = need_user();
    $name = v_str($in['name'] ?? $me['name'], 40);
    if ($name === '') fail('이름을 입력해 주세요.');
    $tf = v_str($in['tpl_free'] ?? '', 2000);
    $ta = v_str($in['tpl_appt'] ?? '', 2000);
    db()->prepare('UPDATE users SET name=?, tpl_free=?, tpl_appt=? WHERE id=?')->execute([$name, $tf, $ta, $me['id']]);
    $d = [];
    if ($me['name'] !== $name) $d[] = "이름: {$me['name']} → $name";
    if (($me['tpl_free'] ?? '') !== $tf) $d[] = '내 빈 시간 공유 문구 변경';
    if (($me['tpl_appt'] ?? '') !== $ta) $d[] = '내 예약 공유 문구 변경';
    if ($d) logit('내 정보 수정', $name, implode("\n", $d));
    remember('name', $name);
    return ['ok' => 1];
}

function change_password(array $in): array
{
    $me = need_user();
    $key = 'pw:' . $me['id'];
    throttle_check($key);
    if (!password_verify((string)($in['current'] ?? ''), $me['pw'])) {
        throttle_fail($key);
        fail('현재 비밀번호가 올바르지 않습니다.');
    }
    throttle_clear($key);
    $new = (string)($in['new'] ?? '');
    if (mb_strlen($new) < PW_MIN) fail('새 비밀번호는 ' . PW_MIN . '자 이상이어야 합니다.');
    db()->prepare('UPDATE users SET pw=? WHERE id=?')->execute([password_hash($new, PASSWORD_DEFAULT), $me['id']]);
    db()->prepare('DELETE FROM tokens WHERE user_id=?')->execute([$me['id']]);
    issue_token((int)$me['id']);
    logit('비밀번호 변경', $me['name'], '다른 모든 기기에서 로그아웃됨');
    return ['ok' => 1];
}

function get_logs(): array
{
    $page = max(1, (int)($_GET['page'] ?? 1));
    $q = trim((string)($_GET['q'] ?? ''));
    $per = 50;
    $where = '';
    $args = [];
    if ($q !== '') {
        $where = 'WHERE user_name LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ?';
        $args = array_fill(0, 4, '%' . $q . '%');
    }
    $st = db()->prepare("SELECT COUNT(*) FROM logs $where");
    $st->execute($args);
    $total = (int)$st->fetchColumn();
    $st = db()->prepare("SELECT * FROM logs $where ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per));
    $st->execute($args);
    return ['logs' => $st->fetchAll(), 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / $per))];
}

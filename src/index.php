<?php
require __DIR__ . '/lib.php';
security_headers();
$shop = htmlspecialchars(setting('shop_name'), ENT_QUOTES);
$logoVer = urlencode(setting('logo_ver'));
$v = filemtime(__DIR__ . '/app.js') . '-' . filemtime(__DIR__ . '/app.css');
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="<?= $shop ?>">
<title><?= $shop ?> 예약</title>
<script>
/* 카카오톡 등 앱 안의 브라우저로 열리면 외부 브라우저(Safari/Chrome)로 다시 연다.
 * (앱 안 브라우저는 공유창·홈 화면 추가·로그인 유지가 제대로 되지 않음) */
window.openExternal = function () {
  var ua = navigator.userAgent, url = location.href.replace(/[?&]openExternalBrowser=1/, '');
  var ios = /iPhone|iPad|iPod/i.test(ua);
  if (/KAKAOTALK/i.test(ua)) {
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    // 외부 브라우저가 열린 뒤 카카오 안 브라우저는 닫기
    setTimeout(function () { location.href = ios ? 'kakaoweb://closeBrowser' : 'kakaotalk://inappbrowser/close'; }, 1500);
    return true;
  }
  if (/ Line\//i.test(ua)) {
    location.href = url + (url.indexOf('?') < 0 ? '?' : '&') + 'openExternalBrowser=1';
    return true;
  }
  if (!ios && /Android/i.test(ua) && /NAVER\(inapp|Instagram|FBAN|FBAV|DaumApps|everytimeApp|; wv\)/i.test(ua)) {
    location.href = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
    return true;
  }
  return false;
};
(function () {
  var ua = navigator.userAgent;
  var inApp = /KAKAOTALK| Line\/|NAVER\(inapp|Instagram|FBAN|FBAV|DaumApps|everytimeApp/i.test(ua);
  // 같은 세션에서 한 번만 자동 시도 (실패해도 무한 반복되지 않게)
  try { if (sessionStorage.getItem('crcr_ext_tried')) return; sessionStorage.setItem('crcr_ext_tried', '1'); } catch (e) {}
  if (inApp) window.openExternal();
})();
</script>
<link rel="manifest" href="manifest.php">
<link rel="icon" href="api.php?a=logo&amp;v=<?= $logoVer ?>">
<link rel="apple-touch-icon" href="api.php?a=logo&amp;v=<?= $logoVer ?>">
<link rel="stylesheet" href="app.css?v=<?= $v ?>">
</head>
<body>
<div id="app"><div class="boot">불러오는 중…</div></div>
<div id="sheets"></div>
<div id="toast"></div>
<script src="app.js?v=<?= $v ?>"></script>
</body>
</html>

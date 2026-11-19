<?php
require __DIR__ . '/lib.php';
security_headers();
header('Content-Type: application/manifest+json; charset=utf-8');
$name = setting('shop_name');
$icon = 'api.php?a=logo&v=' . urlencode(setting('logo_ver'));
echo json_encode([
    'name' => $name . ' 예약',
    'short_name' => $name,
    'start_url' => './',
    'scope' => './',
    'display' => 'standalone',
    'background_color' => '#ffffff',
    'theme_color' => '#ffffff',
    'icons' => [
        ['src' => $icon, 'sizes' => '192x192', 'purpose' => 'any'],
        ['src' => $icon, 'sizes' => '512x512', 'purpose' => 'any'],
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

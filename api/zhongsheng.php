<?php
declare(strict_types=1);

$backend = 'https://127.0.0.1/zhongsheng-api/index.php';
$action = isset($_GET['action']) ? (string) $_GET['action'] : 'health';
$params = $_GET;
$params['action'] = $action;
$target = $backend . '?' . http_build_query($params);
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$secret = (string) getenv('ZHONGSHENG_PROXY_SECRET');

$headers = [
    'Accept: ' . ($action === 'media' ? 'image/*' : 'application/json'),
    'Host: api.huaian.cloud',
    'X-Forwarded-For: ' . (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
    'X-Zhongsheng-Proxy: ' . $secret,
];
if (isset($_COOKIE['zs_session']) && $action !== 'media') {
    $headers[] = 'X-ZS-Session: ' . (string) $_COOKIE['zs_session'];
}
if (isset($_SERVER['HTTP_IDEMPOTENCY_KEY'])) {
    $headers[] = 'Idempotency-Key: ' . (string) $_SERVER['HTTP_IDEMPOTENCY_KEY'];
}

$curl = curl_init($target);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_TIMEOUT => $action === 'media' ? 30 : 20,
    // Fixed loopback origin: TLS never leaves this server. The Host header above
    // selects the existing api.huaian.cloud virtual host.
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
]);
if ($method !== 'GET' && $method !== 'HEAD') {
    $headers[] = 'Content-Type: application/json';
    curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($curl, CURLOPT_POSTFIELDS, file_get_contents('php://input') ?: '{}');
}

$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
$error = curl_error($curl);
curl_close($curl);

if ($body === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => '众声服务器暂时无法连接', 'detail' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'media' && $status >= 200 && $status < 300 && strpos($contentType, 'image/') === 0) {
    http_response_code(200);
    header('Content-Type: ' . $contentType);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    echo $body;
    exit;
}

$payload = json_decode($body, true);
if (!is_array($payload)) {
    $payload = ['ok' => false, 'error' => '众声后端返回了无法识别的内容'];
}
if ($action === 'login' && $status >= 200 && $status < 300 && isset($payload['data']['token'])) {
    setcookie('zs_session', (string) $payload['data']['token'], [
        'expires' => time() + 2592000,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    unset($payload['data']['token']);
}
if ($action === 'logout' || ($action === 'change-password' && $status >= 200 && $status < 300)) {
    setcookie('zs_session', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

http_response_code($status > 0 ? $status : 502);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

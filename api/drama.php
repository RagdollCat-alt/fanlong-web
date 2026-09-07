<?php
declare(strict_types=1);
require __DIR__ . '/_proxy.php';

$id = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
$sig = isset($_GET['sig']) ? trim((string) $_GET['sig']) : '';
if ($id === '' || $sig === '') {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Missing drama id or signature'], JSON_UNESCAPED_UNICODE);
    exit;
}
proxy_json_get(build_query_url('http://127.0.0.1:8443/drama', ['id' => $id, 'sig' => $sig]));

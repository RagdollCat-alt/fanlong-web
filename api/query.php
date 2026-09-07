<?php
declare(strict_types=1);
require __DIR__ . '/_proxy.php';

$qq = isset($_GET['qq']) ? trim((string) $_GET['qq']) : '';
if ($qq === '') {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Missing qq'], JSON_UNESCAPED_UNICODE);
    exit;
}
proxy_json_get(build_query_url('http://127.0.0.1:8443/query', ['qq' => $qq]));

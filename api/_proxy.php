<?php
declare(strict_types=1);

function proxy_json_get(string $url): void
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $type = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false) {
        http_response_code(502);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Backend connection failed', 'detail' => $error], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code($status > 0 ? $status : 502);
    header('Content-Type: ' . ($type !== '' ? $type : 'application/json; charset=utf-8'));
    header('Cache-Control: private, no-store');
    echo $body;
}

function build_query_url(string $base, array $params): string
{
    return $base . ($params ? '?' . http_build_query($params) : '');
}

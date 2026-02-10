<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json; charset=UTF-8");

require_once 'utils.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    sendJson(['error' => ['message' => 'Method Not Allowed']]);
    exit;
}

$apiKey = getApiKey();
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['text'])) {
    http_response_code(400);
    sendJson(['error' => ['message' => 'Missing "text" parameter']]);
    exit;
}

$text = $input['text'];
$target = isset($input['target']) ? $input['target'] : 'zh-TW';

$url = "https://translation.googleapis.com/language/translate/v2?key=" . $apiKey;
$payload = [
    'q' => $text,
    'target' => $target,
    'format' => 'text'
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    sendJson(['error' => ['message' => 'Curl Error: ' . curl_error($ch)]]);
} else {
    http_response_code($httpCode);
    echo $response;
}

curl_close($ch);
?>
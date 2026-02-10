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

if (!isset($input['audio'])) {
    http_response_code(400);
    sendJson(['error' => ['message' => 'Missing "audio" parameter']]);
    exit;
}

$base64Audio = $input['audio'];

// Attempt V2 API (Chirp 2) first
// Project ID hardcoded based on user context or env
$projectId = getenv('GG_PROJECT_ID') ?: 'my-cli-re';

$v2Url = "https://speech.googleapis.com/v2/projects/{$projectId}/locations/global/recognizers/_:recognize?key=" . $apiKey;

$v2Payload = [
    'config' => [
        'autoDecodingConfig' => new stdClass(), // Empty object
        'languageCodes' => ['cmn-Hant-TW'], // Strict Traditional Chinese
        'model' => 'chirp_2', // Requesting Chirp 2
        'features' => [
            'enableAutomaticPunctuation' => true
        ]
    ],
    'content' => $base64Audio
];

$ch = curl_init($v2Url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($v2Payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);

// Check if V2 succeeded
if ($httpCode == 200 && !isset($data['error'])) {
    echo $response;
    exit;
}

// If V2 failed (e.g., 403, 404, or API error), Fallback to V1
// Log warning if needed, but proceed to V1 transparently or with a note?
// Let's just return V1 response if V2 fails
// Note: V2 and V1 response formats are slightly different. 
// V2: results[].alternatives[].transcript
// V1: results[].alternatives[].transcript
// Structure is compatible enough for simple transcript extraction.

$v1Url = "https://speech.googleapis.com/v1/speech:recognize?key=" . $apiKey;

$v1Payload = [
    'config' => [
        'encoding' => 'WEBM_OPUS',
        'sampleRateHertz' => 48000,
        'languageCode' => 'cmn-Hant-TW',
        // 'alternativeLanguageCodes' => [], // Removed to enforce Chinese
        'enableAutomaticPunctuation' => true
    ],
    'audio' => [
        'content' => $base64Audio
    ]
];

$ch = curl_init($v1Url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($v1Payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    sendJson(['error' => ['message' => 'Curl Error: ' . curl_error($ch)]]);
} else {
    http_response_code($httpCode);
    // If V1 also fails, the user will see the error
    // We could append a debug note that V2 failed logic
    echo $response;
}

curl_close($ch);
?>
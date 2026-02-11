<?php
// Simple .env parser and common functions
function loadEnv()
{
    $envFile = __DIR__ . '/../.env';
    if (!file_exists($envFile)) {
        return;
    }

    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0)
            continue;

        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);

        if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
            putenv(sprintf('%s=%s', $name, $value));
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }
}

function getApiKey()
{
    loadEnv();
    $key = getenv('GG_API');
    if (!$key) {
        http_response_code(500);
        echo json_encode(['error' => ['message' => 'API Key not configured on server']]);
        exit;
    }
    return $key;
}

function sendJson($data)
{
    header('Content-Type: application/json');
    echo json_encode($data);
}
?>
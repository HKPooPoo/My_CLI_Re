<?php
header('Content-Type: application/json');
try {
    require '../db.php';

    echo json_encode([
        "status" => "ONLINE",
    ]);
} catch (Exception $e) {
    echo json_encode([
        "status" => "OFFLINE",
        "error" => $e->getMessage()
    ]);
}
?>
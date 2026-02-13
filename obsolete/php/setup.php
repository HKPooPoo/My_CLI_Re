<?php
require 'db.php';

try {
    $sql = "
    CREATE TABLE IF NOT EXISTS users (
        uid VARCHAR(32) PRIMARY KEY,
        email VARCHAR(255),
        passcode_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ";

    $pdo->exec($sql);
    echo "Table 'users' created<br>";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
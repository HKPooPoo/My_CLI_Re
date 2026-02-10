<?php
$host = 'db';
$dbname = getenv('POSTGRES_DB');
$user = getenv('POSTGRES_USER');
$pass = getenv('POSTGRES_PASSWORD');

$dsn = "pgsql:host=$host;port=5432;dbname=$dbname";

$pdo = new PDO($dsn, $user, $pass);
?>
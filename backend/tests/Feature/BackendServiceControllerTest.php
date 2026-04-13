<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class BackendServiceControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    // =========================================================================
    //  GET /api/status
    // =========================================================================

    #[Test]
    public function status_returns_online_when_db_connected(): void
    {
        $response = $this->getJson('/api/status');

        $response->assertStatus(200)
            ->assertJson(['status' => 'ONLINE']);
    }

    #[Test]
    public function status_caches_result(): void
    {
        // First call warms cache
        $this->getJson('/api/status')->assertStatus(200);

        // Verify cache was set
        $this->assertEquals('ONLINE', Cache::get('status:online'));
    }

    #[Test]
    public function status_accessible_without_auth(): void
    {
        $response = $this->getJson('/api/status');
        $response->assertStatus(200);
    }

    // =========================================================================
    //  POST /api/translate — validation
    // =========================================================================

    #[Test]
    public function translate_rejects_missing_text(): void
    {
        $response = $this->postJson('/api/translate', [
            'target' => 'zh-TW',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['text']);
    }

    #[Test]
    public function translate_rejects_missing_target(): void
    {
        $response = $this->postJson('/api/translate', [
            'text' => 'Hello',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['target']);
    }

    #[Test]
    public function translate_rejects_invalid_target_language(): void
    {
        $response = $this->postJson('/api/translate', [
            'text' => 'Hello',
            'target' => 'fr',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['target']);
    }

    #[Test]
    public function translate_accepts_valid_targets(): void
    {
        Http::fake(['*' => Http::response(['data' => ['translations' => [['translatedText' => '你好']]]], 200)]);

        foreach (['zh-TW', 'zh-CN', 'en', 'ja'] as $target) {
            $response = $this->postJson('/api/translate', [
                'text' => 'Hello',
                'target' => $target,
            ]);
            // Should not be 422 (may be 500 if no API key, but not validation error)
            $this->assertNotEquals(422, $response->status(), "Target '{$target}' should be accepted");
        }
    }

    #[Test]
    public function translate_returns_translation_when_api_succeeds(): void
    {
        Http::fake([
            'translation.googleapis.com/*' => Http::response([
                'data' => ['translations' => [['translatedText' => '你好世界']]]
            ], 200),
        ]);

        config(['services.google.api_key' => 'fake-key']);

        $response = $this->postJson('/api/translate', [
            'text' => 'Hello World',
            'target' => 'zh-TW',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.translations.0.translatedText', '你好世界');
    }

    #[Test]
    public function translate_returns_500_when_api_key_missing(): void
    {
        config(['services.google.api_key' => null]);

        $response = $this->postJson('/api/translate', [
            'text' => 'Hello',
            'target' => 'zh-TW',
        ]);

        $response->assertStatus(500)
            ->assertJsonStructure(['message']);
    }

    // =========================================================================
    //  POST /api/speech — validation
    // =========================================================================

    #[Test]
    public function speech_rejects_missing_audio(): void
    {
        $response = $this->postJson('/api/speech', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['audio']);
    }

    #[Test]
    public function speech_rejects_oversized_audio(): void
    {
        config(['services.google.api_key' => 'fake-key']);

        // Over 10MB base64
        $response = $this->postJson('/api/speech', [
            'audio' => str_repeat('A', 10 * 1024 * 1024 + 1),
        ]);

        $response->assertStatus(413)
            ->assertJsonStructure(['message']);
    }

    #[Test]
    public function speech_returns_500_when_api_key_missing(): void
    {
        config(['services.google.api_key' => null]);

        $response = $this->postJson('/api/speech', [
            'audio' => base64_encode('fake audio data'),
        ]);

        $response->assertStatus(500)
            ->assertJsonStructure(['message']);
    }

    // =========================================================================
    //  POST /api/mods/llm/chat — validation
    // =========================================================================

    #[Test]
    public function llm_chat_rejects_missing_fields(): void
    {
        $response = $this->postJson('/api/mods/llm/chat', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['provider', 'model', 'messages']);
    }

    #[Test]
    public function llm_chat_rejects_invalid_provider(): void
    {
        $response = $this->postJson('/api/mods/llm/chat', [
            'provider' => 'invalid',
            'model' => 'test',
            'messages' => [['role' => 'user', 'content' => 'Hi']],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['provider']);
    }

    #[Test]
    public function llm_chat_rejects_invalid_role(): void
    {
        $response = $this->postJson('/api/mods/llm/chat', [
            'provider' => 'ollama',
            'model' => 'test',
            'messages' => [['role' => 'hacker', 'content' => 'Hi']],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['messages.0.role']);
    }

    #[Test]
    public function llm_chat_rejects_empty_messages(): void
    {
        $response = $this->postJson('/api/mods/llm/chat', [
            'provider' => 'ollama',
            'model' => 'test',
            'messages' => [],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['messages']);
    }

    #[Test]
    public function llm_chat_rejects_too_many_messages(): void
    {
        $messages = array_fill(0, 11, ['role' => 'user', 'content' => 'Hi']);

        $response = $this->postJson('/api/mods/llm/chat', [
            'provider' => 'ollama',
            'model' => 'test',
            'messages' => $messages,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['messages']);
    }

    #[Test]
    public function llm_chat_accepts_valid_providers(): void
    {
        Http::fake(['*' => Http::response(['message' => ['content' => 'Hi']], 200)]);

        config(['services.ollama.host' => 'localhost', 'services.ollama.port' => '11434']);

        $response = $this->postJson('/api/mods/llm/chat', [
            'provider' => 'ollama',
            'model' => 'qwen3.5:4b',
            'messages' => [['role' => 'user', 'content' => 'Hello']],
        ]);

        // Should not be 422; may be 200 or 502 depending on mock
        $this->assertNotEquals(422, $response->status());
    }

    // =========================================================================
    //  GET /api/mods/llm/ollama/health
    // =========================================================================

    #[Test]
    public function ollama_health_returns_online_when_reachable(): void
    {
        Http::fake([
            '*' => Http::response([
                'models' => [
                    ['name' => 'qwen3.5:4b'],
                    ['name' => 'llama3:8b'],
                ],
            ], 200),
        ]);

        config(['services.ollama.host' => 'localhost', 'services.ollama.port' => '11434']);

        $response = $this->getJson('/api/mods/llm/ollama/health');

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'online',
                'models' => ['qwen3.5:4b', 'llama3:8b'],
            ]);
    }

    #[Test]
    public function ollama_health_returns_offline_when_unreachable(): void
    {
        Http::fake(['*' => Http::response(null, 500)]);

        config(['services.ollama.host' => 'localhost', 'services.ollama.port' => '11434']);

        $response = $this->getJson('/api/mods/llm/ollama/health');

        $response->assertStatus(503)
            ->assertJson(['status' => 'offline', 'models' => []]);
    }

    #[Test]
    public function ollama_health_accessible_without_auth(): void
    {
        Http::fake(['*' => Http::response(['models' => []], 200)]);
        config(['services.ollama.host' => 'localhost', 'services.ollama.port' => '11434']);

        $response = $this->getJson('/api/mods/llm/ollama/health');
        $this->assertNotEquals(401, $response->status());
    }

    #[Test]
    public function ollama_health_caches_result(): void
    {
        Http::fake(['*' => Http::response(['models' => [['name' => 'test']]], 200)]);
        config(['services.ollama.host' => 'localhost', 'services.ollama.port' => '11434']);

        // First call
        $this->getJson('/api/mods/llm/ollama/health');
        // Second call should use cache (only 1 HTTP request made)
        $this->getJson('/api/mods/llm/ollama/health');

        Http::assertSentCount(1);
    }
}

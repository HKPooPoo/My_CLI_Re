<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    // =========================================================================
    //  POST /api/register
    // =========================================================================

    #[Test]
    public function register_creates_user_and_returns_201(): void
    {
        $response = $this->postJson('/api/register', [
            'uid' => 'newuser',
            'passcode' => 'pass1234',
        ]);

        $response->assertStatus(201)
            ->assertJson(['message' => 'REGISTRATION SUCCESSFUL']);

        $this->assertDatabaseHas('users', ['uid' => 'newuser']);
    }

    #[Test]
    public function register_hashes_passcode(): void
    {
        $this->postJson('/api/register', [
            'uid' => 'hashtest',
            'passcode' => 'secret99',
        ]);

        $user = User::where('uid', 'hashtest')->first();
        $this->assertTrue(Hash::check('secret99', $user->passcode));
        $this->assertNotEquals('secret99', $user->passcode);
    }

    #[Test]
    public function register_rejects_duplicate_uid(): void
    {
        User::factory()->create(['uid' => 'taken']);

        $response = $this->postJson('/api/register', [
            'uid' => 'taken',
            'passcode' => 'pass1234',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['uid']);
    }

    #[Test]
    public function register_rejects_missing_uid(): void
    {
        $response = $this->postJson('/api/register', [
            'passcode' => 'pass1234',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['uid']);
    }

    #[Test]
    public function register_rejects_missing_passcode(): void
    {
        $response = $this->postJson('/api/register', [
            'uid' => 'newuser',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['passcode']);
    }

    #[Test]
    public function register_rejects_short_passcode(): void
    {
        $response = $this->postJson('/api/register', [
            'uid' => 'newuser',
            'passcode' => 'abc',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['passcode']);
    }

    #[Test]
    public function register_rejects_passcode_with_spaces(): void
    {
        $response = $this->postJson('/api/register', [
            'uid' => 'newuser',
            'passcode' => 'has space',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['passcode']);
    }

    #[Test]
    public function register_rejects_uid_over_32_chars(): void
    {
        $response = $this->postJson('/api/register', [
            'uid' => str_repeat('a', 33),
            'passcode' => 'pass1234',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['uid']);
    }

    #[Test]
    public function register_accepts_uid_with_dashes_underscores(): void
    {
        $response = $this->postJson('/api/register', [
            'uid' => 'my-user_01',
            'passcode' => 'pass1234',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('users', ['uid' => 'my-user_01']);
    }

    #[Test]
    public function register_accepts_passcode_with_special_chars(): void
    {
        $response = $this->postJson('/api/register', [
            'uid' => 'specialuser',
            'passcode' => 'P@ss!#$%',
        ]);

        $response->assertStatus(201);
    }

    // =========================================================================
    //  POST /api/login
    // =========================================================================

    #[Test]
    public function login_with_correct_credentials_returns_user(): void
    {
        User::factory()->create([
            'uid' => 'alice',
            'passcode' => Hash::make('correct'),
            'title' => 'ADMIN',
        ]);

        $response = $this->postJson('/api/login', [
            'uid' => 'alice',
            'passcode' => 'correct',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'LOGIN SUCCESSFUL',
                'user' => ['uid' => 'alice', 'title' => 'ADMIN'],
            ]);
    }

    #[Test]
    public function login_with_wrong_passcode_returns_401(): void
    {
        User::factory()->create([
            'uid' => 'alice',
            'passcode' => Hash::make('correct'),
        ]);

        $response = $this->postJson('/api/login', [
            'uid' => 'alice',
            'passcode' => 'wrong',
        ]);

        $response->assertStatus(401)
            ->assertJson(['message' => 'INVALID UID OR PASSCODE']);
    }

    #[Test]
    public function login_with_nonexistent_uid_returns_401(): void
    {
        $response = $this->postJson('/api/login', [
            'uid' => 'ghost',
            'passcode' => 'anything',
        ]);

        $response->assertStatus(401)
            ->assertJson(['message' => 'INVALID UID OR PASSCODE']);
    }

    #[Test]
    public function login_rejects_missing_fields(): void
    {
        $response = $this->postJson('/api/login', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['uid', 'passcode']);
    }

    // =========================================================================
    //  POST /api/logout
    // =========================================================================

    #[Test]
    public function logout_returns_success(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/logout');

        $response->assertStatus(200)
            ->assertJson(['message' => 'LOGGED OUT']);
    }

    // =========================================================================
    //  GET /api/auth-status
    // =========================================================================

    #[Test]
    public function status_returns_logged_in_user_info(): void
    {
        $user = User::factory()->withTitle('MOD')->withEmail('test@example.com')->create(['uid' => 'statususer']);

        $response = $this->actingAs($user)->getJson('/api/auth-status');

        $response->assertStatus(200)
            ->assertJson([
                'is_logged_in' => true,
                'uid' => 'statususer',
                'title' => 'MOD',
                'email' => 'test@example.com',
            ]);
    }

    #[Test]
    public function status_returns_not_logged_in_for_guest(): void
    {
        $response = $this->getJson('/api/auth-status');

        $response->assertStatus(200)
            ->assertJson(['is_logged_in' => false]);
    }

    // =========================================================================
    //  POST /api/auth/command — /passwd
    // =========================================================================

    #[Test]
    public function passwd_command_updates_passcode_via_http(): void
    {
        $user = User::factory()->create(['uid' => 'resetter']);
        $token = 'validtoken123';
        Cache::put("reset_token:{$token}", 'resetter', now()->addMinutes(10));

        $response = $this->postJson('/api/auth/command', [
            'command' => "/passwd --token {$token} --new newpass99",
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'PASSCODE UPDATED SUCCESSFULLY.']);

        $user->refresh();
        $this->assertTrue(Hash::check('newpass99', $user->passcode));
    }

    #[Test]
    public function passwd_command_rejects_expired_token_via_http(): void
    {
        $response = $this->postJson('/api/auth/command', [
            'command' => '/passwd --token expired123 --new newpass99',
        ]);

        $response->assertStatus(400);
    }

    #[Test]
    public function passwd_command_rejects_invalid_password_format_via_http(): void
    {
        $token = 'fmt_token';
        Cache::put("reset_token:{$token}", 'someone', now()->addMinutes(10));

        $response = $this->postJson('/api/auth/command', [
            'command' => "/passwd --token {$token} --new ab",
        ]);

        $response->assertStatus(400);
    }

    // =========================================================================
    //  POST /api/auth/command — /bind
    // =========================================================================

    #[Test]
    public function bind_command_binds_email_via_http(): void
    {
        $user = User::factory()->create(['uid' => 'binder']);
        $token = 'bindtoken123';
        Cache::put("bind_binder_{$token}", 'binder', now()->addMinutes(10));

        $response = $this->actingAs($user)->postJson('/api/auth/command', [
            'command' => "/bind --token {$token} --email test@example.com",
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'EMAIL BOUND SUCCESSFULLY.']);

        $user->refresh();
        $this->assertEquals('test@example.com', $user->email);
    }

    #[Test]
    public function bind_command_requires_login_via_http(): void
    {
        $response = $this->postJson('/api/auth/command', [
            'command' => '/bind --token abc --email test@example.com',
        ]);

        // Returns 400 because service throws 'LOGIN REQUIRED.'
        $response->assertStatus(400);
    }

    #[Test]
    public function command_rejects_unknown_command(): void
    {
        $response = $this->postJson('/api/auth/command', [
            'command' => '/unknown --flag value',
        ]);

        $response->assertStatus(400);
    }

    #[Test]
    public function command_rejects_missing_command_field(): void
    {
        $response = $this->postJson('/api/auth/command', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['command']);
    }

    // =========================================================================
    //  POST /api/auth/request-reset
    // =========================================================================

    #[Test]
    public function request_reset_sends_email_via_http(): void
    {
        Mail::fake();

        User::factory()->withEmail('user@example.com')->create(['uid' => 'emailuser']);

        $response = $this->postJson('/api/auth/request-reset', [
            'uid' => 'emailuser',
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'RESTORE COMMAND SENT TO REGISTERED EMAIL.']);

        Mail::assertSent(\App\Mail\ResetPasscodeMail::class);
    }

    #[Test]
    public function request_reset_returns_400_for_no_email(): void
    {
        User::factory()->create(['uid' => 'noemail']);

        $response = $this->postJson('/api/auth/request-reset', [
            'uid' => 'noemail',
        ]);

        $response->assertStatus(400);
    }

    #[Test]
    public function request_reset_returns_400_for_nonexistent_uid(): void
    {
        $response = $this->postJson('/api/auth/request-reset', [
            'uid' => 'ghost',
        ]);

        $response->assertStatus(400);
    }

    #[Test]
    public function request_reset_rejects_missing_uid(): void
    {
        $response = $this->postJson('/api/auth/request-reset', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['uid']);
    }

    // =========================================================================
    //  POST /api/auth/request-bind
    // =========================================================================

    #[Test]
    public function request_bind_sends_email_via_http(): void
    {
        Mail::fake();
        $user = User::factory()->create(['uid' => 'bindreq']);

        $response = $this->actingAs($user)->postJson('/api/auth/request-bind', [
            'email' => 'new@example.com',
        ]);

        $response->assertStatus(200)
            ->assertJson(['message' => 'VERIFICATION COMMAND SENT.']);

        Mail::assertSent(\App\Mail\BindEmailMail::class);
    }

    #[Test]
    public function request_bind_returns_401_when_unauthenticated(): void
    {
        $response = $this->postJson('/api/auth/request-bind', [
            'email' => 'test@example.com',
        ]);

        $response->assertStatus(401);
    }

    #[Test]
    public function request_bind_rejects_invalid_email(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/auth/request-bind', [
            'email' => 'not-an-email',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    // =========================================================================
    //  End-to-end: register → login → status → logout → status
    // =========================================================================

    #[Test]
    public function full_lifecycle_register_login_status_logout(): void
    {
        // 1. Register
        $this->postJson('/api/register', [
            'uid' => 'lifecycle',
            'passcode' => 'test1234',
        ])->assertStatus(201);

        // 2. Login
        $loginResponse = $this->postJson('/api/login', [
            'uid' => 'lifecycle',
            'passcode' => 'test1234',
        ]);
        $loginResponse->assertStatus(200)
            ->assertJson(['user' => ['uid' => 'lifecycle']]);

        // 3. Status (authenticated via session cookie from login)
        $user = User::where('uid', 'lifecycle')->first();
        $this->actingAs($user)->getJson('/api/auth-status')
            ->assertJson(['is_logged_in' => true, 'uid' => 'lifecycle']);

        // 4. Logout
        $this->actingAs($user)->postJson('/api/logout')
            ->assertStatus(200);

        // 5. Guest status
        $this->getJson('/api/auth-status')
            ->assertJson(['is_logged_in' => false]);
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use App\Mail\ResetPasscodeMail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AuthServiceTest extends TestCase
{
    use RefreshDatabase;

    private AuthService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(AuthService::class);
    }

    // =========================================================================
    //  register()
    // =========================================================================

    #[Test] /* A15 */
    public function register_stores_hashed_passcode(): void
    {
        $user = $this->service->register([
            'uid' => 'testuser',
            'passcode' => 'mypass123',
        ]);

        $this->assertNotEquals('mypass123', $user->passcode);
        $this->assertTrue(Hash::check('mypass123', $user->passcode));
    }

    // =========================================================================
    //  login()
    // =========================================================================

    #[Test] /* A12 */
    public function login_with_correct_password_returns_user(): void
    {
        User::factory()->create([
            'uid' => 'alice',
            'passcode' => Hash::make('secret'),
        ]);

        $user = $this->service->login('alice', 'secret');

        $this->assertNotNull($user);
        $this->assertEquals('alice', $user->uid);
    }

    #[Test] /* A13 */
    public function login_with_wrong_password_returns_null(): void
    {
        User::factory()->create([
            'uid' => 'alice',
            'passcode' => Hash::make('secret'),
        ]);

        $this->assertNull($this->service->login('alice', 'wrong'));
    }

    #[Test] /* A14 */
    public function login_with_nonexistent_uid_returns_null(): void
    {
        $this->assertNull($this->service->login('ghost', 'anything'));
    }

    // =========================================================================
    //  executeCommand() — /passwd
    // =========================================================================

    #[Test] /* A1 */
    public function passwd_command_updates_passcode_on_valid_token(): void
    {
        $user = User::factory()->create(['uid' => 'bob']);
        Cache::put('reset_token:abc123', 'bob', now()->addMinutes(10));

        $result = $this->service->executeCommand('/passwd --token abc123 --new NewPass1', null);

        $this->assertEquals('PASSCODE UPDATED SUCCESSFULLY.', $result);
        $user->refresh();
        $this->assertTrue(Hash::check('NewPass1', $user->passcode));
        $this->assertNull(Cache::get('reset_token:abc123'));
    }

    #[Test] /* A2 */
    public function passwd_command_rejects_invalid_password_format(): void
    {
        Cache::put('reset_token:abc123', 'bob', now()->addMinutes(10));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('PASSWORD FORMAT INVALID');

        $this->service->executeCommand('/passwd --token abc123 --new ab', null); // too short
    }

    #[Test] /* A2b — password with spaces */
    public function passwd_command_rejects_password_with_spaces(): void
    {
        Cache::put('reset_token:abc123', 'bob', now()->addMinutes(10));

        // Regex requires \S+ for password, so spaces in password won't match the pattern at all
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('UNKNOWN COMMAND');

        $this->service->executeCommand('/passwd --token abc123 --new has space', null);
    }

    #[Test] /* A3 */
    public function passwd_command_rejects_expired_token(): void
    {
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('INVALID OR EXPIRED TOKEN');

        $this->service->executeCommand('/passwd --token expired123 --new ValidPass1', null);
    }

    #[Test] /* A4 */
    public function passwd_command_rejects_token_for_deleted_user(): void
    {
        Cache::put('reset_token:tok999', 'deleted_user', now()->addMinutes(10));
        // User 'deleted_user' does not exist in DB

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('INVALID OR EXPIRED TOKEN');

        $this->service->executeCommand('/passwd --token tok999 --new ValidPass1', null);
    }

    // =========================================================================
    //  executeCommand() — /bind
    // =========================================================================

    #[Test] /* A5 */
    public function bind_command_requires_login(): void
    {
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('LOGIN REQUIRED');

        $this->service->executeCommand('/bind --token abc --email test@example.com', null);
    }

    #[Test] /* A6 */
    public function bind_command_binds_email_on_valid_token(): void
    {
        $user = User::factory()->create(['uid' => 'carol']);
        Cache::put('bind_current_carol', [
            'token' => 'tok456',
            'email' => 'carol@test.com',
        ], now()->addMinutes(10));

        $result = $this->service->executeCommand('/bind --token tok456 --email carol@test.com', $user);

        $this->assertEquals('EMAIL BOUND SUCCESSFULLY.', $result);
        $user->refresh();
        $this->assertEquals('carol@test.com', $user->email);
        $this->assertNull(Cache::get('bind_current_carol'));
    }

    #[Test] /* A7 */
    public function bind_command_rejects_wrong_token(): void
    {
        $user = User::factory()->create(['uid' => 'carol']);
        Cache::put('bind_current_carol', [
            'token' => 'realtoken',
            'email' => 'carol@test.com',
        ], now()->addMinutes(10));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('INVALID OR EXPIRED TOKEN');

        $this->service->executeCommand('/bind --token wrongtoken --email carol@test.com', $user);
    }

    #[Test] /* A7b — email substitution attack */
    public function bind_command_rejects_email_substitution(): void
    {
        $user = User::factory()->create(['uid' => 'carol']);
        // Cache records we sent the /bind command to carol's legit address.
        Cache::put('bind_current_carol', [
            'token' => 'toksub',
            'email' => 'legit@carol.com',
        ], now()->addMinutes(10));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('INVALID OR EXPIRED TOKEN');

        // Attacker tries to re-use the token with a different email (e.g.
        // observed the command, swapped the address). Must be rejected.
        $this->service->executeCommand('/bind --token toksub --email attacker@evil.com', $user);
    }

    #[Test] /* A8 */
    public function bind_command_rejects_invalid_email(): void
    {
        $user = User::factory()->create(['uid' => 'dave']);
        Cache::put('bind_current_dave', [
            'token' => 'tokABC',
            'email' => 'dave@test.com',
        ], now()->addMinutes(10));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('INVALID EMAIL FORMAT');

        $this->service->executeCommand('/bind --token tokABC --email not-an-email', $user);
    }

    #[Test] /* A9 */
    public function bind_command_rejects_expired_token(): void
    {
        $user = User::factory()->create(['uid' => 'eve']);

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('INVALID OR EXPIRED TOKEN');

        $this->service->executeCommand('/bind --token expired --email eve@test.com', $user);
    }

    // =========================================================================
    //  executeCommand() — unknown
    // =========================================================================

    #[Test] /* A10 */
    public function unknown_command_throws_syntax_error(): void
    {
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('SYNTAX ERROR: UNKNOWN COMMAND');

        $this->service->executeCommand('/something --random', null);
    }

    #[Test] /* A11 — partial match */
    public function incomplete_passwd_command_throws_unknown(): void
    {
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('UNKNOWN COMMAND');

        $this->service->executeCommand('/passwd --token abc123', null); // missing --new
    }

    // =========================================================================
    //  requestPasswordReset()
    // =========================================================================

    #[Test] /* A16 */
    public function request_reset_sends_mail_when_email_bound(): void
    {
        Mail::fake();
        User::factory()->withEmail('alice@test.com')->create(['uid' => 'alice']);

        $this->service->requestPasswordReset('alice');

        // ResetPasscodeMail implements ShouldQueue so Mail::fake() captures
        // it via assertQueued, not assertSent.
        Mail::assertQueued(ResetPasscodeMail::class, function ($mail) {
            return $mail->hasTo('alice@test.com');
        });
    }

    #[Test] /* A17 */
    public function request_reset_throws_when_no_email(): void
    {
        User::factory()->create(['uid' => 'bob']); // no email

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('UID NOT FOUND OR EMAIL NOT BOUND');

        $this->service->requestPasswordReset('bob');
    }

    #[Test] /* A18 */
    public function request_reset_throws_when_uid_not_found(): void
    {
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('UID NOT FOUND OR EMAIL NOT BOUND');

        $this->service->requestPasswordReset('nonexistent');
    }

    #[Test] /* A19 — single-token policy on reset */
    public function second_reset_request_invalidates_first_token(): void
    {
        Mail::fake();
        User::factory()->withEmail('x@test.com')->create(['uid' => 'rep']);

        $this->service->requestPasswordReset('rep');
        $firstToken = Cache::get('reset_current_rep');
        $this->assertNotNull($firstToken);
        $this->assertEquals('rep', Cache::get("reset_token:{$firstToken}"));

        $this->service->requestPasswordReset('rep');
        $secondToken = Cache::get('reset_current_rep');

        $this->assertNotEquals($firstToken, $secondToken);
        // First token's lookup must have been cleared.
        $this->assertNull(Cache::get("reset_token:{$firstToken}"));
        // Second token is still live.
        $this->assertEquals('rep', Cache::get("reset_token:{$secondToken}"));
    }

    #[Test] /* A20 — single-token policy on bind */
    public function second_bind_request_overwrites_first(): void
    {
        Mail::fake();
        $user = User::factory()->create(['uid' => 'rebind']);

        $this->service->requestEmailBinding('first@test.com', $user);
        $first = Cache::get('bind_current_rebind');
        $this->assertEquals('first@test.com', $first['email']);

        $this->service->requestEmailBinding('second@test.com', $user);
        $second = Cache::get('bind_current_rebind');

        $this->assertEquals('second@test.com', $second['email']);
        $this->assertNotEquals($first['token'], $second['token']);
    }

    #[Test] /* A21 — token length is 8 chars */
    public function generated_tokens_are_8_chars_long(): void
    {
        Mail::fake();
        User::factory()->withEmail('tok@test.com')->create(['uid' => 'tok']);

        $this->service->requestPasswordReset('tok');
        $this->assertEquals(8, strlen(Cache::get('reset_current_tok')));

        $user = User::find(User::where('uid', 'tok')->value('id'));
        $this->service->requestEmailBinding('new@test.com', $user);
        $this->assertEquals(8, strlen(Cache::get('bind_current_tok')['token']));
    }
}

<!DOCTYPE html>
<html>
<body style="background-color: #000; color: #32FF32; font-family: monospace; padding: 20px;">
    <h1 style="border-bottom: 2px solid #32FF32; padding-bottom: 10px;">[ SECURITY BREACH / SYSTEM RESTORE ]</h1>
    <p>A password reset request has been received for UID: <strong>{{ $uid }}</strong>.</p>
    <p>Please copy and execute the following command in your terminal:</p>
    <div style="background-color: #111; border: 1px dashed #32FF32; padding: 15px; margin: 20px 0; color: #fff; word-break: break-all;">
        {{ $command }}
    </div>
    <p style="color: #888;">* This command will expire in 10 minutes.</p>
    <p>If you did not request this, please ignore this message.</p>
</body>
</html>

// Place at: src/lib/admin/totp.ts
import { TOTP, Secret } from "otpauth";

export function verifyTotpCode(code: string): boolean {
  const secretBase32 = process.env.ADMIN_TOTP_SECRET;
  if (!secretBase32) return false;
  const totp = new TOTP({
    secret: Secret.fromBase32(secretBase32),
    digits: 6,
    period: 30,
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

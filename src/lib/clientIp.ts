// Place at: src/lib/clientIp.ts
//
// The visitor's address, for per-address limits (sign-in, 2FA, the Vault,
// the AI tools, the MOT check) and the sessions list. Azure sits in front
// of the app, so it arrives in X-Forwarded-For: the first entry is the
// visitor, anything after it a proxy.
//
// Azure App Service can add the visitor's port to that first entry
// ("203.0.113.5:51234"). Kept as-is, every new connection looked like a
// new visitor and a per-address limit never added up - so the port is
// dropped. One place for it, instead of the copy every route used to have.
export function clientIpFromForwardedFor(forwardedFor: string | null | undefined): string {
  const first = forwardedFor?.split(",")[0].trim();
  if (!first) return "unknown";
  const v4 = first.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4) return v4[1];
  const v6 = first.match(/^\[([^\]]+)\]:\d+$/);
  return v6 ? v6[1] : first;
}

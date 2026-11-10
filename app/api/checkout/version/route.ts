export function GET() {
  return Response.json({ checkoutVersion: 3, giftcardVerification: "rewarble-backend-v1", eligibilityPolicy: "country-allowlist-v3", expiryAuthority: "database", paypalMinutes: 30, giftcardHours: 2, cardCryptoHours: 12, cryptoHours: 5, providerGraceMinutes: 60, giftcardExactPlanLink: true }, { headers: { "Cache-Control": "no-store" } });
}

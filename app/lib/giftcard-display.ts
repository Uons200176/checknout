export function giftcardIssue(reason?: string): string {
  return ({
    underpaid: 'The card was redeemed, but its value is below the amount accepted for this order. Contact support with your checkout reference; do not buy another card.',
    currency_mismatch: 'The card was redeemed in a different currency. Our team must review it before approving payment. Do not submit another card.',
    voucher_used: 'Rewarble reports that this card was already used. If you submitted it here before, contact support rather than buying another card.',
    voucher_expired: 'This gift card has expired. Contact the seller or support.',
    unknown_voucher: 'Rewarble could not find this card. Check the revealed gift-card code, not the G2A order number.',
    voucher_invalid_lenght: 'The gift-card code has an invalid length. Copy the full revealed code from G2A.',
    voucher_inactive: 'This gift card is not active. Contact the seller or support.',
    voucher_empty: 'This gift card has no remaining value. Contact support.',
    provider_busy: 'Rewarble is busy. Please wait before retrying the same code.',
    provider_configuration: 'Gift-card verification is temporarily unavailable. Contact support; do not purchase another card.',
  } as Record<string, string>)[reason ?? ''] ?? 'The result needs manual verification. Our team will check it; do not submit another card.';
}

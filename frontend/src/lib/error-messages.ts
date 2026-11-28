const messages: Record<string, string> = {
  ERR_DATABASE_UNAVAILABLE: 'We can’t reach DE RIDE right now. Please try again shortly.',
  ERR_PAYMENT_SERVICE_NOT_CONFIGURED: 'Payments are temporarily unavailable. Your account has not been charged.',
  ERR_PAYSTACK_INITIALIZE_FAILED: 'We couldn’t start checkout. Please try again or choose wallet payment.',
  ERR_PAYMENT_NOT_SETTLED: 'Your payment is still being confirmed. If you were charged, check your transactions in a moment.',
  ERR_PAYMENT_NOT_FOUND: 'We couldn’t find that payment. Check the reference and try again.',
  ERR_WALLET_BALANCE_INSUFFICIENT: 'Your wallet balance is too low for this purchase. Add funds or choose another payment method.',
  ERR_AMEBO_PROVIDER_UNAVAILABLE: 'Amebo is taking a short break. Your message token has been returned; please try again shortly.',
  ERR_AMEBO_PROVIDER_FAILED: 'Amebo couldn’t finish that reply. Please try again.',
  ERR_AMEBO_INSUFFICIENT_TOKENS: 'You’re out of chat tokens for now. Check the token packs to keep chatting.',
  ERR_AUTH_INVALID_CREDENTIALS: 'That email and password combination didn’t match. Check them and try again.',
  ERR_INVALID_CREDENTIALS: 'That email and password combination didn’t match. Check them and try again.',
  ERR_OTP_INVALID_OR_EXPIRED: 'That verification code has expired or is incorrect. Request a new code and try again.',
  ERR_EMAIL_ALREADY_REGISTERED: 'An account already uses this email. Sign in or use a different email address.',
  ERR_IDEMPOTENCY_KEY_REQUIRED: 'This request needs a fresh checkout attempt. Please try again.',
  ERR_INVALID_REQUEST: 'Some details are missing or invalid. Review the form and try again.',
  ERR_INVALID_REGISTRATION: 'Please review your details and make sure each field is valid.',
  ERR_EMAIL_VERIFICATION_REQUIRED: 'Verify your email address before continuing with this action.',
  ERR_UNAUTHORIZED: 'Your session has ended. Sign in again to continue.',
  ERR_FORBIDDEN: 'Your account doesn’t have access to this action.',
  ERR_NOT_FOUND: 'We couldn’t find what you were looking for.',
  ERR_RATE_LIMITED: 'Too many attempts in a short time. Please wait a moment and try again.',
};

export function friendlyError(codeOrMessage: unknown, fallback = 'Something went wrong. Please try again.') {
  if (typeof codeOrMessage !== 'string' || !codeOrMessage.trim()) return fallback;
  const code = codeOrMessage.trim();
  if (messages[code]) return messages[code];
  if (code.startsWith('ERR_')) {
    if (code.includes('AUTH_REQUIRED') || code.includes('TOKEN') || code.includes('SESSION')) return 'Your sign-in needs attention. Sign in again and retry.';
    if (code.includes('FORBIDDEN') || code.includes('ACCESS_DENIED') || code.includes('ROLE_') || code.includes('KYC_REQUIRED') || code.includes('APPROVED_')) return 'Your account can’t use this action yet. Check your role and verification status, or contact support.';
    if (code.includes('INSUFFICIENT') || code.includes('BALANCE')) return 'There isn’t enough balance for this action. Add funds or choose another option.';
    if (code.includes('NOT_FOUND') || code.includes('NOT_GRANTED')) return 'We couldn’t find the requested item. Refresh the page and try again.';
    if (code.includes('EXPIRED') || code.includes('WINDOW_CLOSED')) return 'This request has expired. Refresh the page to see the available next steps.';
    if (code.includes('INVALID') || code.includes('REQUIRED') || code.includes('MISSING')) return 'Please check the details and try again.';
    if (code.includes('UNAVAILABLE') || code.includes('UNCONFIGURED') || code.includes('NOT_CONFIGURED')) return 'This service is temporarily unavailable. Please try again shortly.';
    if (code.includes('FAILED') || code.includes('ERROR')) return 'We couldn’t complete that request. Please try again, and contact support if it keeps happening.';
    return 'We couldn’t complete that request. Please try again, and contact support if it keeps happening.';
  }
  return code;
}

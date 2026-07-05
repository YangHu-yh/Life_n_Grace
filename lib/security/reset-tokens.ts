// Password-reset tokens share the VerificationToken table with email
// verification, namespaced by this identifier prefix so a reset token can
// never be replayed against the email-verification endpoint (or vice versa).
export const RESET_IDENTIFIER_PREFIX = "password-reset:";

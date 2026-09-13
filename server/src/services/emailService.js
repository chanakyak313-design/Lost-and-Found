export async function sendEmail({ to, subject, html }) {
  console.log(`[Email disabled] Would send to ${to}: ${subject}`);
}

export async function sendVerificationEmail(email, token) {
  console.log(`[Email disabled] Verification for ${email}`);
}

export async function sendPasswordResetEmail(email, token) {
  console.log(`[Email disabled] Password reset for ${email}`);
}

export async function sendMatchNotification(email, itemTitle, matchItemTitle, matchScore) {
  console.log(`[Email disabled] Match alert for ${email}`);
}

export async function sendClaimNotification(email, itemTitle, claimantName) {
  console.log(`[Email disabled] Claim notification for ${email}`);
}

export function allowedGoogleEmails() {
  return new Set(
    (process.env.GOOGLE_ALLOWED_EMAILS || '')
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}
export function localPasswordEnabled() {
  try {
    if (!process.env.APP_URL) return false;
    const url = new URL(process.env.APP_URL);
    return (
      process.env.CLASSROOM_ENV === 'development' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !process.env.NETLIFY &&
      !process.env.CONTEXT
    );
  } catch {
    return false;
  }
}
export function loginOptions() {
  return {
    google: !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      allowedGoogleEmails().size
    ),
    localPassword: localPasswordEnabled(),
  };
}

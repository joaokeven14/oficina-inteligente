export type PasswordSetupMode = 'recovery' | 'invite';
export type AuthCallback = { accessToken: string; refreshToken: string; passwordMode: PasswordSetupMode | null };

export function parseAuthCallback(value: string): AuthCallback | null {
  try {
    const url = new URL(value);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    const params = fragment.has('access_token') ? fragment : url.searchParams;
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return null;
    const type = params.get('type');
    return { accessToken, refreshToken, passwordMode: type === 'recovery' || type === 'invite' ? type : null };
  } catch { return null; }
}

export function withoutAuthTokens(value: string): string {
  const url = new URL(value);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (fragment.has('access_token') || fragment.has('error')) url.hash = '';
  for (const key of ['access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at', 'type', 'provider_token', 'provider_refresh_token', 'error', 'error_code', 'error_description']) {
    url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function passwordResetRedirect(platform: string, webOrigin?: string): string {
  if (platform !== 'web' || !webOrigin) return 'oficina-inteligente://reset-password';
  try {
    const url = new URL(webOrigin);
    url.search = '';
    url.hash = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  } catch {
    return 'oficina-inteligente://reset-password';
  }
}

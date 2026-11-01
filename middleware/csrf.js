const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function csrfCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    partitioned: isProduction,
    maxAge: CSRF_MAX_AGE
  };
}

function luoCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function asetaCsrfToken(req, res) {
  const token = luoCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

function csrfTokenEndpoint(req, res) {
  const token = asetaCsrfToken(req, res);
  return res.status(200).json({ csrfToken: token });
}

function tarkistaCsrfToken(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (
    typeof cookieToken !== 'string' ||
    typeof headerToken !== 'string' ||
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(
      Buffer.from(cookieToken, 'utf8'),
      Buffer.from(headerToken, 'utf8')
    )
  ) {
    return res.status(403).json({ error: 'Virheellinen tai puuttuva CSRF-token' });
  }

  return next();
}

module.exports = { csrfTokenEndpoint, tarkistaCsrfToken };

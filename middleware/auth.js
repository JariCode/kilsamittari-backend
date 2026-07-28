const jwt = require('jsonwebtoken');

// Tarkistaa evästeessä olevan tokenin ja liittää käyttäjätiedot pyyntöön
function vaadiKirjautuminen(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Kirjautuminen vaaditaan' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Istunto on vanhentunut' });
  }
}

// Sallii pääsyn vain ylläpitäjälle
function vaadiAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ei käyttöoikeutta' });
  }
  next();
}

module.exports = { vaadiKirjautuminen, vaadiAdmin };
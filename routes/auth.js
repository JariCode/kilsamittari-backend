const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { isValidUsername, isValidPassword } = require('../utils/validators');
const { kirjaaLoki } = require('../utils/logger');

const router = express.Router();

// Tokenin voimassaolo haetaan envistä, oletus 7 päivää
const TOKEN_VOIMASSAOLO = process.env.JWT_EXPIRES_IN || '7d';

// Evästeen maxAge millisekunteina, oletus 7 päivää
const EVASTE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// Bruteforce-suojaus kirjautumiselle
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Liian monta yritystä. Yritä myöhemmin uudelleen.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rekisteröinti
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Käyttäjätunnus ei kelpaa, käytä 3-20 merkkiä' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Salasanan tulee olla vähintään 8 merkkiä ja sisältää iso ja pieni kirjain sekä numero' });
    }

    // Tarkistetaan onko käyttäjätunnus jo varattu
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Käyttäjätunnus on jo käytössä' });
    }

    // Salasanan hashaus
    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = new User({
      username,
      passwordHash,
      role: 'user'
    });

    await newUser.save();

    // Kirjataan rekisteröinti lokiin
    await kirjaaLoki('register', newUser.username);

    return res.status(201).json({ message: 'Rekisteröinti onnistui' });
  } catch (err) {
    console.error('Rekisteröintivirhe', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Kirjautuminen
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      // Ei paljasteta onko käyttäjätunnus olemassa
      return res.status(401).json({ error: 'Väärät tunnukset' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Väärät tunnukset' });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_VOIMASSAOLO }
    );

    // Token httpOnly-evästeeseen
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: EVASTE_MAX_AGE
    });

    // Kirjataan kirjautuminen lokiin
    await kirjaaLoki('login', user.username);

    return res.status(200).json({
      message: 'Kirjautuminen onnistui',
      user: { username: user.username, role: user.role }
    });
  } catch (err) {
    console.error('Kirjautumisvirhe', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Uloskirjautuminen
router.post('/logout', async (req, res) => {
  // Yritetään lukea käyttäjä tokenista lokitusta varten
  const token = req.cookies.token;

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.userId).select('username').lean();

      if (user) {
        await kirjaaLoki('logout', user.username);
      }
    } catch (err) {
      // Vanhentunut tai virheellinen token, ei lokiteta mutta ei estetä uloskirjautumista
    }
  }

  res.clearCookie('token');
  return res.status(200).json({ message: 'Uloskirjautuminen onnistui' });
});

// Palauttaa kirjautuneen käyttäjän tiedot
router.get('/me', async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Ei kirjautunut' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select('username role').lean();

    if (!user) {
      return res.status(401).json({ error: 'Käyttäjää ei löydy' });
    }

    return res.status(200).json({
      user: { username: user.username, role: user.role }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Istunto on vanhentunut' });
  }
});

module.exports = router;
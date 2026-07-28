const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const WalkEntry = require('../models/WalkEntry');
const Log = require('../models/Log');
const { vaadiKirjautuminen, vaadiAdmin } = require('../middleware/auth');
const { kirjaaLoki } = require('../utils/logger');

const router = express.Router();

// Kaikki reitit vaativat kirjautumisen ja admin-roolin
router.use(vaadiKirjautuminen);
router.use(vaadiAdmin);

// Rajoitetaan admin-toimintojen tiheyttä
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Liian monta pyyntöä. Yritä myöhemmin uudelleen.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(adminLimiter);

// Hakee kaikki käyttäjät
router.get('/users', async (req, res) => {
  try {
    const users = await User
      .find()
      .select('username role createdAt lastLogin')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ users });
  } catch (err) {
    console.error('Käyttäjien haku epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Hakee lokin, uusin ensin
router.get('/logs', async (req, res) => {
  try {
    // Rajataan haku kohtuulliseen määrään
    const logs = await Log
      .find()
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({ logs });
  } catch (err) {
    console.error('Lokin haku epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Muuttaa käyttäjän roolin
router.put('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Tarkistetaan tunnisteen muoto
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ error: 'Virheellinen tunniste' });
    }

    // Sallitaan vain kelvolliset roolit
    if (role !== 'user' && role !== 'admin') {
      return res.status(400).json({ error: 'Virheellinen rooli' });
    }

    // Admin ei voi muuttaa omaa rooliaan
    if (id === req.user.userId) {
      return res.status(403).json({ error: 'Et voi muuttaa omaa rooliasi' });
    }

    const kohde = await User.findById(id);

    if (!kohde) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    }

    // Jos rooli on jo sama, ei tehdä mitään
    if (kohde.role === role) {
      return res.status(400).json({ error: 'Käyttäjällä on jo tämä rooli' });
    }

    const vanhaRooli = kohde.role;
    kohde.role = role;
    await kohde.save();

    // Haetaan tekijän nimi lokia varten
    const tekija = await User.findById(req.user.userId).select('username').lean();

    // Kirjataan loki, kerrotaan muutoksen suunta
    await kirjaaLoki(
      'role_change',
      tekija.username,
      kohde.username,
      `${vanhaRooli} -> ${role}`
    );

    return res.status(200).json({
      message: 'Rooli muutettu',
      user: { _id: kohde._id, username: kohde.username, role: kohde.role }
    });
  } catch (err) {
    console.error('Roolin muutos epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Poistaa käyttäjän ja kaikki hänen merkintänsä
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ error: 'Virheellinen tunniste' });
    }

    // Admin ei voi poistaa itseään
    if (id === req.user.userId) {
      return res.status(403).json({ error: 'Et voi poistaa omaa tiliäsi täältä' });
    }

    const kohde = await User.findById(id);

    if (!kohde) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    }

    const kohteenNimi = kohde.username;

    // Poistetaan ensin kaikki käyttäjän merkinnät
    await WalkEntry.deleteMany({ userId: kohde._id });

    // Sitten itse käyttäjä
    await User.deleteOne({ _id: kohde._id });

    // Haetaan tekijän nimi lokia varten
    const tekija = await User.findById(req.user.userId).select('username').lean();

    // Kirjataan loki, kohteen nimi tekstinä ettei katoa
    await kirjaaLoki('delete_user', tekija.username, kohteenNimi);

    return res.status(200).json({ message: 'Käyttäjä poistettu' });
  } catch (err) {
    console.error('Käyttäjän poisto epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

module.exports = router;
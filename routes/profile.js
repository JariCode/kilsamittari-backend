const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const WalkEntry = require('../models/WalkEntry');
const { vaadiKirjautuminen } = require('../middleware/auth');
const { isValidUsername, isValidPassword } = require('../utils/validators');
const { kirjaaLoki } = require('../utils/logger');

const router = express.Router();

// Kaikki reitit vaativat kirjautumisen
router.use(vaadiKirjautuminen);

// Rajoitetaan profiilimuutosten tiheyttä
const profiiliLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Liian monta yritystä. Yritä myöhemmin uudelleen.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(profiiliLimiter);

// Vaihtaa käyttäjätunnuksen, vaatii nykyisen salasanan
router.put('/username', async (req, res) => {
  try {
    const { newUsername, password } = req.body;

    if (!newUsername || !password) {
      return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan' });
    }

    if (!isValidUsername(newUsername)) {
      return res.status(400).json({ error: 'Käyttäjätunnus ei kelpaa, käytä 3-20 merkkiä' });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    }

    // Varmistetaan nykyinen salasana
    const salasanaTasmaa = await bcrypt.compare(password, user.passwordHash);

    if (!salasanaTasmaa) {
      return res.status(401).json({ error: 'Väärä salasana' });
    }

    // Tarkistetaan ettei uusi tunnus ole jo käytössä
    const olemassa = await User.findOne({ username: newUsername });

    if (olemassa) {
      return res.status(409).json({ error: 'Käyttäjätunnus on jo käytössä' });
    }

    user.username = newUsername;
    await user.save();

    return res.status(200).json({
      message: 'Käyttäjätunnus vaihdettu',
      user: { username: user.username, role: user.role }
    });
  } catch (err) {
    console.error('Käyttäjätunnuksen vaihto epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Vaihtaa salasanan, vaatii nykyisen salasanan
router.put('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Nykyinen ja uusi salasana vaaditaan' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Salasanan tulee olla vähintään 8 merkkiä ja sisältää iso ja pieni kirjain sekä numero' });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    }

    // Varmistetaan nykyinen salasana
    const salasanaTasmaa = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!salasanaTasmaa) {
      return res.status(401).json({ error: 'Väärä salasana' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.status(200).json({ message: 'Salasana vaihdettu' });
  } catch (err) {
    console.error('Salasanan vaihto epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Generoi uuden tuontiavaimen, vanha lakkaa toimimasta
router.post('/import-key', async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    }

    // Luodaan satunnainen avain selkokielisenä
    const avain = 'km_' + crypto.randomBytes(24).toString('hex');

    // Tallennetaan vain sha-256 hash, ei selkokielista avainta
    const hash = crypto.createHash('sha256').update(avain).digest('hex');
    user.importKeyHash = hash;
    await user.save();

    // Selkokielinen avain palautetaan vain tässä, kerran
    return res.status(200).json({
      message: 'Tuontiavain luotu',
      importKey: avain
    });
  } catch (err) {
    console.error('Tuontiavaimen luonti epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Kertoo onko tuontiavain olemassa, ei paljasta itse avainta
router.get('/import-key', async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).lean();

    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    }

    return res.status(200).json({ hasKey: Boolean(user.importKeyHash) });
  } catch (err) {
    console.error('Tuontiavaimen tila epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Poistaa tilin ja kaikki merkinnät, vaatii nykyisen salasanan
router.delete('/', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Salasana vaaditaan' });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    }

    // Varmistetaan nykyinen salasana
    const salasanaTasmaa = await bcrypt.compare(password, user.passwordHash);

    if (!salasanaTasmaa) {
      return res.status(401).json({ error: 'Väärä salasana' });
    }

    // Kirjataan tilin poisto lokiin ennen poistoa, jotta käyttäjänimi on vielä saatavilla
    await kirjaaLoki('delete_self', user.username, user.username);

    // Poistetaan ensin kaikki käyttäjän merkinnät
    await WalkEntry.deleteMany({ userId: user._id });

    // Sitten itse käyttäjä
    await User.deleteOne({ _id: user._id });

    // Tyhjennetään istuntoeväste
    res.clearCookie('token');

    return res.status(200).json({ message: 'Tili poistettu' });
  } catch (err) {
    console.error('Tilin poisto epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

module.exports = router;
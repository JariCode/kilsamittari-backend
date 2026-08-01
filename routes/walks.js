const express = require('express');
const WalkEntry = require('../models/WalkEntry');
const { vaadiKirjautuminen } = require('../middleware/auth');
const { laskeKoonnit, laskeKeskiarvot, laskePalkinnot } = require('../utils/summary');

const router = express.Router();

// Kaikki reitit vaativat kirjautumisen
router.use(vaadiKirjautuminen);

// Hakee käyttäjän merkinnät päiväkohtaisesti yhteenlaskettuna sekä koonnit
router.get('/', async (req, res) => {
  try {
    const kaikkiMerkinnat = await WalkEntry
      .find({ userId: req.user.userId })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Lasketaan päivien summat yhteen listausta varten
    const paivat = new Map();

    for (const merkinta of kaikkiMerkinnat) {
      if (!paivat.has(merkinta.date)) {
        paivat.set(merkinta.date, { date: merkinta.date, km: 0, osat: [] });
      }

      const paiva = paivat.get(merkinta.date);
      paiva.km += merkinta.km;
      paiva.osat.push({ _id: merkinta._id, km: merkinta.km });
    }

    // Pyöristetään summat kahteen desimaaliin
    const merkinnat = Array.from(paivat.values()).map((paiva) => ({
      date: paiva.date,
      km: Math.round(paiva.km * 100) / 100,
      osat: paiva.osat
    }));

    const koonnit = laskeKoonnit(kaikkiMerkinnat);
    const keskiarvot = laskeKeskiarvot(koonnit);
    const palkinnot = laskePalkinnot(koonnit.yhteensa);

    return res.status(200).json({ merkinnat, koonnit, keskiarvot, palkinnot });
  } catch (err) {
    console.error('Merkintöjen haku epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Lisää uuden merkinnän, samalle päivälle voi lisätä useita
router.post('/', async (req, res) => {
  try {
    const { date, km } = req.body;

    if (!date || km === undefined || km === null) {
      return res.status(400).json({ error: 'Päivämäärä ja kilometrit vaaditaan' });
    }

    // Päivämäärän muoto tarkistetaan
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Virheellinen päivämäärä' });
    }

    const kilometrit = Number(km);

    if (Number.isNaN(kilometrit) || kilometrit <= 0 || kilometrit > 500) {
      return res.status(400).json({ error: 'Kilometrit tulee olla suurempi kuin 0 ja enintään 500' });
    }

    // Pyöristetään kahteen desimaaliin
    const pyoristettu = Math.round(kilometrit * 100) / 100;

    const merkinta = await WalkEntry.create({
      userId: req.user.userId,
      date,
      km: pyoristettu
    });

    return res.status(201).json({ merkinta });
  } catch (err) {
    console.error('Merkinnän tallennus epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Poistaa yksittäisen merkinnän tunnisteen perusteella
router.delete('/merkinta/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Tarkistetaan että tunniste on kelvollinen
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ error: 'Virheellinen tunniste' });
    }

    // Poistetaan vain jos merkintä kuuluu kirjautuneelle käyttäjälle
    const tulos = await WalkEntry.deleteOne({
      _id: id,
      userId: req.user.userId
    });

    if (tulos.deletedCount === 0) {
      return res.status(404).json({ error: 'Merkintää ei löytynyt' });
    }

    return res.status(200).json({ message: 'Merkintä poistettu' });
  } catch (err) {
    console.error('Merkinnän poisto epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Poistaa päivän kaikki merkinnät
router.delete('/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Virheellinen päivämäärä' });
    }

    await WalkEntry.deleteMany({ userId: req.user.userId, date });

    return res.status(200).json({ message: 'Päivän merkinnät poistettu' });
  } catch (err) {
    console.error('Merkintöjen poisto epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

module.exports = router;
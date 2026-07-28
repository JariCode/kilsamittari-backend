const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const User = require('../models/User');
const WalkEntry = require('../models/WalkEntry');

// Rajoitetaan tuontipyyntöjen tiheyttä, estää avaimen arvailun
const healthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Liian monta pyyntöä. Yritä myöhemmin uudelleen.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(healthLimiter);

// Health-tuonti sallii suuremman rungon kuin muut reitit
const healthParser = express.json({ limit: '25mb' });

// Poimii päivämäärän muodossa VVVV-KK-PP treenin alkuajasta
// Esim "2026-07-21 13:35:54 +0300" -> "2026-07-21"
// Otetaan päivä suoraan merkkijonosta, jotta aikavyöhyke säilyy oikein
function poimiPaiva(aikaleima) {
  if (typeof aikaleima !== 'string') {
    return null;
  }

  const osuma = aikaleima.match(/^(\d{4}-\d{2}-\d{2})/);
  return osuma ? osuma[1] : null;
}

// Kertoo onko treeni kävelytreeni jossa on matka
function onKavelytreeni(treeni) {
  // matka pitää olla olemassa ja suurempi kuin nolla
  const matka = treeni?.distance?.qty;

  if (typeof matka !== 'number' || matka <= 0) {
    return false;
  }

  // Yksikön pitää olla kilometrejä
  if (treeni.distance.units !== 'km') {
    return false;
  }

  // Nimessä pitää mainita kävely
  const nimi = (treeni.name || '').toLowerCase();
  return nimi.includes('kävely') || nimi.includes('kavely') || nimi.includes('walk');
}

router.post('/', healthParser, async (req, res) => {
  try {
    // Luetaan tuontiavain otsakkeesta
    const avain = req.headers['x-api-key'];

    if (!avain) {
      return res.status(401).json({ error: 'Tuontiavain puuttuu' });
    }

    // Hashataan saapuva avain ja etsitään täsmäävä käyttäjä
    const hash = crypto.createHash('sha256').update(avain).digest('hex');
    const user = await User.findOne({ importKeyHash: hash });

    if (!user) {
      return res.status(401).json({ error: 'Virheellinen tuontiavain' });
    }

    // Treenit löytyvät data.workouts-taulukosta
    const treenit = req.body?.data?.workouts;

    if (!Array.isArray(treenit)) {
      return res.status(400).json({ error: 'Treenidataa ei löytynyt' });
    }

    let lisatty = 0;
    let ohitettu = 0;

    for (const treeni of treenit) {
      // Ohitetaan muut kuin kävelytreenit
      if (!onKavelytreeni(treeni)) {
        ohitettu += 1;
        continue;
      }

      const paiva = poimiPaiva(treeni.start);

      // Ilman kelvollista päivämäärää ei voi tallentaa
      if (!paiva) {
        ohitettu += 1;
        continue;
      }

      // Pyöristetään kahteen desimaaliin
      const kilometrit = Math.round(treeni.distance.qty * 100) / 100;

      // treenin alkuaika toimii yksilöivänä tunnisteena
      const externalId = treeni.start;

      try {
        // Luodaan merkintä vain jos samaa externalId ei vielä ole
        const tulos = await WalkEntry.updateOne(
          { userId: user._id, externalId },
          {
            $setOnInsert: {
              userId: user._id,
              date: paiva,
              km: kilometrit,
              source: 'apple',
              externalId
            }
          },
          { upsert: true }
        );

        // upsertedCount kertoo lisättiinkö uusi merkintä
        if (tulos.upsertedCount > 0) {
          lisatty += 1;
        } else {
          ohitettu += 1;
        }
      } catch (err) {
        // Uniikki-indeksin törmäys tarkoittaa että treeni oli jo tallennettu
        if (err.code === 11000) {
          ohitettu += 1;
        } else {
          throw err;
        }
      }
    }

    return res.status(200).json({
      success: true,
      lisatty,
      ohitettu
    });
  } catch (err) {
    console.error('Health-tuonti epäonnistui', err);
    return res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

module.exports = router;
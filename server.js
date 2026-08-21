require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const sanitize = require('./middleware/sanitize');
const authRoutes = require('./routes/auth');
const walkRoutes = require('./routes/walks');
const healthRoutes = require('./routes/healthRoutes');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');

const app = express();

// Render on käänteisproxy, luotetaan ensimmäiseen proxyyn jotta rate limiting toimii
app.set('trust proxy', 1);

// Turvaotsikot, räätälöity api-backendille joka ei tarjoile html:aa
// Tiukka csp koska mitään sisältöä ei ladata selaimeen tästä palvelimesta
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' }
}));

// Rajataan selaimen ominaisuuksia joita api ei tarvitse
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );
  next();
});

// Piilotetaan express-tunniste kokonaan
app.disable('x-powered-by');

// Haetaan osoitteet envistä ja pilkotaan taulukoksi
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(origin => origin.trim())
  : [];

// Sallitaan frontendin kutsut ja evästeiden lähetys
app.use(cors({
  origin: (origin, callback) => {
    // Sallitaan myös pyynnöt ilman originia (esim. Postman tai mobiilisovellukset)
    // sekä tarkistetaan löytyykö origin listalta
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin ei ole sallittu'));
    }
  },
  credentials: true, // sallii evästeet (JWT-token)
}));

// Pieni oletusraja kaikille reiteille paitsi health-tuonnille
// Health-reitti hoitaa oman parsintansa suuremmalla rajalla, joten
// ohitetaan se tässä jottei pieni raja hylkää isoa tuontirunkoa
app.use((req, res, next) => {
  if (req.path === '/api/health') {
    return next();
  }
  express.json({ limit: '100kb' })(req, res, next);
});

app.use(cookieParser());

// Nosql-injektiosuojaus
app.use(sanitize);

// Reitit
app.use('/api/auth', authRoutes);
app.use('/api/walks', walkRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

// Tuntemattomat reitit, siisti 404 ilman lisätietoja
app.use((req, res) => {
  res.status(404).json({ error: 'Reittiä ei löytynyt' });
});

// Keskitetty virhekäsittelijä, ei paljasta stack tracea käyttäjälle
// Virheen tiedot menevät vain palvelimen lokiin
app.use((err, req, res, next) => {
  console.error('Käsittelemätön virhe', err);
  res.status(500).json({ error: 'Palvelinvirhe' });
});

// Tietokantayhteys envistä
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Yhteys tietokantaan onnistui');
    app.listen(process.env.PORT, () => {
      console.log(`Palvelin käynnissä portissa ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.error('Tietokantayhteys epäonnistui', err);
  });
// P oistaa objekteista avaimet jotka alkavat $-merkillä tai sisältävät pisteen
// nämä ovat MongoDB-operaattoreita, joilla voi yrittää NoSQL-injektiota
function puhdistaObjekti(kohde) {
  if (kohde === null || typeof kohde !== 'object') {
    return;
  }

  // Taulukon jokainen alkio käydään läpi erikseen
  if (Array.isArray(kohde)) {
    for (const alkio of kohde) {
      puhdistaObjekti(alkio);
    }
    return;
  }

  for (const avain of Object.keys(kohde)) {
    // Vaarallinen avain poistetaan kokonaan
    if (avain.startsWith('$') || avain.includes('.')) {
      delete kohde[avain];
      continue;
    }

    // Sisäkkäiset objektit käydään läpi rekursiivisesti
    puhdistaObjekti(kohde[avain]);
  }
}

// Middleware joka puhdistaa pyynnön sisällön
function sanitize(req, res, next) {
  // Body ja params ovat muokattavia, joten ne voidaan puhdistaa suoraan
  if (req.body) {
    puhdistaObjekti(req.body);
  }

  if (req.params) {
    puhdistaObjekti(req.params);
  }

  // Query on Express 5:ssä vain luettava, joten sitä ei muokata
  // vaan tarkistetaan ja hylätään pyyntö jos siinä on vaarallisia avaimia
  if (req.query) {
    for (const avain of Object.keys(req.query)) {
      if (avain.startsWith('$') || avain.includes('.')) {
        return res.status(400).json({ error: 'Virheellinen pyyntö' });
      }
    }
  }

  next();
}

module.exports = sanitize;
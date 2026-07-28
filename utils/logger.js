const Log = require('../models/Log');

// Kirjaa tapahtuman lokiin, ei kaada pyyntöä jos tallennus epäonnistuu
async function kirjaaLoki(action, actorUsername, targetUsername = null, details = null) {
  try {
    await Log.create({
      action,
      actorUsername,
      targetUsername,
      details
    });
  } catch (err) {
    // Lokitus ei saa estää varsinaista toimintoa
    console.error('Lokin kirjaus epäonnistui', err);
  }
}

module.exports = { kirjaaLoki };
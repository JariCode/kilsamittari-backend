const mongoose = require('mongoose');

// Lokimerkintä admin-paneelia varten
const logSchema = new mongoose.Schema({
  // Mitä tehtiin: register, login, logout, role_change, delete_user
  action: {
    type: String,
    required: true,
    enum: ['register', 'login', 'logout', 'role_change', 'delete_user']
  },
  // Kuka teki toiminnon, tallennetaan nimi tekstinä
  actorUsername: {
    type: String,
    required: true
  },
  // Keneen toiminto kohdistui, nimi tekstinä ettei katoa poiston yhteydessä
  targetUsername: {
    type: String,
    default: null
  },
  // Vapaa lisätieto, esim roolin muutoksen suunta
  details: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Haut nopeutuvat aikajärjestyksessä
logSchema.index({ createdAt: -1 });

// Lokimerkinnät poistuvat automaattisesti 12 kuukauden kuluttua
// 31536000 sekuntia on 365 päivää
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

module.exports = mongoose.model('Log', logSchema);
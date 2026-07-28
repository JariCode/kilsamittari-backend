const mongoose = require('mongoose');

// Yksittäinen kävelymerkintä
const walkEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Päivämäärä muodossa VVVV-KK-PP
  date: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/
  },
  km: {
    type: Number,
    required: true,
    min: 0,
    max: 500
  },
  // Mistä merkintä tuli: kasin syotetty tai apple-kellosta
  source: {
    type: String,
    enum: ['manual', 'apple'],
    default: 'manual'
  },
  // Apple:n treenin yksilöivä tunniste, estää tuplatuonnin
  externalId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Haut nopeutuvat käyttäjän ja päivän perusteella
walkEntrySchema.index({ userId: 1, date: 1 });

// Sama Apple-treeni ei tallennu kahdesti samalle käyttäjälle
// Harva-indeksi jottei null-arvot tormaa keskenään
walkEntrySchema.index(
  { userId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } }
);

module.exports = mongoose.model('WalkEntry', walkEntrySchema);
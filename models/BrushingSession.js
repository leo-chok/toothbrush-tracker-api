// models/BrushingSession.js
const mongoose = require('mongoose');

const brushingSessionSchema = new mongoose.Schema(
  {
    // Référence à l'utilisateur qui a effectué le brossage
    user: {
      type: mongoose.Schema.ObjectId, // Stocke l'ID de l'objet User
      ref: 'User', // Lie ce champ au modèle 'User'
      required: true,
    },
    // Type de session (matin, midi, soir)
    sessionType: {
      type: String,
      required: true,
      enum: ['morning', 'noon', 'evening'], // Ne peut prendre que ces valeurs
    },
    // Date et heure exactes du brossage (sera défini par défaut à la création)
    // On pourrait aussi le recevoir du front-end si l'enregistrement est différé
    timestamp: {
        type: Date,
        default: Date.now
    }
    // Note: Les timestamps (createdAt, updatedAt) sont aussi ajoutés automatiquement
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('BrushingSession', brushingSessionSchema);
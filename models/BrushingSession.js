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
    
    timestamp: {
        type: Date,
        default: Date.now
    },
    duration: {
        type: Number,
        required: true,
    }
    // Note: Les timestamps (createdAt, updatedAt) sont aussi ajoutés automatiquement
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('BrushingSession', brushingSessionSchema);
// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Merci d\'entrer un nom'],
    },
    email: {
      type: String,
      required: [true, 'Merci d\'entrer un email'],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Merci d\'entrer un email valide',
      ],
    },
    password: {
      type: String,
      required: [true, 'Merci d\'entrer un mot de passe'],
      minlength: 6,
      select: false // Ne pas retourner le mdp par défaut lors des requêtes
    },
    currentScore: {
        type: Number,
        default: 0
    },
    currentStreak: {
        type: Number,
        default: 0
    },
    longestStreak: {
        type: Number,
        default: 0
    },
    lastBrushingTimestamp: {
        type: Date
    },
    lastCompletedStreakDay: { 
        type: Date
    }
  },
  {
    timestamps: true, // Ajoute createdAt et updatedAt
  }
);

// Hook Mongoose pour hasher le mot de passe AVANT sauvegarde
userSchema.pre('save', async function(next) {
  // Ne re-hasher que si le mot de passe a été modifié
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Méthode pour comparer le mot de passe entré avec le hash stocké
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Méthode pour générer un token JWT signé
userSchema.methods.getSignedJwtToken = function() {
  const payload = { id: this._id }; // Le contenu du token
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE // Utilise les variables d'environnement
  });
};

// Crée et exporte le modèle
module.exports = mongoose.model('User', userSchema);
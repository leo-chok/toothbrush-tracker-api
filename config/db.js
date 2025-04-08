// config/db.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Charger les variables d'env (au cas où ce fichier est utilisé seul)
dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Options pour éviter les avertissements de dépréciation (peuvent varier selon la version de Mongoose)
      // useNewUrlParser: true, // Peut ne plus être nécessaire
      // useUnifiedTopology: true, // Peut ne plus être nécessaire
      // useCreateIndex: true, // N'est plus supporté, utiliser l'index directement dans le schéma
    });

    console.log(`MongoDB Connecté: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Erreur de connexion MongoDB: ${error.message}`);
    // Quitte le processus avec échec si la connexion échoue
    process.exit(1);
  }
};

module.exports = connectDB;
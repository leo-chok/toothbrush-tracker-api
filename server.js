// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// --- > Importer les routes <---
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');


dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API Dents Propres Fonctionne !');
});

// --- > Monter les routes <---
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/sessions', sessionRoutes);

// On ajoutera un middleware de gestion d'erreur ici plus tard

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
// routes/auth.js
const express = require('express');
const { register, login } = require('../controllers/auth'); // Importe les fonctions du contrôleur

const router = express.Router();

// Définir les routes POST pour /register et /login
router.post('/register', register);
router.post('/login', login);

module.exports = router;
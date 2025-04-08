// routes/auth.js
const express = require('express');
const { register, login, getMe } = require('../controllers/auth'); // Importe les fonctions du contrôleur

const router = express.Router();

const { protect } = require('../middleware/auth');

// Définir les routes POST pour /register et /login
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
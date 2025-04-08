// routes/sessions.js
const express = require('express');
const { logSession, getSessionsForUser } = require('../controllers/sessions');
const { protect } = require('../middleware/auth');

const router = express.Router();

// --- > Note : On ajoutera le middleware d'authentification 'protect' ici plus tard < ---

// Route pour enregistrer une session
router.post('/', protect, logSession);

// Route pour obtenir les sessions d'un utilisateur spécifique (via son ID dans l'URL pour l'instant)
router.get('/', protect, getSessionsForUser);

module.exports = router;
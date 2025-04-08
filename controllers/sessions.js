// controllers/sessions.js
const BrushingSession = require('../models/BrushingSession');
const User = require('../models/User'); // On aura peut-être besoin du modèle User aussi
const { isSameDay, addDays, startOfDay, differenceInCalendarDays } = require('date-fns');


// @desc    Enregistrer une nouvelle session de brossage (score basé sur durée)
// @route   POST /api/v1/sessions
// @access  Private
exports.logSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const currentHour = now.getHours();

    // MODIFICATION : Récupérer la durée depuis le corps de la requête
    const { duration } = req.body;

    // --- Validation de la durée ---
    if (duration === undefined || typeof duration !== 'number' || duration < 0) {
        // On accepte 0 ici, mais le score sera 0.
        return res.status(400).json({ success: false, error: 'Durée invalide fournie.' });
    }
    // Optionnel: Limiter la durée maximale si besoin (ex: légèrement plus que 120s pour marge d'erreur)
    // if (duration > 130) { duration = 120; } // Plafonner par exemple

    console.log(`Requête logSession reçue - Durée: ${duration}s`);

    // --- Déterminer le type de session basé sur l'heure (INCHANGÉ) ---
    let sessionType;
    if (currentHour >= 5 && currentHour < 10) { sessionType = 'morning'; }
    else if (currentHour >= 10 && currentHour < 16) { sessionType = 'noon'; }
    else { sessionType = 'evening'; }
    console.log(`Heure: ${currentHour}, Session déterminée: ${sessionType}`);

    // Récupérer l'utilisateur (INCHANGÉ)
    const user = await User.findById(userId);
    if (!user) { /* ... erreur 404 ... */ }

    // --- 1. Mise à jour du Score (MODIFIÉ) ---
    let scoreToAdd = 0;
    // Règles : 0-59s = 5pts; 60-109s = 10pts; 110-120s = 20pts
    if (duration >= 110) { // Inclut 1min50s jusqu'à 2min (120s) et potentiellement un peu plus
        scoreToAdd = 20;
    } else if (duration >= 60) { // 1min (60s) jusqu'à 1min49 (109s)
        scoreToAdd = 10;
    } else if (duration > 0) { // Plus que 0s jusqu'à 59s
        scoreToAdd = 5;
    }
    // Si duration est 0 ou négatif (même si validé avant), scoreToAdd reste 0.

    console.log(`Score à ajouter: ${scoreToAdd}`);
    user.currentScore += scoreToAdd; // Ajouter le score calculé
    user.lastBrushingTimestamp = now; // Mettre à jour le timestamp (INCHANGÉ)

    // --- 2. Logique de Streak (INCHANGÉ) ---
    if (sessionType === 'evening') { /* ... logique existante ... */ }
    else if (sessionType === 'morning') { /* ... logique existante ... */ }

    // --- 3. Sauvegarde Utilisateur et Création Session (INCHANGÉ) ---
    await user.save();
    const session = await BrushingSession.create({
      user: userId,
      sessionType: sessionType,
      timestamp: now,
      duration: duration // Nécessiterait d'ajouter 'duration: Number' au BrushingSessionSchema
    });

    res.status(201).json({ success: true, data: session, scoreAdded: scoreToAdd }); // On peut renvoyer le score ajouté

  } catch (error) {
    console.error('Erreur logSession:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de l\'enregistrement de la session' });
  }
};

// @desc    Récupérer les sessions de brossage pour un utilisateur
// @route   GET /api/v1/sessions/user/:userId  (ou GET /api/v1/sessions/ si on prend l'ID du token)
// @access  Private (sera Private avec Auth Middleware)
exports.getSessionsForUser = async (req, res, next) => {
  try {
    
    const userId = req.user.id;

    // Trouver toutes les sessions pour cet utilisateur, triées par date décroissante
    const sessions = await BrushingSession.find({ user: userId }).sort({ timestamp: -1 });

    res.status(200).json({ success: true, count: sessions.length, data: sessions });

  } catch (error) {
    console.error('Erreur getSessionsForUser:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
    // next(error);
  }
};
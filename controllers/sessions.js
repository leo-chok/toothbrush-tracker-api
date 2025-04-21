// controllers/sessions.js
const BrushingSession = require('../models/BrushingSession');
const User = require('../models/User');
const { startOfDay } = require('date-fns'); // Moins de dépendances date-fns ici

// @desc    Enregistrer une nouvelle session de brossage
// @route   POST /api/v1/sessions
// @access  Private
exports.logSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const currentHour = now.getHours();
    const { duration } = req.body;

    // --- Validation de la durée ---
    if (duration === undefined || typeof duration !== 'number' || duration < 0) {
        return res.status(400).json({ success: false, error: 'Durée invalide fournie.' });
    }
    // Plafonner la durée si besoin (ex: 130s)
    const cappedDuration = Math.min(duration, 130);
    console.log(`[logSession] Req reçue - User: ${userId}, Durée: ${duration}s (utilisée: ${cappedDuration}s)`);

    // --- Déterminer le type de session ---
    let sessionType;
    if (currentHour >= 5 && currentHour < 10) { sessionType = 'morning'; }
    else if (currentHour >= 10 && currentHour < 16) { sessionType = 'noon'; } // Midi entre 10h et 16h (inclus)
    else { sessionType = 'evening'; } // Soir/Nuit après 16h et avant 5h
    console.log(`[logSession] Heure: ${currentHour}, Session déterminée: ${sessionType}`);

    // --- Récupérer l'utilisateur ---
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    }

    // --- Mise à jour du Score UNIQUEMENT ---
    let scoreToAdd = 0;
    if (cappedDuration >= 110) { scoreToAdd = 20; }
    else if (cappedDuration >= 60) { scoreToAdd = 10; }
    else if (cappedDuration >= 30) { scoreToAdd = 5; }
    console.log(`[logSession] Score à ajouter: ${scoreToAdd}`);
    user.currentScore = (user.currentScore || 0) + scoreToAdd;

    // --- Mise à jour du dernier brossage ---
    user.lastBrushingTimestamp = now;
    // !!! PAS DE CALCUL DE STREAK ICI !!!

    // --- Sauvegarde Utilisateur et Création Session ---
    await user.save(); // Sauvegarde score et lastBrushingTimestamp
    const session = await BrushingSession.create({
      user: userId,
      sessionType: sessionType,
      timestamp: now,
      duration: cappedDuration,
    });

    console.log("[logSession] Session créée:", session._id);
    // Renvoyer juste succès et le score ajouté. Le frontend devra rafraîchir les données user via /auth/me si besoin.
    res.status(201).json({
        success: true,
        scoreAdded: scoreToAdd
        // Optionnel: renvoyer la session créée: data: session
    });

  } catch (error) {
    console.error('[logSession] Erreur:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de l\'enregistrement de la session' });
  }
};

// @desc    Récupérer les sessions de brossage pour l'utilisateur connecté
// @route   GET /api/v1/sessions
// @access  Private
exports.getSessionsForUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Récupérer les sessions, triées pour l'affichage (les plus récentes d'abord)
    const sessions = await BrushingSession.find({ user: userId })
                                          .sort({ timestamp: -1 })
                                          .limit(25); // Ajouter une limite raisonnable ?

    res.status(200).json({ success: true, count: sessions.length, data: sessions });
  } catch (error) {
    console.error('[getSessionsForUser] Erreur:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de la récupération des sessions' });
  }
};
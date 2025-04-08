// controllers/sessions.js
const BrushingSession = require('../models/BrushingSession');
const User = require('../models/User'); // On aura peut-être besoin du modèle User aussi
const { isSameDay, addDays, startOfDay, differenceInCalendarDays } = require('date-fns');


// @desc    Enregistrer une nouvelle session de brossage
// @route   POST /api/v1/sessions
// @access  Private (sera Private avec Auth Middleware)
exports.logSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { sessionType } = req.body;
    const now = new Date();
    const today = startOfDay(now); // Début du jour actuel

    if (!['morning', 'noon', 'evening'].includes(sessionType)) {
      return res.status(400).json({ success: false, error: 'Type de session invalide' });
    }

    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    // --- 1. Mise à jour simple (Score + Dernier Timestamp) ---
    user.currentScore += 10; // Toujours +10 points
    user.lastBrushingTimestamp = now; // Met à jour le dernier brossage peu importe le type

    // --- 2. Logique de Streak (uniquement si c'est le soir) ---
    if (sessionType === 'evening') {
      // Vérifier si un brossage du matin existe AUJOURD'HUI
      const startOfToday = startOfDay(now);
      const startOfTomorrow = addDays(startOfToday, 1);

      const morningSessionToday = await BrushingSession.findOne({
        user: userId,
        sessionType: 'morning',
        timestamp: { $gte: startOfToday, $lt: startOfTomorrow } // Recherche entre aujourd'hui 00h et demain 00h
      });

      // Si le brossage du matin existe aussi aujourd'hui -> Journée Complète !
      if (morningSessionToday) {
        console.log(`Journée complète détectée pour ${today}`); // Log Debug
        const lastCompletedDay = user.lastCompletedStreakDay ? startOfDay(user.lastCompletedStreakDay) : null;
        let newStreak = user.currentStreak;

        if (!lastCompletedDay) {
          // Premier jour complet
          newStreak = 1;
          console.log("Premier jour complet, streak = 1"); // Log Debug
        } else {
          const daysDifference = differenceInCalendarDays(today, lastCompletedDay);
          console.log(`Dernier jour complet: ${lastCompletedDay}, Différence: ${daysDifference} jours`); // Log Debug

          if (daysDifference === 1) {
            // Jour complet suivant directement le dernier jour complet
            newStreak = user.currentStreak + 1;
             console.log(`Jour suivant complet, streak = ${newStreak}`); // Log Debug
          } else if (daysDifference > 1) {
            // Plus d'un jour d'écart, la série recommence
            newStreak = 1;
            console.log(`Écart détecté, streak réinitialisé à 1`); // Log Debug
          }
          // Si daysDifference === 0, ça ne devrait pas arriver si on met à jour lastCompletedStreakDay correctement
          // ou ça veut dire qu'on logge 'evening' plusieurs fois le même jour, la série ne change pas.
           else if (daysDifference === 0){
               console.log("Journée déjà complétée aujourd'hui, streak inchangé."); // Log Debug
               newStreak = user.currentStreak; // Garde la valeur actuelle
           }
        }

        // Mettre à jour les champs liés à la série
        user.currentStreak = newStreak;
        user.longestStreak = Math.max(user.longestStreak || 0, newStreak);
        user.lastCompletedStreakDay = today; // Mémorise la date de fin de ce jour complet
      } else {
          console.log(`Soir loggé, mais pas de matin trouvé pour ${today}`); // Log Debug
          // Optionnel : Réinitialiser la série si le soir est loggué mais pas le matin ?
          // Pour l'instant, on ne fait rien sur la série si la journée n'est pas complète.
      }
    }

    // --- 3. Sauvegarde Utilisateur et Création Session ---
    await user.save(); // Sauvegarde toutes les modifications (score, timestamps, potentiellement streak)

    const session = await BrushingSession.create({
      user: userId,
      sessionType: sessionType,
      timestamp: now
    });

    res.status(201).json({ success: true, data: session });

  } catch (error) {
    console.error('Erreur logSession:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de l\'enregistrement de la session' });
    // next(error);
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
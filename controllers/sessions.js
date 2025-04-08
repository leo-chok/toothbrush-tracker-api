// controllers/sessions.js
const BrushingSession = require('../models/BrushingSession');
const User = require('../models/User'); // On aura peut-être besoin du modèle User aussi
const { isSameDay, addDays, startOfDay, differenceInCalendarDays } = require('date-fns');


// @desc    Enregistrer une nouvelle session de brossage (type auto-déterminé)
// @route   POST /api/v1/sessions
// @access  Private
exports.logSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date(); // Heure actuelle du serveur
    const currentHour = now.getHours(); // Obtenir l'heure (0-23)

    // --- Déterminer le type de session basé sur l'heure ---
    let sessionType;
    // Exemple : 5h00 inclus à 10h30 exclu -> matin
    if (currentHour >= 5 && currentHour < 10) { // Ajustez 10:30 par < 10 ou < 11 selon votre préférence
      sessionType = 'morning';
    }
    // Exemple : 10h30 inclus à 16h30 exclu -> midi
    else if (currentHour >= 10 && currentHour < 16) { // Ajustez selon préférence pour 10:30 / 16:30
      sessionType = 'noon';
    }
    // Exemple : 16h30 inclus à 5h00 exclu (du lendemain) -> soir
    else {
      sessionType = 'evening';
    }
    console.log(`Heure: ${currentHour}, Session déterminée: ${sessionType}`); // Log pour débogage

    // On n'a plus besoin de valider req.body.sessionType

    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    // --- 1. Mise à jour simple (Score + Dernier Timestamp) ---
    user.currentScore += 10;
    user.lastBrushingTimestamp = now;

    // --- 2. Logique de Streak (basée sur le sessionType déterminé) ---
    if (sessionType === 'evening') {
      const startOfToday = startOfDay(now);
      const startOfTomorrow = addDays(startOfToday, 1);

      const morningSessionToday = await BrushingSession.findOne({
        user: userId,
        sessionType: 'morning', // Recherche toujours une session 'morning'
        timestamp: { $gte: startOfToday, $lt: startOfTomorrow }
      });

      if (morningSessionToday) {
        console.log(`Journée complète détectée pour ${startOfToday}`);
        const lastCompletedDay = user.lastCompletedStreakDay ? startOfDay(user.lastCompletedStreakDay) : null;
        let newStreak = user.currentStreak;

        if (!lastCompletedDay) {
          newStreak = 1;
           console.log("Premier jour complet, streak = 1");
        } else {
          const daysDifference = differenceInCalendarDays(startOfToday, lastCompletedDay);
           console.log(`Dernier jour complet: ${lastCompletedDay}, Différence: ${daysDifference} jours`);

          if (daysDifference === 1) {
            newStreak = user.currentStreak + 1;
             console.log(`Jour suivant complet, streak = ${newStreak}`);
          } else if (daysDifference > 1) {
            newStreak = 1;
            console.log(`Écart détecté, streak réinitialisé à 1`);
          } else if (daysDifference === 0){
             console.log("Journée déjà complétée aujourd'hui, streak inchangé.");
             newStreak = user.currentStreak;
          }
        }
        user.currentStreak = newStreak;
        user.longestStreak = Math.max(user.longestStreak || 0, newStreak);
        user.lastCompletedStreakDay = startOfToday;
      } else {
         console.log(`Soir loggé, mais pas de matin trouvé pour ${startOfToday}`);
      }
    } else if (sessionType === 'morning') {
         // Optionnel : Gérer le cas où la dernière série complétée date de plus d'un jour
         // et que l'utilisateur fait un brossage 'morning'. Faut-il reset la série ici ?
         // Pour l'instant, la série n'est affectée que lors du brossage 'evening' réussi.
         // On pourrait ajouter une logique ici si on veut être plus strict sur la rupture de série.
          const lastCompletedDay = user.lastCompletedStreakDay ? startOfDay(user.lastCompletedStreakDay) : null;
          if (lastCompletedDay) {
              const today = startOfDay(now);
              const daysDifference = differenceInCalendarDays(today, lastCompletedDay);
              if (daysDifference > 1) {
                  // Si le dernier jour complet date d'avant-hier ou plus, et qu'on fait un 'morning' aujourd'hui
                  // cela signifie qu'hier a été manqué. On pourrait réinitialiser ici.
                  if (user.currentStreak > 0) {
                       console.log(`Brossage matin détecté après un écart (${daysDifference}j), streak réinitialisé à 0 (ou 1 si on compte ce matin comme début?). Pour l'instant on reset à 0.`);
                       user.currentStreak = 0; // Reset
                  }
              }
          }
    }

    // --- 3. Sauvegarde Utilisateur et Création Session ---
    await user.save();

    // Utiliser le sessionType déterminé par le backend
    const session = await BrushingSession.create({
      user: userId,
      sessionType: sessionType,
      timestamp: now
    });

    // Renvoie la session créée, y compris le type déterminé
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
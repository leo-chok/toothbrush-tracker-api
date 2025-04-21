// controllers/auth.js
const User = require('../models/User');
const BrushingSession = require('../models/BrushingSession'); // <-- AJOUTÉ : Besoin des sessions ici
const { startOfDay, endOfDay, subDays, isSameDay, differenceInCalendarDays } = require('date-fns'); // <-- AJOUTÉ : plus de fonctions date-fns
const jwt = require('jsonwebtoken'); // Assurez-vous que jwt est importé (il l'était dans votre modèle mais pas ici)

// @desc    Inscription (Register) d'un nouvel utilisateur
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const user = await User.create({ name, email, password });
    // Initialiser lastCompletedStreakDay à null ou une date passée si nécessaire ?
    // Le schéma User le met par défaut à undefined, ce qui est géré dans getMe.
    sendTokenResponse(user, 201, res);
  } catch (error) {
    console.error('Erreur Register:', error);
    if (error.code === 11000) {
        return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé.' });
    }
    // Renvoyer l'erreur de validation Mongoose si elle existe
    if (error.name === 'ValidationError') {
         const message = Object.values(error.errors).map(val => val.message).join(', ');
         return res.status(400).json({ success: false, error: message });
    }
    res.status(500).json({ success: false, error: error.message || 'Erreur serveur' });
  }
};

// @desc    Connexion (Login) d'un utilisateur
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Merci de fournir email et mot de passe' });
      }
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({ success: false, error: 'Identifiants invalides' });
      }
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Identifiants invalides' });
      }
      sendTokenResponse(user, 200, res);
    } catch (error) {
        console.error('Erreur Login:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
};


// Fonction helper sendTokenResponse (inchangée mais s'assurer que user.getSigned... est dispo)
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken(); // Méthode définie dans le modèle User.js
  res.status(statusCode).json({ success: true, token });
};

// --- AJOUT : Helper pour vérifier si un jour est complet (Matin ET Soir) ---
const isDayComplete = async (userId, date) => {
    const start = startOfDay(date);
    const end = endOfDay(date);
    // console.log(`[isDayComplete] Checking for userId: ${userId}, Date: ${date.toISOString().split('T')[0]}`);
    try {
        // Utiliser Promise.all pour lancer les recherches en parallèle
        const [morningSession, eveningSession] = await Promise.all([
            BrushingSession.findOne({
                user: userId,
                sessionType: 'morning',
                timestamp: { $gte: start, $lte: end }
            }).lean(), // Utiliser lean pour un objet JS simple plus rapide si on ne modifie pas
            BrushingSession.findOne({
                user: userId,
                sessionType: 'evening',
                timestamp: { $gte: start, $lte: end }
            }).lean()
        ]);

        const complete = !!morningSession && !!eveningSession; // True si les deux existent
        // console.log(`[isDayComplete] Day ${date.toISOString().split('T')[0]} Complete = ${complete}`);
        return complete;

    } catch (error) {
        console.error(`[isDayComplete] Error checking completion for date ${date.toISOString()}:`, error);
        return false; // En cas d'erreur BDD, considérer comme non complet
    }
};
// --- FIN AJOUT Helper ---


// @desc    Récupérer l'utilisateur connecté ET CALCULER/METTRE À JOUR SA SÉRIE
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  console.log(`[getMe] Request received for user ID: ${req.user.id}`);
  try {
    // On récupère l'utilisateur complet pour pouvoir le sauvegarder si besoin
    const user = await User.findById(req.user.id);

    if (!user) {
       console.log(`[getMe] User not found for ID: ${req.user.id}`);
       return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    // --- DEBUT Calcul/Mise à jour de la Série ---
    console.log(`[getMe] Calculating streak for User=${user.email}. Current values: Streak=${user.currentStreak}, Longest=${user.longestStreak}, LastCompleted=${user.lastCompletedStreakDay ? user.lastCompletedStreakDay.toISOString() : 'null'}`);

    let calculatedStreak = 0;
    let daysChecked = 0;
    let lastCheckedDayWasComplete = true;
    let mostRecentCompletedDayFound = null; // Commence à null, on va le déterminer
    const today = startOfDay(new Date());
    let dayToCheck = startOfDay(new Date()); // On commence par aujourd'hui

    // 1. Vérifier si aujourd'hui est complet
    const isTodayCompleteNow = await isDayComplete(user.id, today);
    if (isTodayCompleteNow) {
        calculatedStreak = 1; // Au moins 1 jour si aujourd'hui est complet
        mostRecentCompletedDayFound = today;
        console.log(`[getMe] Today (${today.toISOString().split('T')[0]}) is complete.`);
        dayToCheck = subDays(today, 1); // Commencer la boucle à hier
    } else {
        console.log(`[getMe] Today (${today.toISOString().split('T')[0]}) is NOT complete.`);
        dayToCheck = subDays(today, 1); // Commencer la boucle à hier
         // Si aujourd'hui n'est pas complet, le dernier jour *potentiellement* complet
         // est celui stocké en BDD (qui pourrait être hier ou plus vieux)
         mostRecentCompletedDayFound = user.lastCompletedStreakDay ? startOfDay(user.lastCompletedStreakDay) : null;
    }


    // 2. Boucler en arrière à partir d'hier tant que les jours sont complets
    while (lastCheckedDayWasComplete) {
        const wasDayComplete = await isDayComplete(user.id, dayToCheck);
        // console.log(`[getMe] Checking day ${dayToCheck.toISOString().split('T')[0]}: Complete = ${wasDayComplete}`);

        if (wasDayComplete) {
            // Si on a commencé avec today complet, on ajoute les jours précédents
            // Si on a commencé sans today complet, le premier jour complet trouvé (hier ou avant) compte pour 1.
             if(isTodayCompleteNow) {
                calculatedStreak++;
             } else {
                 // Si today n'était pas complet, le *premier* jour complet trouvé dans la boucle
                 // compte comme 1, les suivants incrémentent.
                 if (calculatedStreak === 0) {
                    calculatedStreak = 1; // C'est le premier jour complet trouvé
                 } else {
                    calculatedStreak++;
                 }
             }

            // Mettre à jour le dernier jour complet trouvé *pendant la boucle*
             mostRecentCompletedDayFound = dayToCheck;

            dayToCheck = subDays(dayToCheck, 1); // Passer au jour précédent
            daysChecked++;

            // Limite de sécurité
            if (daysChecked > (user.longestStreak || 0) + 10) { // Vérifier 10 jours de plus que le record max
                console.warn(`[getMe] Streak check loop exceeded limit for user ${user.email}. Breaking.`);
                lastCheckedDayWasComplete = false;
            }

        } else {
            lastCheckedDayWasComplete = false; // Arrêter la boucle
        }
    }

    console.log(`[getMe] Final Calculated Streak = ${calculatedStreak}`);
    if(mostRecentCompletedDayFound) console.log(`[getMe] Most Recent Completed Day Found = ${mostRecentCompletedDayFound.toISOString().split('T')[0]}`);
    else console.log(`[getMe] No completed day found recently.`);

    // --- Mettre à jour l'utilisateur si nécessaire ---
    let userNeedsSave = false;
    if (user.currentStreak !== calculatedStreak) {
        console.log(`[getMe] Updating currentStreak from ${user.currentStreak} to ${calculatedStreak}`);
        user.currentStreak = calculatedStreak;
        userNeedsSave = true;
    }

    // Gérer la mise à jour de lastCompletedStreakDay
    const currentDbLastCompleted = user.lastCompletedStreakDay ? startOfDay(user.lastCompletedStreakDay) : null;
    const newlyFoundLastCompleted = mostRecentCompletedDayFound ? startOfDay(mostRecentCompletedDayFound) : null;

    if ( (currentDbLastCompleted === null && newlyFoundLastCompleted !== null) ||
         (currentDbLastCompleted !== null && newlyFoundLastCompleted === null) ||
         (currentDbLastCompleted && newlyFoundLastCompleted && !isSameDay(currentDbLastCompleted, newlyFoundLastCompleted)) )
    {
        console.log(`[getMe] Updating lastCompletedStreakDay from ${currentDbLastCompleted ? currentDbLastCompleted.toISOString() : 'null'} to ${newlyFoundLastCompleted ? newlyFoundLastCompleted.toISOString() : 'null'}`);
        user.lastCompletedStreakDay = newlyFoundLastCompleted; // Peut redevenir null
        userNeedsSave = true;
    } else {
       // console.log(`[getMe] lastCompletedStreakDay remains ${currentDbLastCompleted ? currentDbLastCompleted.toISOString() : 'null'}`);
    }


    // Mettre à jour le record
    // Note: currentStreak a déjà été mis à jour avec calculatedStreak
    if (!user.longestStreak || user.currentStreak > user.longestStreak) {
        console.log(`[getMe] Updating longestStreak from ${user.longestStreak} to ${user.currentStreak}`);
        user.longestStreak = user.currentStreak;
        userNeedsSave = true;
    }

    // Sauvegarder si des changements ont été faits
    if (userNeedsSave) {
        console.log(`[getMe] Saving user ${user.email} due to updated streak info...`);
        try {
            await user.save();
            console.log(`[getMe] User ${user.email} saved successfully.`);
        } catch (saveError) {
            console.error(`[getMe] Failed to save user after streak calculation for ${user.email}:`, saveError);
             return res.status(500).json({ success: false, error: 'Erreur serveur lors de la mise à jour des données utilisateur' });
        }
    } else {
        console.log(`[getMe] No streak related changes needed saving for user ${user.email}.`);
    }
    // --- FIN Calcul/Mise à jour Série ---

    // Renvoyer l'utilisateur SANS le mot de passe
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      data: userResponse
    });

  } catch (error) {
     console.error("[getMe] Erreur globale:", error);
     res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};
// controllers/sessions.js
const BrushingSession = require('../models/BrushingSession');
const User = require('../models/User');
const { startOfDay, endOfDay, subDays, isSameDay } = require('date-fns'); // Fonctions date-fns nécessaires

// --- Helper Interne pour vérifier si un jour est complet (Matin ET Soir) ---
// Note: Cette fonction fait des appels BDD.
const isDayComplete = async (userId, date) => {
    const start = startOfDay(date);
    const end = endOfDay(date);
    // console.log(`[isDayComplete] Checking userId: ${userId}, Date: ${date.toISOString().split('T')[0]}`);
    try {
        const [morningSession, eveningSession] = await Promise.all([
            BrushingSession.findOne({ user: userId, sessionType: 'morning', timestamp: { $gte: start, $lte: end } }).lean(),
            BrushingSession.findOne({ user: userId, sessionType: 'evening', timestamp: { $gte: start, $lte: end } }).lean()
        ]);
        const complete = !!morningSession && !!eveningSession;
        // console.log(`[isDayComplete] Result for ${date.toISOString().split('T')[0]}: ${complete}`);
        return complete;
    } catch (error) {
        console.error(`[isDayComplete] Error checking completion for date ${date.toISOString()}:`, error);
        return false;
    }
};
// --- Fin Helper ---


// @desc    Enregistrer une nouvelle session de brossage ET METTRE À JOUR LA SÉRIE SI NÉCESSAIRE
// @route   POST /api/v1/sessions
// @access  Private
exports.logSession = async (req, res, next) => {
  console.log(`[logSession] Received request for user: ${req.user.id}`);
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = startOfDay(now); // Début du jour actuel
    const yesterday = subDays(today, 1); // Début du jour précédent
    const currentHour = now.getHours();
    const { duration } = req.body;

    // 1. Validation de la durée
    if (duration === undefined || typeof duration !== 'number' || duration < 0) {
        return res.status(400).json({ success: false, error: 'Durée invalide fournie.' });
    }
    const cappedDuration = Math.min(duration, 130); // Plafonner si besoin
    console.log(`[logSession] Duration: ${duration}s (capped: ${cappedDuration}s)`);

    // 2. Déterminer le type de session
    let sessionType;
    if (currentHour >= 5 && currentHour < 10) { sessionType = 'morning'; }
    else if (currentHour >= 10 && currentHour < 16) { sessionType = 'noon'; }
    else { sessionType = 'evening'; }
    console.log(`[logSession] SessionType determined: ${sessionType}`);

    // 3. Récupérer l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    }

    // 4. Mise à jour du Score
    let scoreToAdd = 0;
    if (cappedDuration >= 110) { scoreToAdd = 10; }
    else if (cappedDuration >= 60) { scoreToAdd = 5; }
    else if (cappedDuration >= 30) { scoreToAdd = 1; }
    console.log(`[logSession] ScoreToAdd: ${scoreToAdd}`);
    user.currentScore = (user.currentScore || 0) + scoreToAdd;
    user.lastBrushingTimestamp = now; // Toujours mettre à jour le dernier brossage

    // 5. Mise à jour de la Série (UNIQUEMENT si c'est une session du SOIR)
    let userNeedsSave = true; // On sauvegarde au moins score + timestamp
    let streakUpdated = false; // Drapeau pour savoir si la série a changé

    if (sessionType === 'evening') {
        console.log("[logSession] Evening session detected. Checking day completion...");
        // Vérifier si le jour J (aujourd'hui) est maintenant complet (Matin+Soir)
        // On utilise 'isDayComplete' mais on sait déjà que 'evening' existe (celle-ci).
        // Il suffit donc de vérifier si 'morning' existe AUJOURD'HUI.
        const morningToday = await BrushingSession.findOne({
            user: userId,
            sessionType: 'morning',
            timestamp: { $gte: today, $lte: endOfDay(today) } // endOfDay importé de date-fns
        }).lean();

        if (morningToday) {
            console.log("[logSession] Today is now complete (Morning + Evening).");
            const lastCompleted = user.lastCompletedStreakDay ? startOfDay(user.lastCompletedStreakDay) : null;
            console.log(`[logSession] Last completed day in DB: ${lastCompleted ? lastCompleted.toISOString().split('T')[0] : 'None'}`);
            console.log(`[logSession] Yesterday was: ${yesterday.toISOString().split('T')[0]}`);

            if (lastCompleted && isSameDay(lastCompleted, yesterday)) {
                // La série continue : le dernier jour complété était hier
                const oldStreak = user.currentStreak || 0;
                user.currentStreak = oldStreak + 1;
                user.lastCompletedStreakDay = today; // Mettre à jour au jour J
                streakUpdated = true;
                console.log(`[logSession] Streak continues! Incremented from ${oldStreak} to ${user.currentStreak}. LastCompletedDay updated to Today.`);
            } else {
                // La série recommence : J-1 n'était pas complété (ou premier jour complet)
                if (user.currentStreak !== 1 || !user.lastCompletedStreakDay || !isSameDay(user.lastCompletedStreakDay, today) ) {
                     // Mettre à 1 seulement si ce n'était pas déjà 1 aujourd'hui
                     console.log(`[logSession] Starting new streak (or day was already complete today). Setting streak to 1. LastCompletedDay updated to Today.`);
                     user.currentStreak = 1;
                     user.lastCompletedStreakDay = today;
                     streakUpdated = true; // Marquer qu'on a mis à jour
                } else {
                     console.log(`[logSession] Day completed today, but streak remains 1 as lastCompleted was already today.`);
                }
            }

            // Mettre à jour le record si la série actuelle (qui vient d'être màj) est plus longue
             if (!user.longestStreak || user.currentStreak > user.longestStreak) {
                console.log(`[logSession] New longest streak: ${user.currentStreak}`);
                user.longestStreak = user.currentStreak;
                // userNeedsSave est déjà true si streakUpdated est true
            }

        } else {
             console.log("[logSession] Today is NOT complete (missing morning session). Streak not updated.");
             // Si aujourd'hui n'est pas complet (M+S), on ne touche pas à lastCompletedStreakDay ni à currentStreak.
             // La logique de reset si l'écart est > 1 jour peut être laissée à getMe (optionnel).
        }

    } else {
        console.log(`[logSession] Session type is ${sessionType}. No streak logic applied.`);
        // Si ce n'est pas 'evening', on ne fait rien sur la logique de complétion de jour/série ici.
    }

    // 6. Sauvegarde Utilisateur (si nécessaire ou toujours)
    // On sauvegarde toujours car au moins lastBrushingTimestamp et score ont changé.
    console.log("[logSession] Saving user data...");
    await user.save();
    console.log("[logSession] User data saved.");

    // 7. Création de l'enregistrement de Session
    const session = await BrushingSession.create({
      user: userId,
      sessionType: sessionType,
      timestamp: now,
      duration: cappedDuration,
    });
    console.log("[logSession] BrushingSession document created:", session._id);

    // 8. Réponse
    // Renvoyer les données utilisateur mises à jour est utile pour le frontend
    res.status(201).json({
        success: true,
        data: { // Renvoyer l'objet user (sans le mot de passe implicitement grâce au select:false)
            _id: user._id,
            name: user.name,
            email: user.email,
            currentScore: user.currentScore,
            currentStreak: user.currentStreak, // La valeur mise à jour (ou non)
            longestStreak: user.longestStreak,
            lastCompletedStreakDay: user.lastCompletedStreakDay, // La valeur mise à jour (ou non)
            lastBrushingTimestamp: user.lastBrushingTimestamp // Peut être utile aussi
        },
        scoreAdded: scoreToAdd
    });

  } catch (error) {
    console.error('[logSession] CRITICAL ERROR:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de l\'enregistrement de la session' });
  }
};

// @desc    Récupérer les sessions de brossage pour l'utilisateur connecté
// @route   GET /api/v1/sessions
// @access  Private

exports.getSessionsForUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const sessions = await BrushingSession.find({ user: userId })
                                          .sort({ timestamp: -1 })
                                          .limit(25); // Limiter le nombre de sessions retournées
    res.status(200).json({ success: true, count: sessions.length, data: sessions });
  } catch (error) {
    console.error('[getSessionsForUser] Erreur:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de la récupération des sessions' });
  }
};
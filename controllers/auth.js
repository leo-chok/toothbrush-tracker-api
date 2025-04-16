// controllers/auth.js
const User = require('../models/User'); // Importe le modèle User
const { startOfDay, differenceInCalendarDays } = require('date-fns');

// @desc    Inscription (Register) d'un nouvel utilisateur
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Créer l'utilisateur (le hashage se fait via le hook pre save)
    const user = await User.create({
      name,
      email,
      password
    });

    // Créer et envoyer le token
    sendTokenResponse(user, 201, res); // 201 = Created

  } catch (error) {
    console.error('Erreur Register:', error);
    // Gestion basique d'erreur (ex: email déjà utilisé -> code 11000)
    if (error.code === 11000) {
        return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé.' });
    }
    res.status(500).json({ success: false, error: error.message || 'Erreur serveur' });
    // Plus tard on utilisera un middleware d'erreur plus propre
    // next(error);
  }
};

// @desc    Connexion (Login) d'un utilisateur
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Valider email & password présents
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Merci de fournir email et mot de passe' });
      }

      // Chercher l'utilisateur par email, en incluant le mot de passe (car select: false par défaut)
      const user = await User.findOne({ email }).select('+password');

      // Vérifier si l'utilisateur existe
      if (!user) {
        return res.status(401).json({ success: false, error: 'Identifiants invalides' }); // 401 = Unauthorized
      }

      // Vérifier si le mot de passe correspond (utilise la méthode ajoutée au schéma)
      const isMatch = await user.matchPassword(password);

      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Identifiants invalides' });
      }

      // Créer et envoyer le token
      sendTokenResponse(user, 200, res); // 200 = OK

    } catch (error) {
        console.error('Erreur Login:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
        // next(error);
    }
};


// Fonction helper pour générer le token et l'envoyer dans la réponse
const sendTokenResponse = (user, statusCode, res) => {
  // Créer le token JWT
  const token = user.getSignedJwtToken();

  // Options pour le cookie (si on voulait stocker le token en cookie HttpOnly)
  // const options = {
  //   expires: new Date(Date.now() + process.env.JWT_EXPIRE_COOKIE * 24 * 60 * 60 * 1000),
  //   httpOnly: true
  // };
  // if (process.env.NODE_ENV === 'production') {
  //   options.secure = true;
  // }

  // Pour une app mobile React Native, on envoie juste le token dans le JSON
  res
    .status(statusCode)
    // .cookie('token', token, options) // Optionnel: si cookie
    .json({
      success: true,
      token
      // On pourrait aussi renvoyer des infos utilisateur ici (sans le mdp)
      // data: { name: user.name, email: user.email }
    });
};

// @desc    Récupérer l'utilisateur actuellement connecté
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    // req.user est défini par le middleware 'protect'
    // On récupère l'utilisateur SANS son mot de passe (même si select: false dans le modèle, c'est plus sûr)
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      // Normalement impossible si le token est valide, mais sécurité
       return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    // Vérifier seulement si l'utilisateur a une série en cours (>0)
    // et si une date de dernière série complétée existe.
    if (user.currentStreak > 0 && user.lastCompletedStreakDay) {
      const today = startOfDay(new Date()); // Début du jour actuel (heure serveur)
      const lastDay = startOfDay(user.lastCompletedStreakDay); // Début du dernier jour complété

      const daysDifference = differenceInCalendarDays(today, lastDay);

      // Log pour débogage (peut être retiré en production)
      console.log(`[getMe] Check Streak Reset: User=${user.email}, Today=${today.toISOString()}, LastCompleted=${lastDay.toISOString()}, Diff=${daysDifference} days, CurrentStreak=${user.currentStreak}`);

      // Si plus d'un jour s'est écoulé entre aujourd'hui et le dernier jour complété...
      if (daysDifference > 1) {
        console.log(`[getMe] Streak reset detected for User=${user.email}! Diff=${daysDifference} days. Setting currentStreak to 0.`);
        user.currentStreak = 0; // Remettre la série à zéro

        // Sauvegarder la modification dans la base de données
        try {
          await user.save(); // Sauvegarde l'utilisateur avec currentStreak = 0
          console.log(`[getMe] User ${user.email} saved with streak reset.`);
        } catch (saveError) {
          // Si la sauvegarde échoue, on loggue l'erreur mais on continue
          // pour quand même renvoyer les données (avec le streak à 0 en mémoire).
          // Le prochain appel à /auth/me ou /sessions retentera probablement.
          console.error(`[getMe] Failed to save user after streak reset for ${user.email}:`, saveError);
          // On pourrait choisir de renvoyer une erreur ici si la sauvegarde est critique:
          // return next(new ErrorResponse('Erreur sauvegarde après reset série', 500));
        }
      }
    }

    res.status(200).json({
      success: true,
      data: user // Renvoie toutes les infos de l'utilisateur (name, email, score, streaks, etc.)
    });

  } catch (error) {
     console.error("Erreur getMe:", error);
     res.status(500).json({ success: false, error: 'Erreur serveur' });
     // next(error);
  }
};
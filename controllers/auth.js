// controllers/auth.js
const User = require("../models/User");
const BrushingSession = require("../models/BrushingSession"); // <-- AJOUTÉ : Besoin des sessions ici
const {
  startOfDay,
  differenceInCalendarDays,
} = require("date-fns");
const jwt = require("jsonwebtoken"); // Assurez-vous que jwt est importé (il l'était dans votre modèle mais pas ici)

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
    console.error("Erreur Register:", error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ success: false, error: "Cet email est déjà utilisé." });
    }
    // Renvoyer l'erreur de validation Mongoose si elle existe
    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)
        .map((val) => val.message)
        .join(", ");
      return res.status(400).json({ success: false, error: message });
    }
    res
      .status(500)
      .json({ success: false, error: error.message || "Erreur serveur" });
  }
};

// @desc    Connexion (Login) d'un utilisateur
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Merci de fournir email et mot de passe",
        });
    }
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Identifiants invalides" });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, error: "Identifiants invalides" });
    }
    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error("Erreur Login:", error);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// Fonction helper sendTokenResponse (inchangée mais s'assurer que user.getSigned... est dispo)
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken(); // Méthode définie dans le modèle User.js
  res.status(statusCode).json({ success: true, token });
};

// @desc    Récupérer l'utilisateur connecté
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id); // Pas besoin de select('-password') si on utilise toObject()
    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: "Utilisateur non trouvé" });
    }

    // --- Optionnel : Logique de RESET de sécurité dans getMe ---
    // Si l'utilisateur n'a pas complété de jour depuis plus d'une journée,
    // on remet sa série à 0 pour éviter qu'elle reste bloquée sur une ancienne valeur.
    if (user.lastCompletedStreakDay) {
      // Vérifier seulement si une date existe
      const today = startOfDay(new Date());
      const lastDay = startOfDay(user.lastCompletedStreakDay);
      const daysDifference = differenceInCalendarDays(today, lastDay);

      if (daysDifference > 1 && user.currentStreak > 0) {
        // Si écart > 1 et série n'est pas déjà 0
        console.log(
          `[getMe] Failsafe Reset: Last completed day (${lastDay.toISOString()}) is more than 1 day ago. Resetting streak from ${
            user.currentStreak
          } to 0.`
        );
        user.currentStreak = 0;
        // Optionnel: Mettre aussi lastCompletedStreakDay à null ? Ou le laisser pour info ? Laissons-le.
        try {
          await user.save();
          console.log(`[getMe] Failsafe reset saved for user ${user.email}.`);
        } catch (saveError) {
          console.error(
            `[getMe] Failed to save user after failsafe streak reset for ${user.email}:`,
            saveError
          );
          // Ne pas bloquer la réponse pour ça
        }
      }
    }
    // --- Fin Logique de Reset Optionnelle ---

    // Préparer la réponse sans le mot de passe
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      data: userResponse, // Renvoyer les données à jour (avec streak potentiellement reset)
    });
  } catch (error) {
    console.error("[getMe] Erreur:", error);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

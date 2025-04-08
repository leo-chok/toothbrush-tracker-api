// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // On a besoin du modèle pour trouver l'utilisateur

// Middleware pour protéger les routes
exports.protect = async (req, res, next) => {
  let token;

  // Vérifier si le header Authorization existe et commence par Bearer
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Extrait le token (enlève 'Bearer ')
    token = req.headers.authorization.split(' ')[1];
  }
  

  // S'assurer que le token existe
  if (!token) {
    // 401 = Non autorisé
    return res.status(401).json({ success: false, error: 'Accès non autorisé (pas de token)' });
  }

  try {
    // Vérifier le token avec le secret JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Trouver l'utilisateur correspondant à l'ID dans le token
    // On utilise select('-password') si on ne veut VRAIMENT pas le mdp, même s'il est select: false dans le schéma
    req.user = await User.findById(decoded.id); //.select('-password');

    if (!req.user) {
        // Si l'utilisateur associé au token n'existe plus
        return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    // L'utilisateur est authentifié, on passe au prochain middleware/contrôleur
    next();
  } catch (err) {
    console.error("Erreur de vérification du token:", err);
    return res.status(401).json({ success: false, error: 'Accès non autorisé (token invalide)' });
  }
};
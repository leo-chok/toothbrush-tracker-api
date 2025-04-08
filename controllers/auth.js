// controllers/auth.js
const User = require('../models/User'); // Importe le modèle User

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

// On pourrait ajouter Logout, Forgot Password, etc. plus tard
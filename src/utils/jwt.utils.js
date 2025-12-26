const jwt = require('jsonwebtoken');

/**
 * Generate Access Token
 * payload: { userId }
 */
exports.generateAccessToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '1d' } // simple & fine for now
  );
};

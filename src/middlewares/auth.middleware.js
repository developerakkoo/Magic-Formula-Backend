const jwt = require('jsonwebtoken');
const User = require('../modules/user/user.model');

const authenticateUser = async (req, res, next, { allowPending = false } = {}) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);


    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'User account is blocked' });
    }

    const registrationStatus = String(user.registrationStatus || '').toUpperCase()
    const isRegistrationPending = registrationStatus === 'PENDING'
    const isRegistrationRejected = registrationStatus === 'REJECTED'

    if (!allowPending && isRegistrationPending) {
      return res.status(403).json({
        message: 'Your registration is pending admin approval',
        registrationStatus: 'PENDING'
      })
    }

    if (!allowPending && isRegistrationRejected) {
      return res.status(403).json({
        message: 'Your registration was rejected. Please register again.',
        registrationStatus: 'REJECTED'
      })
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports.authMiddleware = async (req, res, next) => {
  return authenticateUser(req, res, next)
}

module.exports.authMiddlewareAllowPending = async (req, res, next) => {
  return authenticateUser(req, res, next, { allowPending: true })
}

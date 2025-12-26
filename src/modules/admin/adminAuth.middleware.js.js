const jwt = require('jsonwebtoken');
const Admin = require('../admin/admin.model');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Admin authorization required' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    const admin = await Admin.findById(decoded.adminId).select('-password');
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    req.admin = admin; // attach admin to request
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

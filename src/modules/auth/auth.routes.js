const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middlewares/auth.middleware');

const authController = require('./auth.controller');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;

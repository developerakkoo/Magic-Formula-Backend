const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middlewares/auth.middleware');

const authController = require('./auth.controller');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/block-device-mismatch', authController.blockUserForDeviceMismatch);
router.post('/penalty-payment-order', authController.createPenaltyPaymentOrder);
router.post('/verify-penalty-payment', authController.verifyPenaltyPayment);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;

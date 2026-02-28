const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middlewares/auth.middleware');

const authController = require('./auth.controller');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/whatsapp/send-otp', authController.sendWhatsAppOtp);
router.post('/whatsapp/resend-otp', authController.resendWhatsAppOtp);
router.post('/whatsapp/verify-otp', authController.verifyWhatsAppOtp);
router.post('/block-device-mismatch', authController.blockUserForDeviceMismatch);
router.post('/penalty-payment-order', authController.createPenaltyPaymentOrder);
router.post('/verify-penalty-payment', authController.verifyPenaltyPayment);
router.post('/complete-registration', authMiddleware, authController.completeRegistration);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;

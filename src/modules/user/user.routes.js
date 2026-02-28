const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const upload = require('../../middlewares/upload.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const notificationController = require('../notification/notification.controller');

/* ======================================================
   RESET PASSWORD ROUTES (PUBLIC)
   ====================================================== */



// Handle Reset Password

router.get("/reset-password", userController.showResetForm);
// router.post('/reset-password', userController.resetPasswordByToken);
router.post('/reset-password', userController.resetPasswordByEmail);
/* ======================================================
   PROTECTED USER ROUTES
   ====================================================== */

router.get('/profile', authMiddleware, userController.getCurrentUserProfile);
router.put('/profile', authMiddleware, userController.updateCurrentUserProfile);
router.put('/profile/password', authMiddleware, userController.changePassword);
router.post('/profile-pic', authMiddleware, upload.single('profilePic'), userController.uploadProfilePic);
router.post('/activity', authMiddleware, userController.updateUserActivity);
router.post('/device-change-request', authMiddleware, userController.requestDeviceChange);

/* ======================================================
   NOTIFICATIONS
   ====================================================== */

router.get('/notifications', authMiddleware, notificationController.getUserNotifications);
router.get('/notifications/unread-count', authMiddleware, notificationController.getUnreadCount);
router.put('/notifications/:id/read', authMiddleware, notificationController.markNotificationAsRead);
router.delete('/notifications/:id', authMiddleware, notificationController.deleteUserNotification);
router.delete('/notifications', authMiddleware, notificationController.clearAllUserNotifications);

/* ======================================================
   PUBLIC PROFILE PHOTO ROUTE (KEEP LAST!)
   ====================================================== */

// router.get('/:id', userController.getProfilePhoto);

module.exports = router;
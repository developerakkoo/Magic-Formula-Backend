const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const upload = require('../../middlewares/upload.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const authAdmin = require('../admin/adminAuth.middleware.js');
const notificationController = require('../notification/notification.controller');

// Protected routes (require authentication)
router.get('/profile', authMiddleware, userController.getCurrentUserProfile);
router.put('/profile', authMiddleware, userController.updateCurrentUserProfile);
router.put('/profile/password', authMiddleware, userController.changePassword);
router.post('/profile-pic', authMiddleware, upload.single('profilePic'), userController.uploadProfilePic);
router.post('/activity', authMiddleware, userController.updateUserActivity); // Heartbeat endpoint for live user tracking
router.post('/device-change-request', authMiddleware, userController.requestDeviceChange); // Device change request endpoint

// User notification routes
router.get('/notifications', authMiddleware, notificationController.getUserNotifications);
router.get('/notifications/unread-count', authMiddleware, notificationController.getUnreadCount);
router.put('/notifications/:id/read', authMiddleware, notificationController.markNotificationAsRead);
router.delete('/notifications/:id', authMiddleware, notificationController.deleteUserNotification);
router.delete('/notifications', authMiddleware, notificationController.clearAllUserNotifications);

// Public routes (for profile photo access)
router.get('/:id', userController.getProfilePhoto);

module.exports = router;

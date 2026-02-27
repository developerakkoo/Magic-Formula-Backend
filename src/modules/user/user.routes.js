const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const upload = require('../../middlewares/upload.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const notificationController = require('../notification/notification.controller');

/* ======================================================
   RESET PASSWORD ROUTES (PUBLIC)
   ====================================================== */

// Show Reset Password Form
router.get('/reset-password', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reset Password</title>
      <style>
        body {
          font-family: Arial;
          background: #f4f4f4;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        .card {
          background: white;
          padding: 30px;
          border-radius: 10px;
          width: 350px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        input {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border-radius: 5px;
          border: 1px solid #ccc;
        }
        button {
          width: 100%;
          padding: 10px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
        }
        button:hover {
          background: #0056b3;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Reset Password</h2>
        <form method="POST" action="/reset-password">
          <input type="email" name="email" placeholder="Enter Registered Email" required />
          <input type="password" name="newPassword" placeholder="Enter New Password" required />
          <button type="submit">Reset Password</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Handle Reset Password
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

router.get('/:id', userController.getProfilePhoto);

module.exports = router;
const express = require('express');
const router = express.Router();
const authAdmin = require('../admin/adminAuth.middleware.js');
const controller = require('../notification/notification.controller');
const userController = require('../notification/usernotification.controller');

router.use(authAdmin);

router.post('/', controller.createNotification);
router.get('/', controller.getNotifications);
router.delete('/bulk-delete', controller.bulkDeleteNotifications);
router.put('/:id', controller.updateNotification);
router.delete('/:id', controller.deleteNotification);

router.post('/send-to-users', userController.sendNotificationToUsers);
router.post('/send-whatsapp', authAdmin,  controller.sendWhatsAppNotifications
);

module.exports = router;

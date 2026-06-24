const express = require('express');
const router = express.Router();
// const userController = require('./user.controller');
const adminController = require('./admin.controller');
const adminAuth = require('../admin/adminAuth.middleware.js');
const excelUpload = require('../../middlewares/excelUpload.middleware.js');
// PUBLIC
router.post('/login', adminController.login);

// PROTECTED (ADMIN LOGIN REQUIRED)
router.post('/create', adminController.createAdmin);
router.get('/users', adminAuth, adminController.getAllUsers);
router.get('/registration-requests', adminAuth, adminController.getPendingRegistrations);
// IMPORTANT: Specific routes must come before parameterized routes
router.get('/users/device-conflicts', adminAuth, adminController.getDeviceConflicts);
router.patch('/users/:id/approve-registration', adminAuth, adminController.approveRegistration);
router.patch('/users/:id/reject-registration', adminAuth, adminController.rejectRegistration);
router.get('/users/:id', adminAuth, adminController.getUserById);
router.post('/users', adminAuth, adminController.createUser);
router.patch('/users/:id', adminAuth, adminController.updateUser);
router.patch('/users/:id/allow-device', adminAuth, adminController.allowNewDevice);
router.delete('/users/:id', adminAuth, adminController.deleteUser);
router.patch('/block/:id', adminAuth, adminController.blockUser);
router.patch('/unblock/:id', adminAuth, adminController.unblockUser);
router.patch('/reset-device/:id', adminAuth, adminController.resetUserDevice);

// router.get('/dashboard', adminAuth, adminController.getDashboardStats);
router.get('/users-analytics', adminAuth, adminController.getUserAnalytics);
router.get('/earnings', adminAuth, adminController.getEarningsAnalytics);
router.get('/bestseller-plans', adminAuth, adminController.getBestsellerPlans);

router.get('/export-users', adminAuth, adminController.exportUsersExcel);
router.get('/export-earnings', adminAuth, adminController.exportEarningsExcel);

router.post('/bulk-create-users', adminAuth, excelUpload.single('file'),  adminController.bulkCreateUsers);
router.post('/bulk-subscription', adminAuth, excelUpload.single('file'), adminController.bulkAssignSubscription);
router.post('/bulk-remove-subscription', adminAuth, excelUpload.single('file'), adminController.bulkRemoveSubscription);

module.exports = router;

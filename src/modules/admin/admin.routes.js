const express = require('express');
const router = express.Router();
// const userController = require('./user.controller');
const adminController = require('./admin.controller');
const adminAuth = require('../admin/adminAuth.middleware.js');

// PUBLIC
router.post('/login', adminController.login);

// PROTECTED (ADMIN LOGIN REQUIRED)
router.post('/create', adminController.createAdmin);
router.get('/users', adminAuth, adminController.getAllUsers);
router.get('/users/:id', adminAuth, adminController.getUserById);
router.post('/users', adminAuth, adminController.createUser);
router.patch('/users/:id', adminAuth, adminController.updateUser);
router.delete('/users/:id', adminAuth, adminController.deleteUser);
router.patch('/block/:id', adminAuth, adminController.blockUser);
router.patch('/unblock/:id', adminAuth, adminController.unblockUser);

// router.get('/dashboard', adminAuth, adminController.getDashboardStats);
router.get('/users-analytics', adminAuth, adminController.getUserAnalytics);
router.get('/earnings', adminAuth, adminController.getEarningsAnalytics);
router.get('/bestseller-plans', adminAuth, adminController.getBestsellerPlans);

router.get('/export-users', adminAuth, adminController.exportUsersExcel);
router.get('/export-earnings', adminAuth, adminController.exportEarningsExcel);


module.exports = router;

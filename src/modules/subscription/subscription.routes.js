const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middlewares/auth.middleware');
const subscriptionMiddleware = require('../../middlewares/subscription.middleware');
const adminAuth = require('../admin/adminAuth.middleware.js');
// const authMiddleware = require('../../middlewares/auth.middleware');
const usageLimit = require('../../middlewares/usageLimit.middleware');

const subscriptionController = require('./subscription.controller');

const subscriptionExpiryJob = require('../../cron/subscriptionExpiry.js');

/* ================= ADMIN ROUTES ================= */

// Create plan
router.post('/admin/plans', adminAuth, subscriptionController.createPlan);

// Get all plans (admin)
router.get('/admin/plans', adminAuth, subscriptionController.getAllPlans);

// Update plan
router.put('/admin/plans/:planId', adminAuth, subscriptionController.updatePlan);

// Disable plan (soft delete)
router.delete('/admin/plans/:planId', adminAuth, subscriptionController.deletePlan);

// Assign plan to user manually
router.post('/admin/assign', adminAuth, subscriptionController.assignPlanToUser);

// Subscription analytics
router.get('/admin/analytics', adminAuth, subscriptionController.subscriptionAnalytics);

// router.get('/premium-data', authMiddleware, subscriptionMiddleware(), premiumController);

router.get('/premium-test', authMiddleware, subscriptionMiddleware(), usageLimit(5), (req, res) => {
    res.json({
      success: true,
      message: 'Usage allowed'
    });
  }
);
/* ================= USER ROUTES ================= */

// View active plans
router.get('/plans', authMiddleware, subscriptionController.getActivePlans);

// User subscribe (paid)
router.post('/subscribe', authMiddleware, subscriptionController.subscribe);

// Verify payment & activate subscription
router.post('/verify-payment', authMiddleware, subscriptionController.verifyPayment);

// Get my subscription
router.get('/my-subscription', authMiddleware, subscriptionController.getMySubscription);

router.post('/run-expiry', async (req, res) => {
  await subscriptionExpiryJob.runNow(); // we’ll add this helper
  res.json({ success: true });
});


module.exports = router;

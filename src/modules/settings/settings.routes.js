const express = require('express');
const router = express.Router();
const adminAuth = require('../admin/adminAuth.middleware.js');
const settingsController = require('./settings.controller');

// All routes require admin authentication
router.use(adminAuth);

router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);
router.post('/reset', settingsController.resetSettings);

module.exports = router;


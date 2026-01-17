const express = require('express');
const router = express.Router();
const adminAuth = require('../admin/adminAuth.middleware.js');
const logController = require('./log.controller');

// All routes require admin authentication
router.use(adminAuth);

router.get('/', logController.getLogs);
router.get('/:id', logController.getLogById);
router.delete('/:id', logController.deleteLog);
router.delete('/bulk-delete', logController.bulkDeleteLogs);
router.delete('/clear/all', logController.clearAllLogs);

module.exports = router;


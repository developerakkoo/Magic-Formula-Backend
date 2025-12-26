const express = require('express');
const router = express.Router();

const adminAuthController = require('./admin.controller');

router.post('/login', adminAuthController.login);

module.exports = router;

const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const upload = require('../../middlewares/upload.middleware');
const authAdmin = require('../admin/adminAuth.middleware.js')


// upload profile image
router.post('/:id/profile-pic', upload.single('profilePic'), userController.uploadProfilePic);
// profile photo
router.get('/:id', userController.getProfilePhoto);




module.exports = router;

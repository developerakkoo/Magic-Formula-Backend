const User = require('./user.model');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
// Redis disabled
// const { getLiveUsersCount } = require('../../utils/liveUsers.redis');

exports.getProfilePhoto = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user || !user.profilePic) {
    return res.status(404).json({ message: 'Profile photo not found' });
  }

  const filePath = path.join(
    __dirname,
    '../../uploads/profile',
    user.profilePic
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  res.sendFile(filePath);
};

exports.uploadProfilePic = async (req, res) => {
  try {
    // Use req.user from authMiddleware instead of req.params.id
    const user = req.user;

    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    // Save filename only
    user.profilePic = req.file.filename;
    await user.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      profilePic: `${baseUrl}/api/users/${user._id}`
    });
  } catch (error) {
    console.error('Upload profile pic error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


/**
 * GET CURRENT USER PROFILE
 * Uses req.user from authMiddleware
 */
exports.getCurrentUserProfile = async (req, res) => {
  try {
    const user = req.user;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const userResponse = {
      _id: user._id,
      mobile: user.mobile,
      fullName: user.fullName,
      email: user.email,
      whatsapp: user.whatsapp,
      firebaseToken: user.firebaseToken,
      isBlocked: user.isBlocked,
      activePlan: user.activePlan,
      planExpiry: user.planExpiry,
      deviceId: user.deviceId,
      lastDeviceLogin: user.lastDeviceLogin,
      profilePic: user.profilePic
        ? `${baseUrl}/api/users/${user._id}`
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json({
      success: true,
      data: userResponse
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * UPDATE CURRENT USER PROFILE
 * Uses req.user from authMiddleware
 */
exports.updateCurrentUserProfile = async (req, res) => {
  try {
    const user = req.user;
    const { fullName, email, mobile, whatsapp } = req.body;

    // Update only provided fields
    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: user._id }
      });
      if (existingUser) {
        return res.status(409).json({ message: 'Email already in use' });
      }
      user.email = email.toLowerCase();
    }
    if (mobile !== undefined) {
      // Check if mobile is already taken by another user
      if (mobile) {
        const existingUser = await User.findOne({ 
          mobile: mobile,
          _id: { $ne: user._id }
        });
        if (existingUser) {
          return res.status(409).json({ message: 'Mobile number already in use' });
        }
      }
      user.mobile = mobile || null;
    }
    if (whatsapp !== undefined) user.whatsapp = whatsapp;

    await user.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const userResponse = {
      _id: user._id,
      mobile: user.mobile,
      fullName: user.fullName,
      email: user.email,
      whatsapp: user.whatsapp,
      firebaseToken: user.firebaseToken,
      isBlocked: user.isBlocked,
      activePlan: user.activePlan,
      planExpiry: user.planExpiry,
      profilePic: user.profilePic
        ? `${baseUrl}/api/users/${user._id}`
        : null
    };

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email or mobile number already in use' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * CHANGE PASSWORD
 * Uses req.user from authMiddleware
 */
exports.changePassword = async (req, res) => {
  try {
    const user = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (!user.password) {
      return res.status(400).json({ message: 'This account does not have a password set. Please use mobile registration.' });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Validate new password length
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserAnalytics = async (req, res) => {
  const totalUsers = await User.countDocuments();
  const subscribedUsers = await User.countDocuments({ isSubscribed: true });
  const unsubscribedUsers = totalUsers - subscribedUsers;
  // Redis disabled - return 0 for liveUsers
  // const liveUsers = await getLiveUsersCount();
  const liveUsers = 0;

  res.json({
    success: true,
    data: {
      totalUsers,
      liveUsers,
      subscribedUsers,
      unsubscribedUsers,
    },
  });
};
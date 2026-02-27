const User = require('./user.model');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
// Redis disabled
// const { getLiveUsersCount } = require('../../utils/liveUsers.redis');
const crypto = require("crypto");
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
      deviceChangeRequested: user.deviceChangeRequested,
      deviceChangeRequestedAt: user.deviceChangeRequestedAt,
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

/**
 * UPDATE USER ACTIVITY (Heartbeat)
 * Updates lastActivity timestamp for live user tracking
 * Uses req.user from authMiddleware
 */
exports.updateUserActivity = async (req, res) => {
  try {
    const user = req.user;
    
    // Update lastActivity timestamp
    user.lastActivity = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Activity updated successfully',
      data: {
        lastActivity: user.lastActivity
      }
    });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * REQUEST DEVICE CHANGE
 * Creates a device change request - user will be blocked and logged out until admin approves
 * Uses req.user from authMiddleware
 */
exports.requestDeviceChange = async (req, res) => {
  try {
    const user = req.user;
    
    // Check if request already pending
    if (user.deviceChangeRequested) {
      return res.status(400).json({
        success: false,
        message: 'Device change request is already pending. Please wait for admin approval.'
      });
    }
    
    // Set device change request flags and block user
    user.deviceChangeRequested = true;
    user.deviceChangeRequestedAt = new Date();
    user.isBlocked = true; // Block user until admin approves
    await user.save();

    res.json({
      success: true,
      message: 'Device change request submitted successfully. You will be logged out and blocked until admin approves your request.'
    });
  } catch (error) {
    console.error('Request device change error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
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

// exports.resetPasswordByEmail = async (req, res) => {
//   try {
//     const { email, newPassword } = req.body;
//     console.log("BODY:", req.body);
//     console.log("BODY FROM BROWSER:", req.body);
//     if (!email || !newPassword) {
//       return res.status(400).json({ message: "Email and new password required" });
//     }

//     if (newPassword.length < 8) {
//       return res.status(400).json({ message: "Password must be at least 8 characters" });
//     }

//     const user = await User.findOne({ email });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const hashedPassword = await bcrypt.hash(newPassword, 10);
//     user.password = hashedPassword;

//     await user.save();

//     return res.json({ message: "Password reset successfully" });

//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// };

exports.showResetForm = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).send("Invalid reset link");
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    console.log("Incoming token:", token);
    console.log("Matched user:", user?.email || "No user found");

    if (!user) {
      return res.status(400).send("Reset link expired or invalid");
    }

    res.send(`
      <html>
        <body>
          <h2>Reset Password</h2>
          <form method="POST" action="/api/auth/reset-password/${token}">
            <input type="email" value="${user.email}" readonly /><br/><br/>
            <input type="password" name="newPassword" placeholder="New Password" required /><br/><br/>
            <input type="password" name="confirmPassword" placeholder="Confirm Password" required /><br/><br/>
            <button type="submit">Set Password</button>
          </form>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("Show reset form error:", error);
    res.status(500).send("Something went wrong");
  }
};
exports.resetPasswordByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).send("Invalid request");
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).send("All fields required");
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).send("Passwords do not match");
    }

    if (newPassword.length < 8) {
      return res.status(400).send("Password must be at least 8 characters");
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).send("Token invalid or expired");
    }

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);

    // Clear reset fields immediately (VERY IMPORTANT)
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.send(`
      <html>
        <body>
          <h2>Password Reset Successful ✅</h2>
          <p>You can now login with your new password.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).send("Something went wrong");
  }
};
const User = require('./user.model');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
// Redis disabled
// const { getLiveUsersCount } = require('../../utils/liveUsers.redis');
const crypto = require("crypto");
const {
  sendPasswordResetOtpEmail
} = require('../../services/email.service');

const PASSWORD_RESET_OTP_LENGTH = 6
const PASSWORD_RESET_OTP_EXPIRY_MINUTES = 10
const PASSWORD_RESET_OTP_RESEND_SECONDS = 30
const PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5

const normalizeEmail = value => String(value || '').trim().toLowerCase()

const generateOtpCode = length => {
  const min = 10 ** (length - 1)
  const maxExclusive = 10 ** length
  return String(crypto.randomInt(min, maxExclusive))
}
// exports.getProfilePhoto = async (req, res) => {
//   const user = await User.findById(req.params.id);

//   if (!user || !user.profilePic) {
//     return res.status(404).json({ message: 'Profile photo not found' });
//   }

//   const filePath = path.join(
//     __dirname,
//     '../../uploads/profile',
//     user.profilePic
//   );

//   if (!fs.existsSync(filePath)) {
//     return res.status(404).json({ message: 'File not found' });
//   }

//   res.sendFile(filePath);
// };

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
      registrationStatus: user.registrationStatus,
      registrationSubmittedAt: user.registrationSubmittedAt,
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

// exports.showResetForm = async (req, res) => {
//   try {
//     const { token } = req.params;

//     if (!token) {
//       return res.status(400).send("Invalid reset link");
//     }

//     const hashedToken = crypto
//       .createHash("sha256")
//       .update(token)
//       .digest("hex");

//     const user = await User.findOne({
//       resetPasswordToken: hashedToken,
//       resetPasswordExpire: { $gt: Date.now() }
//     });

//     console.log("Incoming token:", token);
//     console.log("Matched user:", user?.email || "No user found");

//     if (!user) {
//       return res.status(400).send("Reset link expired or invalid");
//     }

//     res.send(`
//       <html>
//         <body>
//           <h2>Reset Password</h2>
//           <form method="POST" action="/api/auth/reset-password/${token}">
//             <input type="email" value="${user.email}" readonly /><br/><br/>
//             <input type="password" name="newPassword" placeholder="New Password" required /><br/><br/>
//             <input type="password" name="confirmPassword" placeholder="Confirm Password" required /><br/><br/>
//             <button type="submit">Set Password</button>
//           </form>
//         </body>
//       </html>
//     `);

//   } catch (error) {
//     console.error("Show reset form error:", error);
//     res.status(500).send("Something went wrong");
//   }
// };
// exports.resetPasswordByToken = async (req, res) => {
//   try {
//     const { token } = req.params;
//     const { newPassword, confirmPassword } = req.body;

//     if (!token) {
//       return res.status(400).send("Invalid request");
//     }

//     if (!newPassword || !confirmPassword) {
//       return res.status(400).send("All fields required");
//     }

//     if (newPassword !== confirmPassword) {
//       return res.status(400).send("Passwords do not match");
//     }

//     if (newPassword.length < 8) {
//       return res.status(400).send("Password must be at least 8 characters");
//     }

//     const hashedToken = crypto
//       .createHash("sha256")
//       .update(token)
//       .digest("hex");

//     const user = await User.findOne({
//       resetPasswordToken: hashedToken,
//       resetPasswordExpire: { $gt: Date.now() }
//     });

//     if (!user) {
//       return res.status(400).send("Token invalid or expired");
//     }

//     // Hash new password
//     user.password = await bcrypt.hash(newPassword, 10);

//     // Clear reset fields immediately (VERY IMPORTANT)
//     user.resetPasswordToken = undefined;
//     user.resetPasswordExpire = undefined;

//     await user.save();

//     res.send(`
//       <html>
//         <body>
//           <h2>Password Reset Successful ✅</h2>
//           <p>You can now login with your new password.</p>
//         </body>
//       </html>
//     `);

//   } catch (error) {
//     console.error("Reset password error:", error);
//     res.status(500).send("Something went wrong");
//   }
// };



exports.showResetForm = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).send("<h2>Invalid Reset Link ❌</h2>");
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).send("<h2>User not found ❌</h2>");
    }

    res.send(`
    <html>
    <head>
    <style>
    body {
      font-family: Arial;
      background: #f4f6f9;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
    .card {
      background: white;
      padding: 30px;
      border-radius: 10px;
      width: 400px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    }
    input {
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      border-radius: 5px;
      border: 1px solid #ccc;
    }
    button {
      width: 100%;
      padding: 10px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }
    </style>
    </head>
    <body>
    <div class="card">
      <h2>Reset Password</h2>

      <form method="POST" action="/reset-password">

        <input type="hidden" name="email" value="${user.email}" />

        <input type="email" value="${user.email}" readonly />

        <input type="password" name="newPassword" placeholder="Enter New Password" required />

        <input type="password" name="confirmPassword" placeholder="Confirm New Password" required />

        <button type="submit">Reset Password</button>
      </form>
    </div>
    </body>
    </html>
    `);

  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong");
  }
};


exports.resetPasswordByEmail = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email) {
      return res.status(400).send("<h2>Email missing ❌</h2>");
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).send("<h2>All fields required ❌</h2>");
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).send("<h2>Passwords do not match ❌</h2>");
    }

    if (newPassword.length < 8) {
      return res.status(400).send("<h2>Password must be at least 8 characters ❌</h2>");
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).send("<h2>User not found ❌</h2>");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.send(`
      <div style="font-family:Arial; text-align:center; margin-top:100px;">
        <h2>Password Reset Successful ✅</h2>
        <p>You can now login with your new password.</p>
      </div>
    `);

  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong");
  }
};

exports.showForgotPasswordPage = async (req, res) => {
  try {
    const { email } = req.query
    const initialEmail = email ? normalizeEmail(email) : ''

    res.send(`
    <html>
    <head>
    <style>
    body {
      font-family: Arial;
      background: #f4f6f9;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
    .card {
      background: white;
      padding: 30px;
      border-radius: 10px;
      width: 420px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    }
    input {
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      border-radius: 5px;
      border: 1px solid #ccc;
      box-sizing: border-box;
    }
    button {
      width: 100%;
      padding: 10px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      margin-top: 8px;
    }
    .hint {
      font-size: 13px;
      color: #666;
      line-height: 1.5;
    }
    </style>
    </head>
    <body>
    <div class="card">
      <h2>Forgot Password</h2>
      <p class="hint">
        1) Request an OTP using <code>POST /api/users/forgot-password/request-otp</code>.<br/>
        2) Enter the OTP and new password below to complete the reset.
      </p>

      <form method="POST" action="/api/users/forgot-password/reset">
        <input type="email" name="email" placeholder="Email" value="${initialEmail}" required />
        <input type="text" name="otp" placeholder="OTP" required />
        <input type="password" name="newPassword" placeholder="New Password" required />
        <input type="password" name="confirmPassword" placeholder="Confirm New Password" required />
        <button type="submit">Reset Password</button>
      </form>
    </div>
    </body>
    </html>
    `)
  } catch (error) {
    console.error('Show forgot password page error:', error)
    res.status(500).send('Something went wrong')
  }
}

exports.requestPasswordResetOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    console.log(`[forgot-password] OTP request received for ${email}`)

    const user = await User.findOne({ email })

    if (!user) {
      console.log(`[forgot-password] No user found for ${email}`)
      return res.json({
        success: true,
        message: 'If the email exists, an OTP has been sent'
      })
    }

    if (!user.password) {
      console.log(`[forgot-password] User ${email} has no password set`)
      return res.status(400).json({
        message: 'This account does not have an email password set'
      })
    }

    if (
      user.passwordResetOtpLastSentAt &&
      Date.now() - new Date(user.passwordResetOtpLastSentAt).getTime() <
        PASSWORD_RESET_OTP_RESEND_SECONDS * 1000
    ) {
      const retryAfterSeconds = Math.max(
        1,
        PASSWORD_RESET_OTP_RESEND_SECONDS -
          Math.floor(
            (Date.now() - new Date(user.passwordResetOtpLastSentAt).getTime()) /
              1000
          )
      )

      return res.status(429).json({
        message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP`
      })
    }

    const otpCode = generateOtpCode(PASSWORD_RESET_OTP_LENGTH)
    const hashedOtp = await bcrypt.hash(otpCode, 10)
    const otpExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_OTP_EXPIRY_MINUTES * 60 * 1000
    )

    console.log(`[forgot-password] Sending OTP email to ${email}`)
    await sendPasswordResetOtpEmail({
      to: user.email,
      otpCode,
      fullName: user.fullName
    })
    console.log(`[forgot-password] OTP email sent to ${email}`)

    user.passwordResetOtpHash = hashedOtp
    user.passwordResetOtpExpiresAt = otpExpiresAt
    user.passwordResetOtpLastSentAt = new Date()
    user.passwordResetOtpAttempts = 0

    await user.save()

    return res.json({
      success: true,
      message: 'OTP sent to your email'
    })
  } catch (error) {
    console.error('Password reset OTP error:', error)
    return res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const otp = String(req.body.otp || '').trim()
    const { newPassword, confirmPassword } = req.body

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    if (!otp) {
      return res.status(400).json({ message: 'OTP is required' })
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' })
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' })
    }

    if (String(newPassword).length < 8) {
      return res
        .status(400)
        .json({ message: 'Password must be at least 8 characters' })
    }

    const user = await User.findOne({ email })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ message: 'No active password reset OTP' })
    }

    if (user.passwordResetOtpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Password reset OTP expired' })
    }

    const isValidOtp = await bcrypt.compare(otp, user.passwordResetOtpHash)

    if (!isValidOtp) {
      user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1

      if (user.passwordResetOtpAttempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
        user.passwordResetOtpHash = null
        user.passwordResetOtpExpiresAt = null
        user.passwordResetOtpAttempts = 0
        user.passwordResetOtpLastSentAt = null
      }

      await user.save()

      return res.status(401).json({ message: 'Invalid OTP' })
    }

    user.password = await bcrypt.hash(String(newPassword), 10)
    user.passwordResetOtpHash = null
    user.passwordResetOtpExpiresAt = null
    user.passwordResetOtpAttempts = 0
    user.passwordResetOtpLastSentAt = null

    await user.save()

    return res.json({
      success: true,
      message: 'Password reset successfully'
    })
  } catch (error) {
    console.error('Reset password with OTP error:', error)
    return res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.showResetForm = exports.showForgotPasswordPage
exports.resetPasswordByEmail = exports.resetPasswordWithOtp

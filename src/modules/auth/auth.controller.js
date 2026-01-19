const User = require('../user/user.model');
const { generateAccessToken } = require('../../utils/jwt.utils');
const bcrypt = require('bcryptjs');
// Redis disabled
// const { addLiveUser, removeLiveUser } = require('../../utils/liveUsers.redis');

/**
 * REGISTER WITH EMAIL AND PASSWORD
 * Email/password based registration
 */
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      mobile,
      whatsapp,
      profilePic,
      firebaseToken,
      activePlan,
      planExpiry,
      deviceId
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Device ID is required for registration
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required for registration' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { mobile: mobile }
      ].filter(Boolean)
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(409).json({ message: 'User with this email already exists' });
      }
      if (mobile && existingUser.mobile === mobile) {
        return res.status(409).json({ message: 'User with this mobile number already exists' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with deviceId (required)
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName,
      mobile: mobile || null,
      whatsapp,
      profilePic,
      firebaseToken,
      activePlan: activePlan || null,
      planExpiry: planExpiry || null,
      deviceId: deviceId, // Required - already validated above
      lastDeviceLogin: new Date() // Set on successful registration
    });

    // 🚫 Block check (admin blocking)
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      });
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    });

    // 🌐 Build profile pic URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // 🎯 Response object
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

    // ✅ Final response
    res.json({
      message: 'Registration successful',
      isRegistered: false,
      isBlocked: false,
      accessToken,
      user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'User with this email or mobile already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * REGISTER WITH MOBILE (Legacy)
 * Mobile-based registration (auto-creates user if not exists)
 * Kept for backward compatibility
 */
exports.registerMobile = async (req, res) => {
  try {
    const {
      mobile,
      fullName,
      email,
      whatsapp,
      profilePic,
      firebaseToken,
      activePlan,
      planExpiry,
      deviceId
    } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    let isRegistered = true;

    // 🔍 Find user by mobile
    let user = await User.findOne({ mobile });

    // 🆕 If not registered → create
    if (!user) {
      isRegistered = false;
      user = await User.create({
        mobile,
        fullName,
        email,
        whatsapp,
        profilePic,
        firebaseToken,
        activePlan: activePlan || null,
        planExpiry: planExpiry || null,
        deviceId: deviceId || null,
        lastDeviceLogin: deviceId ? new Date() : null
      });
    } else {
      // 🔁 Update only provided fields
      if (fullName) user.fullName = fullName;
      if (email) user.email = email;
      if (whatsapp) user.whatsapp = whatsapp;
      if (profilePic) user.profilePic = profilePic;
      if (firebaseToken) user.firebaseToken = firebaseToken;
      if (activePlan !== undefined) user.activePlan = activePlan;
      if (planExpiry !== undefined) user.planExpiry = planExpiry;

      // 🔒 Device restriction check
      if (deviceId) {
        // If user has no device ID set (first login), set it
        if (!user.deviceId) {
          user.deviceId = deviceId;
          user.lastDeviceLogin = new Date();
        } else {
          // If device ID doesn't match, block login
          if (user.deviceId !== deviceId) {
            return res.status(403).json({
              message: 'Login failed. This account is registered to another device. Contact admin to reset device.',
              isBlocked: true,
              isDeviceMismatch: true
            });
          } else {
            // Device ID matches, update last login timestamp
            user.lastDeviceLogin = new Date();
          }
        }
      }

      await user.save();
    }

    // 🚫 Block check (admin blocking)
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      });
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    });

    // 🔴 Add user to Redis live users - DISABLED
    // await addLiveUser(user._id);

    // 🌐 Build profile pic URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // 🎯 Response object
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

    // ✅ Final response
    res.json({
      message: isRegistered ? 'Login successful' : 'Registration successful',
      isRegistered,
      isBlocked: false,
      accessToken,
      user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * LOGIN WITH EMAIL AND PASSWORD
 * Email/password based authentication
 */
exports.login = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // 🔍 Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 🔐 Verify password
    if (!user.password) {
      return res.status(401).json({ 
        message: 'This account was registered with mobile. Please use mobile registration or contact admin.' 
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 🔒 Device restriction check
    if (user.deviceId) {
      // User has deviceId set - must match login request
      if (!deviceId) {
        // User has deviceId but login request doesn't include it - treat as mismatch
        return res.status(403).json({
          message: 'Login failed. This account is registered to another device. Contact admin to reset device.',
          isBlocked: true,
          isDeviceMismatch: true
        });
      }
      
      // Check if device ID matches
      if (user.deviceId !== deviceId) {
        // Device ID doesn't match - block login
        return res.status(403).json({
          message: 'Login failed. This account is registered to another device. Contact admin to reset device.',
          isBlocked: true,
          isDeviceMismatch: true
        });
      }
      
      // Device ID matches - update last login timestamp
      user.lastDeviceLogin = new Date();
      await user.save();
    } else {
      // User doesn't have deviceId - either legacy user or admin reset device
      // If deviceId is provided, set it and allow login (this handles post-reset login)
      if (!deviceId) {
        return res.status(400).json({ 
          message: 'Device ID is required for login. Please contact admin if you need assistance.' 
        });
      }
      
      // Set deviceId for user (handles both legacy users and post-reset login)
      user.deviceId = deviceId;
      user.lastDeviceLogin = new Date();
      await user.save();
      // Continue to login (don't return here)
    }

    // 🚫 Block check (admin blocking)
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      });
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    });

    // 🌐 Build profile pic URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // 🎯 Response object
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

    // ✅ Final response
    res.json({
      message: 'Login successful',
      isBlocked: false,
      accessToken,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * LOGOUT
 * Requires authentication middleware
 */
exports.logout = async (req, res) => {
  try {
    // User is available from authMiddleware via req.user
    // Redis disabled
    // await removeLiveUser(req.user._id);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
};

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
        lastDeviceLogin: deviceId ? new Date() : null,
        lastActivity: new Date() // Set initial activity on registration
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
            user.lastActivity = new Date(); // Update activity on login
          }
        }
      }

      // Update lastActivity if not already set
      if (!user.lastActivity) {
        user.lastActivity = new Date();
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
      
      // Device ID matches - update last login timestamp and activity
      user.lastDeviceLogin = new Date();
      user.lastActivity = new Date(); // Update activity on login
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
      user.lastActivity = new Date(); // Update activity on login
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
 * BLOCK USER FOR DEVICE MISMATCH
 * Blocks user when they confirm device mismatch
 */
exports.blockUserForDeviceMismatch = async (req, res) => {
  try {
    const { email, deviceId } = req.body;
    
    if (!email || !deviceId) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and device ID are required' 
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Verify device mismatch
    if (user.deviceId === deviceId) {
      return res.status(400).json({ 
        success: false,
        message: 'Device ID matches. No mismatch detected.' 
      });
    }
    
    // Block user
    user.isBlocked = true;
    await user.save();
    
    res.json({
      success: true,
      message: 'User blocked due to device mismatch'
    });
  } catch (error) {
    console.error('Block user for device mismatch error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

/**
 * CREATE PENALTY PAYMENT ORDER
 * Creates Razorpay order for penalty payment
 */
exports.createPenaltyPaymentOrder = async (req, res) => {
  try {
    const { email, amount = 500 } = req.body; // Default penalty 500
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Get Razorpay instance
    const getRazorpayInstance = require('../../config/razorpay');
    const razorpay = getRazorpayInstance();
    
    // Amount in paise
    const amountInPaise = amount * 100;
    
    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `penalty_${user._id.toString().slice(-6)}_${Date.now().toString().slice(-6)}`,
      notes: {
        userId: user._id.toString(),
        email: email,
        type: 'penalty'
      }
    });
    
    res.json({
      success: true,
      message: 'Penalty payment order created',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      }
    });
  } catch (error) {
    console.error('Create penalty payment order error:', error);
    
    // Handle Razorpay configuration errors
    if (error.message && error.message.includes('Razorpay configuration missing')) {
      return res.status(500).json({ 
        success: false,
        message: 'Payment service is not configured. Please contact support.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to create payment order' 
    });
  }
};

/**
 * VERIFY PENALTY PAYMENT
 * Verifies Razorpay payment and unblocks user, resets device ID
 */
exports.verifyPenaltyPayment = async (req, res) => {
  try {
    const {
      email,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;
    
    if (!email || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        message: 'All payment details are required' 
      });
    }
    
    // Verify Razorpay signature
    const crypto = require('crypto');
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        message: 'Payment verification failed' 
      });
    }
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Unblock user and reset device ID
    user.isBlocked = false;
    user.deviceId = null;
    user.lastDeviceLogin = null;
    await user.save();
    
    res.json({
      success: true,
      message: 'Penalty paid successfully. Account unblocked and device reset.'
    });
  } catch (error) {
    console.error('Verify penalty payment error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Payment verification failed' 
    });
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

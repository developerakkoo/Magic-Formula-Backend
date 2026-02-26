const User = require('../user/user.model')
const { generateAccessToken } = require('../../utils/jwt.utils')
const bcrypt = require('bcryptjs')
const { randomInt } = require('crypto')
// const { sendWhatsAppMessage } = require('../../services/wati.service')
const { sendWhatsAppTemplate } = require('../../services/wati.service');
// const { sendOTPMessage } = require("../services/wati.service");
// Redis disabled
// const { addLiveUser, removeLiveUser } = require('../../utils/liveUsers.redis');

const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 5
const OTP_RESEND_SECONDS = 30
const OTP_MAX_ATTEMPTS = 5

const normalizeWhatsAppNumber = value => {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) {
    return null
  }
  return digits
}

const maskNumber = phone => {
  if (!phone || phone.length < 4) return phone
  return `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`
}

const generateOtpCode = () => {
  const min = 10 ** (OTP_LENGTH - 1)
  const maxExclusive = 10 ** OTP_LENGTH
  return String(randomInt(min, maxExclusive))
}

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
      whatsapp,
      profilePic,
      firebaseToken,
      activePlan,
      planExpiry,
      deviceId
    } = req.body

    if (!email || !password || !whatsapp) {
      return res
        .status(400)
        .json({ message: 'Email, password, and WhatsApp number are required' })
    }

    // Device ID is required for registration
    if (!deviceId) {
      return res
        .status(400)
        .json({ message: 'Device ID is required for registration' })
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { whatsapp }]
    })

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res
          .status(409)
          .json({ message: 'User with this email already exists' })
      }
      if (existingUser.whatsapp === whatsapp) {
        return res
          .status(409)
          .json({ message: 'User with this WhatsApp number already exists' })
      }
      return res.status(409).json({ message: 'User already exists' })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create new user with deviceId (required)
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName,
      whatsapp,
      profilePic,
      firebaseToken,
      activePlan: activePlan || null,
      planExpiry: planExpiry || null,
      deviceId: deviceId, // Required - already validated above
      lastDeviceLogin: new Date() // Set on successful registration
    })

    // 🚫 Block check (admin blocking)
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      })
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    })

    // 🌐 Build profile pic URL
    const baseUrl = `${req.protocol}://${req.get('host')}`

    // 🎯 Response object
    const userResponse = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      whatsapp: user.whatsapp,
      firebaseToken: user.firebaseToken,
      isBlocked: user.isBlocked,
      activePlan: user.activePlan,
      planExpiry: user.planExpiry,
      deviceChangeRequested: user.deviceChangeRequested,
      deviceChangeRequestedAt: user.deviceChangeRequestedAt,
      profilePic: user.profilePic ? `${baseUrl}/api/users/${user._id}` : null
    }

    // ✅ Final response
    res.json({
      message: 'Registration successful',
      isRegistered: false,
      isBlocked: false,
      accessToken,
      user: userResponse
    })
  } catch (error) {
    console.error('Registration error:', error)
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res
          .status(409)
          .json({ message: 'User with this email already exists' })
      }
      if (error.keyPattern?.mobile) {
        return res
          .status(409)
          .json({
            message:
              'Duplicate mobile index conflict. Please drop old mobile_1 index from database.'
          })
      }
      if (error.keyPattern?.whatsapp) {
        return res
          .status(409)
          .json({ message: 'User with this WhatsApp number already exists' })
      }
      return res.status(409).json({ message: 'Duplicate value already exists' })
    }
    res.status(500).json({ message: 'Server error' })
  }
}

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
    } = req.body

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' })
    }

    let isRegistered = true

    // 🔍 Find user by mobile
    let user = await User.findOne({ mobile })

    // 🆕 If not registered → create
    if (!user) {
      isRegistered = false
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
      })
    } else {
      // 🔁 Update only provided fields
      if (fullName) user.fullName = fullName
      if (email) user.email = email
      if (whatsapp) user.whatsapp = whatsapp
      if (profilePic) user.profilePic = profilePic
      if (firebaseToken) user.firebaseToken = firebaseToken
      if (activePlan !== undefined) user.activePlan = activePlan
      if (planExpiry !== undefined) user.planExpiry = planExpiry

      // 🔒 Device restriction check
      if (deviceId) {
        // If user has no device ID set (first login), set it
        if (!user.deviceId) {
          user.deviceId = deviceId
          user.lastDeviceLogin = new Date()
        } else {
          // If device ID doesn't match, block login
          if (user.deviceId !== deviceId) {
            return res.status(403).json({
              message:
                'Login failed. This account is registered to another device. Contact admin to reset device.',
              isBlocked: true,
              isDeviceMismatch: true
            })
          } else {
            // Device ID matches, update last login timestamp
            user.lastDeviceLogin = new Date()
            user.lastActivity = new Date() // Update activity on login
          }
        }
      }

      // Update lastActivity if not already set
      if (!user.lastActivity) {
        user.lastActivity = new Date()
      }

      await user.save()
    }

    // 🚫 Block check (admin blocking)
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      })
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    })

    // 🔴 Add user to Redis live users - DISABLED
    // await addLiveUser(user._id);

    // 🌐 Build profile pic URL
    const baseUrl = `${req.protocol}://${req.get('host')}`

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
      deviceChangeRequested: user.deviceChangeRequested,
      deviceChangeRequestedAt: user.deviceChangeRequestedAt,
      profilePic: user.profilePic ? `${baseUrl}/api/users/${user._id}` : null
    }

    // ✅ Final response
    res.json({
      message: isRegistered ? 'Login successful' : 'Registration successful',
      isRegistered,
      isBlocked: false,
      accessToken,
      user: userResponse
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * SEND WHATSAPP OTP
 * Sends login/registration OTP to a WhatsApp number.
 */
// exports.sendWhatsAppOtp = async (req, res) => {
//   try {
//     const { whatsapp } = req.body;

//     const normalizedWhatsApp = normalizeWhatsAppNumber(whatsapp);
//     if (!normalizedWhatsApp) {
//       return res.status(400).json({
//         message: "Valid WhatsApp number is required"
//       });
//     }

//     let user = await User.findOne({ whatsapp: normalizedWhatsApp });

//     if (!user) {
//       user = await User.create({
//         whatsapp: normalizedWhatsApp
//       });
//     }

//     const otpCode = generateOtpCode();

//     const sent = await sendWhatsAppTemplate(
//       normalizedWhatsApp,
//       "magic_formula_otp_v3",
//       otpCode
//     );

//     if (!sent.success) {
//       return res.status(502).json({
//         message: "Failed to send OTP",
//         error: sent.error
//       });
//     }

//     user.otpCodeHash = await bcrypt.hash(otpCode, 10);
//     user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
//     user.otpAttempts = 0;

//     await user.save();

//     res.json({
//       success: true,
//       message: "OTP sent successfully"
//     });

//   } catch (error) {
//     console.error("Send OTP error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

/**
 * SEND WHATSAPP OTP
 * Sends login/registration OTP to a WhatsApp number.
 */
exports.sendWhatsAppOtp = async (req, res) => {
  try {
    const { whatsapp } = req.body;

    const normalizedWhatsApp = normalizeWhatsAppNumber(whatsapp);
    if (!normalizedWhatsApp) {
      return res.status(400).json({
        message: "Valid WhatsApp number is required"
      });
    }

    let user = await User.findOne({ whatsapp: normalizedWhatsApp });

    if (!user) {
      user = await User.create({
        whatsapp: normalizedWhatsApp
      });
    }

    const otpCode = generateOtpCode();

    // ✅ IMPORTANT FIX: send OTP as array
    const sent = await sendWhatsAppTemplate(
      normalizedWhatsApp,
      "magic_formula_otp_v3",
      [otpCode]   // 👈 FIXED
    );

    if (!sent.success) {
      return res.status(502).json({
        message: "Failed to send OTP",
        error: sent.error
      });
    }

    user.otpCodeHash = await bcrypt.hash(otpCode, 10);
    user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.otpAttempts = 0;

    await user.save();

    return res.json({
      success: true,
      message: "OTP sent successfully"
    });

  } catch (error) {
    console.error("Send OTP error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
/**
 * RESEND WHATSAPP OTP
 * Resends OTP with the same validations and cooldown.
 */
exports.resendWhatsAppOtp = async (req, res) => {
  req.body = { ...req.body }
  return exports.sendWhatsAppOtp(req, res)
}

/**
 * VERIFY WHATSAPP OTP
 * Verifies OTP and logs in / completes registration.
 */
exports.verifyWhatsAppOtp = async (req, res) => {
  try {
    const { whatsapp, otp, deviceId } = req.body;

    const normalizedWhatsApp = normalizeWhatsAppNumber(whatsapp);

    if (!normalizedWhatsApp || !otp) {
      return res.status(400).json({
        message: "WhatsApp number and OTP are required"
      });
    }

    const user = await User.findOne({ whatsapp: normalizedWhatsApp });

    if (!user || !user.otpCodeHash) {
      return res.status(400).json({
        message: "No active OTP found"
      });
    }

    if (user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        message: "OTP expired"
      });
    }

    const isValid = await bcrypt.compare(String(otp), user.otpCodeHash);

    if (!isValid) {
      user.otpAttempts += 1;
      await user.save();

      return res.status(401).json({
        message: "Invalid OTP"
      });
    }

    // 🔒 Device restriction logic (same as old login)
    if (user.deviceId) {
      if (!deviceId || user.deviceId !== deviceId) {
        return res.status(403).json({
          message:
            "Login failed. This account is registered to another device. Contact admin.",
          isBlocked: true,
          isDeviceMismatch: true
        });
      }

      user.lastDeviceLogin = new Date();
      user.lastActivity = new Date();
    } else {
      if (deviceId) {
        user.deviceId = deviceId;
        user.lastDeviceLogin = new Date();
        user.lastActivity = new Date();
      }
    }

    // Clear OTP
    user.otpCodeHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;

    await user.save();

    // 🚫 Block check
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Contact admin.",
        isBlocked: true,
        isDeviceMismatch: false
      });
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    });

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // 🎯 SAME RESPONSE STRUCTURE AS OLD LOGIN
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
      deviceChangeRequested: user.deviceChangeRequested,
      deviceChangeRequestedAt: user.deviceChangeRequestedAt,
      profilePic: user.profilePic
        ? `${baseUrl}/api/users/${user._id}`
        : null
    };

    res.json({
      message: "Login successful",
      isBlocked: false,
      accessToken,
      user: userResponse
    });

  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * LOGIN WITH EMAIL AND PASSWORD
 * Email/password based authentication
 */
exports.login = async (req, res) => {
  try {
    const { email, whatsapp, password, deviceId } = req.body

    if ((!email && !whatsapp) || !password) {
      return res
        .status(400)
        .json({ message: 'Email or WhatsApp number and password are required' })
    }

    // Find user by email or WhatsApp
    const user = await User.findOne(
      email ? { email: email.toLowerCase() } : { whatsapp }
    )

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // 🔐 Verify password
    if (!user.password) {
      return res.status(401).json({
        message:
          'This account does not have a password set. Please contact admin.'
      })
    }

    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // 🔒 Device restriction check
    if (user.deviceId) {
      // User has deviceId set - must match login request
      if (!deviceId) {
        // User has deviceId but login request doesn't include it - treat as mismatch
        return res.status(403).json({
          message:
            'Login failed. This account is registered to another device. Contact admin to reset device.',
          isBlocked: true,
          isDeviceMismatch: true
        })
      }

      // Check if device ID matches
      if (user.deviceId !== deviceId) {
        // Device ID doesn't match - block login
        return res.status(403).json({
          message:
            'Login failed. This account is registered to another device. Contact admin to reset device.',
          isBlocked: true,
          isDeviceMismatch: true
        })
      }

      // Device ID matches - update last login timestamp and activity
      user.lastDeviceLogin = new Date()
      user.lastActivity = new Date() // Update activity on login
      await user.save()
    } else {
      // User doesn't have deviceId - either legacy user or admin reset device
      // If deviceId is provided, set it and allow login (this handles post-reset login)
      if (!deviceId) {
        return res.status(400).json({
          message:
            'Device ID is required for login. Please contact admin if you need assistance.'
        })
      }

      // Set deviceId for user (handles both legacy users and post-reset login)
      user.deviceId = deviceId
      user.lastDeviceLogin = new Date()
      user.lastActivity = new Date() // Update activity on login
      await user.save()
      // Continue to login (don't return here)
    }

    // 🚫 Block check (admin blocking)
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      })
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    })

    // 🌐 Build profile pic URL
    const baseUrl = `${req.protocol}://${req.get('host')}`

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
      deviceChangeRequested: user.deviceChangeRequested,
      deviceChangeRequestedAt: user.deviceChangeRequestedAt,
      profilePic: user.profilePic ? `${baseUrl}/api/users/${user._id}` : null
    }

    // ✅ Final response
    res.json({
      message: 'Login successful',
      isBlocked: false,
      accessToken,
      user: userResponse
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * BLOCK USER FOR DEVICE MISMATCH
 * Blocks user when they confirm device mismatch
 */
exports.blockUserForDeviceMismatch = async (req, res) => {
  try {
    const { email, deviceId } = req.body

    if (!email || !deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Email and device ID are required'
      })
    }

    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Verify device mismatch
    if (user.deviceId === deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Device ID matches. No mismatch detected.'
      })
    }

    // Block user
    user.isBlocked = true
    await user.save()

    res.json({
      success: true,
      message: 'User blocked due to device mismatch'
    })
  } catch (error) {
    console.error('Block user for device mismatch error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
}

/**
 * CREATE PENALTY PAYMENT ORDER
 * Creates Razorpay order for penalty payment
 */
exports.createPenaltyPaymentOrder = async (req, res) => {
  try {
    const { email, amount = 500 } = req.body // Default penalty 500

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      })
    }

    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Get Razorpay instance
    const getRazorpayInstance = require('../../config/razorpay')
    const razorpay = getRazorpayInstance()

    // Amount in paise
    const amountInPaise = amount * 100

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `penalty_${user._id.toString().slice(-6)}_${Date.now()
        .toString()
        .slice(-6)}`,
      notes: {
        userId: user._id.toString(),
        email: email,
        type: 'penalty'
      }
    })

    res.json({
      success: true,
      message: 'Penalty payment order created',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      }
    })
  } catch (error) {
    console.error('Create penalty payment order error:', error)

    // Handle Razorpay configuration errors
    if (
      error.message &&
      error.message.includes('Razorpay configuration missing')
    ) {
      return res.status(500).json({
        success: false,
        message: 'Payment service is not configured. Please contact support.'
      })
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create payment order'
    })
  }
}

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
    } = req.body

    if (
      !email ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: 'All payment details are required'
      })
    }

    // Verify Razorpay signature
    const crypto = require('crypto')
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      })
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Unblock user and reset device ID
    user.isBlocked = false
    user.deviceId = null
    user.lastDeviceLogin = null
    await user.save()

    res.json({
      success: true,
      message: 'Penalty paid successfully. Account unblocked and device reset.'
    })
  } catch (error) {
    console.error('Verify penalty payment error:', error)
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    })
  }
}

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
    })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ message: 'Logout failed' })
  }
}

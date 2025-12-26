const User = require('../user/user.model');
const { generateAccessToken } = require('../../utils/jwt.utils');
const { addLiveUser, removeLiveUser } = require('../../utils/liveUsers.redis');

/**
 * LOGIN / REGISTER WITH MOBILE
 */
exports.login = async (req, res) => {
  try {
    const {
      mobile,
      fullName,
      email,
      whatsapp,
      profilePic,
      firebaseToken,
      activePlan,
      planExpiry
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
        planExpiry: planExpiry || null
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

      await user.save();
    }

    // 🚫 Block check
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true
      });
    }

    // 🔐 Generate JWT
    const accessToken = generateAccessToken({
      userId: user._id
    });

    // 🔴 Add user to Redis live users
    await addLiveUser(user._id);

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
      isRegistered,
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
 */
exports.logout = async (req, res) => {
  try {
    await removeLiveUser(req.user._id);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Logout failed' });
  }
};

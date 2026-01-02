const User = require('../user/user.model');
const Admin = require('./admin.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
// Redis disabled
// const { getLiveUsersCount } = require('../../utils/liveUsers.redis');
const UserSubscription = require('../subscription/subscription.model');
const ExcelJS = require('exceljs');



exports.blockUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBlocked: true },
    { new: true }
  );

  res.json({
    success: true,
    message: 'User blocked successfully',
    data: {
      userId: user._id,
      isBlocked: user.isBlocked
    }
  });
};

exports.unblockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isBlocked: false }, { new: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ 
      success: true,
      message: 'User unblocked successfully' 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET USER BY ID (ADMIN)
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('activePlan')
      .select('-__v');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get subscription expiry if activePlan exists
    let planExpiry = null;
    if (user.activePlan) {
      const subscription = await UserSubscription.findOne({ 
        userId: user._id, 
        isActive: true 
      });
      if (subscription) {
        planExpiry = subscription.expiryDate;
      }
    }

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        planExpiry
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * CREATE USER (ADMIN)
 */
exports.createUser = async (req, res) => {
  try {
    const { mobile, fullName, email, whatsapp, profilePic, firebaseToken } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this mobile number already exists' });
    }

    const user = await User.create({
      mobile,
      fullName,
      email,
      whatsapp,
      profilePic,
      firebaseToken,
      isBlocked: false
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'User with this mobile number already exists' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * UPDATE USER (ADMIN)
 */
exports.updateUser = async (req, res) => {
  try {
    const { fullName, email, whatsapp, profilePic, firebaseToken } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update only provided fields
    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) user.email = email;
    if (whatsapp !== undefined) user.whatsapp = whatsapp;
    if (profilePic !== undefined) user.profilePic = profilePic;
    if (firebaseToken !== undefined) user.firebaseToken = firebaseToken;

    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE USER (ADMIN)
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Also delete user's subscriptions
    await UserSubscription.deleteMany({ userId: req.params.id });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



/**
 * GET ALL USERS (ADMIN)
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();

    // Populate planExpiry from active subscriptions
    const usersWithExpiry = await Promise.all(
      users.map(async (user) => {
        if (user.activePlan) {
          const subscription = await UserSubscription.findOne({
            userId: user._id,
            isActive: true
          }).lean();
          
          if (subscription) {
            user.planExpiry = subscription.expiryDate;
          }
        }
        return user;
      })
    );

    res.json({
      count: usersWithExpiry.length,
      users: usersWithExpiry
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.createAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({ message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      email: email.toLowerCase(),
      password: hashedPassword
    });

    res.status(201).json({
      message: 'Admin created successfully',
      adminId: admin._id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};



/**
 * ADMIN LOGIN
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { adminId: admin._id, role: admin.role },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: '1d' }
  );

  res.json({
    message: 'Admin login successful',
    token,
    admin: {
      id: admin._id,
      email: admin.email,
      role: admin.role
    }
  });
};

// exports.getDashboardStats = async (req, res) => {
//   try {
//     const totalUsers = await User.countDocuments();
//     const blockedUsers = await User.countDocuments({ isBlocked: true });
//     const subscribedUsers = await User.countDocuments({
//       activePlan: { $ne: null }
//     });

//     res.json({
//       success: true,
//       data: {
//         totalUsers,
//         blockedUsers,
//         subscribedUsers,
//         unsubscribedUsers: totalUsers - subscribedUsers
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// };



exports.getUserAnalytics = async (req, res) => {
  const totalUsers = await User.countDocuments();
  const subscribedUsers = await User.countDocuments({ isSubscribed: true });
  const unsubscribedUsers = totalUsers - subscribedUsers;
  const blockedUsers = await User.countDocuments({ isBlocked: true });
  // Redis disabled - return 0 for liveUsers
  // const liveUsers = await getLiveUsersCount();
  const liveUsers = 0;

  res.json({
    success: true,
    data: {
      totalUsers,
      liveUsers,
      subscribedUsers,
      blockedUsers,
      unsubscribedUsers,
    },
  });
};



exports.getEarningsAnalytics = async (req, res) => {
  try {
    // 📅 Date helpers
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      1
    );

    // 🔹 TOTAL EARNINGS
    const totalEarningsAgg = await UserSubscription.aggregate([
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: '$plan' },
      {
        $group: {
          _id: null,
          total: { $sum: '$plan.discountedPrice' }
        }
      }
    ]);

    // 🔹 TODAY'S EARNINGS
    const todayEarningsAgg = await UserSubscription.aggregate([
      {
        $match: {
          createdAt: { $gte: todayStart }
        }
      },
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: '$plan' },
      {
        $group: {
          _id: null,
          total: { $sum: '$plan.discountedPrice' }
        }
      }
    ]);

    // 🔹 MONTHLY EARNINGS
    const monthlyEarningsAgg = await UserSubscription.aggregate([
      {
        $match: {
          createdAt: { $gte: monthStart }
        }
      },
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: '$plan' },
      {
        $group: {
          _id: null,
          total: { $sum: '$plan.discountedPrice' }
        }
      }
    ]);

    // 🔹 PLAN-WISE EARNINGS
    const planWiseEarnings = await UserSubscription.aggregate([
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: '$plan' },
      {
        $group: {
          _id: '$planId',
          planTitle: { $first: '$plan.title' },
          totalAmount: { $sum: '$plan.discountedPrice' },
          purchaseCount: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        todayEarnings: todayEarningsAgg[0]?.total || 0,
        monthlyEarnings: monthlyEarningsAgg[0]?.total || 0,
        totalEarnings: totalEarningsAgg[0]?.total || 0,
        planWiseEarnings
      }
    });

  } catch (error) {
    console.error('Earnings analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings analytics'
    });
  }
};


exports.getBestsellerPlans = async (req, res) => {
  try {
    const plansAgg = await UserSubscription.aggregate([
      // Join with Plan
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: '$plan' },

      // Group by plan
      {
        $group: {
          _id: '$planId',
          planTitle: { $first: '$plan.title' },
          durationInMonths: { $first: '$plan.durationInMonths' },
          price: { $first: '$plan.discountedPrice' },
          purchaseCount: { $sum: 1 }
        }
      },

      // Sort by highest purchases
      { $sort: { purchaseCount: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        bestsellerPlan: plansAgg[0] || null,
        topPlans: plansAgg
      }
    });

  } catch (error) {
    console.error('Bestseller analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bestseller plans'
    });
  }
};




exports.exportUsersExcel = async (req, res) => {
  try {
    const users = await User.find().lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Users');

    // Columns
    worksheet.columns = [
      { header: 'Mobile', key: 'mobile', width: 15 },
      { header: 'Full Name', key: 'fullName', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'WhatsApp', key: 'whatsapp', width: 15 },
      { header: 'Blocked', key: 'isBlocked', width: 10 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ];

    // Rows
    users.forEach(user => {
      worksheet.addRow({
        mobile: user.mobile,
        fullName: user.fullName,
        email: user.email,
        whatsapp: user.whatsapp,
        isBlocked: user.isBlocked ? 'Yes' : 'No',
        createdAt: user.createdAt
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=users.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({ message: 'Failed to export users' });
  }
};



exports.exportEarningsExcel = async (req, res) => {
  try {
    const { from, to } = req.query;

    const match = {};
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const earnings = await UserSubscription.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: '$plan' },
      {
        $project: {
          planTitle: '$plan.title',
          amount: '$plan.discountedPrice',
          startDate: 1,
          expiryDate: 1,
          createdAt: 1
        }
      }
    ]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Earnings');

    worksheet.columns = [
      { header: 'Plan', key: 'planTitle', width: 25 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Start Date', key: 'startDate', width: 20 },
      { header: 'Expiry Date', key: 'expiryDate', width: 20 },
      { header: 'Purchased At', key: 'createdAt', width: 20 }
    ];

    earnings.forEach(e => {
      worksheet.addRow(e);
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=earnings.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Export earnings error:', error);
    res.status(500).json({ message: 'Failed to export earnings' });
  }
};


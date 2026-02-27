const User = require('../user/user.model')
const Admin = require('./admin.model')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const xlsx = require('xlsx')
const Plan = require('../subscription/plan.model')
const Subscription = require('../subscription/subscription.model')
// const { sendBulkUserWelcomeMessage } = require('../../services/wati.service');
const { sendBulkUserResetMessage } = require('../../services/wati.service');
// Redis disabled
// const { getLiveUsersCount } = require('../../utils/liveUsers.redis');
const UserSubscription = require('../subscription/subscription.model')
const ExcelJS = require('exceljs')

exports.blockUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBlocked: true },
    { new: true }
  )

  res.json({
    success: true,
    message: 'User blocked successfully',
    data: {
      userId: user._id,
      isBlocked: user.isBlocked
    }
  })
}

exports.unblockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    )
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({
      success: true,
      message: 'User unblocked successfully'
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * RESET USER DEVICE (ADMIN)
 * Clears deviceId to allow user to login from a new device
 */
exports.resetUserDevice = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        deviceId: null,
        lastDeviceLogin: null,
        deviceChangeRequested: false,
        deviceChangeRequestedAt: null,
        isBlocked: false // Unblock user when resetting device
      },
      { new: true }
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({
      success: true,
      message:
        'User device reset successfully. User can now login from a new device.'
    })
  } catch (error) {
    console.error('Reset user device error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET DEVICE CONFLICTS
 * Get users who have device conflicts (users with deviceId set but potential conflicts)
 */
exports.getDeviceConflicts = async (req, res) => {
  try {
    // Find users who have deviceId set
    // Device conflicts can occur when:
    // 1. User has deviceId but hasn't logged in recently (potential abandoned device)
    // 2. Multiple users might be using same deviceId (rare but possible)

    const users = await User.find({
      deviceId: { $ne: null }
    })
      .select(
        '_id fullName email mobile deviceId lastDeviceLogin isBlocked createdAt'
      )
      .lean()

    if (!users || !Array.isArray(users)) {
      return res.json({
        success: true,
        count: 0,
        data: []
      })
    }

    // Filter out users with null or empty deviceId (in case query didn't work as expected)
    const usersWithDevices = users.filter(user => {
      try {
        if (!user || !user.deviceId) return false
        if (typeof user.deviceId !== 'string') return false
        return user.deviceId.trim() !== ''
      } catch (error) {
        console.error('Error filtering user:', error)
        return false
      }
    })

    // Check for potential conflicts
    const deviceMap = new Map()
    const conflicts = []

    usersWithDevices.forEach(user => {
      try {
        const deviceId = user.deviceId
        if (deviceId) {
          if (!deviceMap.has(deviceId)) {
            deviceMap.set(deviceId, [])
          }
          deviceMap.get(deviceId).push(user)
        }
      } catch (error) {
        console.error('Error processing user device:', error)
      }
    })

    // Find devices with multiple users (conflict)
    deviceMap.forEach((usersWithSameDevice, deviceId) => {
      if (usersWithSameDevice && usersWithSameDevice.length > 1) {
        conflicts.push({
          deviceId,
          users: usersWithSameDevice,
          conflictType: 'MULTIPLE_USERS'
        })
      }
    })

    // Also include users with old device logins (potential abandoned devices)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const abandonedDevices = usersWithDevices
      .filter(user => {
        try {
          if (!user.lastDeviceLogin) return true
          const lastLogin = new Date(user.lastDeviceLogin)
          if (isNaN(lastLogin.getTime())) return false // Invalid date
          return lastLogin < thirtyDaysAgo
        } catch (error) {
          // If date parsing fails, consider it abandoned
          return true
        }
      })
      .map(user => ({
        deviceId: user.deviceId,
        users: [user],
        conflictType: 'ABANDONED_DEVICE'
      }))

    // Include users with pending device change requests
    const deviceChangeRequests = await User.find({
      deviceChangeRequested: true
    })
      .select(
        '_id fullName email mobile deviceId lastDeviceLogin isBlocked deviceChangeRequestedAt createdAt'
      )
      .lean()

    const deviceChangeRequestConflicts = deviceChangeRequests.map(user => ({
      deviceId: user.deviceId || null,
      users: [user],
      conflictType: 'DEVICE_CHANGE_REQUESTED',
      requestedAt: user.deviceChangeRequestedAt
    }))

    const allConflicts = [
      ...conflicts,
      ...abandonedDevices,
      ...deviceChangeRequestConflicts
    ]

    res.json({
      success: true,
      count: allConflicts.length,
      data: allConflicts
    })
  } catch (error) {
    console.error('Get device conflicts error:', error)
    console.error('Error stack:', error.stack)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device conflicts',
      error: error.message || 'Unknown error'
    })
  }
}

/**
 * ALLOW NEW DEVICE FOR USER
 * Similar to resetUserDevice but with different naming
 */
exports.allowNewDevice = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        deviceId: null,
        lastDeviceLogin: null,
        deviceChangeRequested: false,
        deviceChangeRequestedAt: null,
        isBlocked: false // Unblock user when approving device change request
      },
      { new: true }
    )

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    res.json({
      success: true,
      message: 'New device allowed. User can now login from a new device.'
    })
  } catch (error) {
    console.error('Allow new device error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
}

/**
 * GET USER BY ID (ADMIN)
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('activePlan')
      .select('-__v')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Get subscription expiry if activePlan exists
    let planExpiry = null
    if (user.activePlan) {
      const subscription = await UserSubscription.findOne({
        userId: user._id,
        isActive: true
      })
      if (subscription) {
        planExpiry = subscription.expiryDate
      }
    }

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        planExpiry
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * CREATE USER (ADMIN)
 */
exports.createUser = async (req, res) => {
  try {
    const { mobile, fullName, email, whatsapp, profilePic, firebaseToken } =
      req.body

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ mobile })
    if (existingUser) {
      return res
        .status(409)
        .json({ message: 'User with this mobile number already exists' })
    }

    const user = await User.create({
      mobile,
      fullName,
      email,
      whatsapp,
      profilePic,
      firebaseToken,
      isBlocked: false
    })

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    })
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: 'User with this mobile number already exists' })
    }
    console.error('Create user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * UPDATE USER (ADMIN)
 */
exports.updateUser = async (req, res) => {
  try {
    const { fullName, email, whatsapp, profilePic, firebaseToken } = req.body

    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update only provided fields
    if (fullName !== undefined) user.fullName = fullName
    if (email !== undefined) user.email = email
    if (whatsapp !== undefined) user.whatsapp = whatsapp
    if (profilePic !== undefined) user.profilePic = profilePic
    if (firebaseToken !== undefined) user.firebaseToken = firebaseToken

    await user.save()

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * DELETE USER (ADMIN)
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Also delete user's subscriptions
    await UserSubscription.deleteMany({ userId: req.params.id })

    res.json({
      success: true,
      message: 'User deleted successfully'
    })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET ALL USERS (ADMIN) - Enhanced with filters and pagination
 */
exports.getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      isBlocked,
      hasActivePlan,
      planExpiryStart,
      planExpiryEnd,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query

    // Build query
    const query = {}

    // Filter by blocked status
    if (isBlocked !== undefined) {
      query.isBlocked = isBlocked === 'true' || isBlocked === true
    }

    // Search by name, email, or mobile
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ]
    }

    // Get all users matching filters (before pagination)
    let users = await User.find(query).select('-__v').lean()

    // Populate planExpiry and filter by subscription status
    const usersWithExpiry = await Promise.all(
      users.map(async user => {
        if (user.activePlan) {
          const subscription = await UserSubscription.findOne({
            userId: user._id,
            isActive: true
          }).lean()

          if (subscription) {
            user.planExpiry = subscription.expiryDate
            user.hasActivePlan = true
          } else {
            user.hasActivePlan = false
          }
        } else {
          user.hasActivePlan = false
        }
        return user
      })
    )

    // Filter by hasActivePlan
    let filteredUsers = usersWithExpiry
    if (hasActivePlan !== undefined) {
      const hasPlan = hasActivePlan === 'true' || hasActivePlan === true
      filteredUsers = usersWithExpiry.filter(
        user => user.hasActivePlan === hasPlan
      )
    }

    // Filter by plan expiry date range
    if (planExpiryStart || planExpiryEnd) {
      filteredUsers = filteredUsers.filter(user => {
        if (!user.planExpiry) return false
        const expiryDate = new Date(user.planExpiry)
        if (planExpiryStart && expiryDate < new Date(planExpiryStart))
          return false
        if (planExpiryEnd && expiryDate > new Date(planExpiryEnd)) return false
        return true
      })
    }

    // Sort users
    const sortOrder = order === 'asc' ? 1 : -1
    filteredUsers.sort((a, b) => {
      let aVal = a[sortBy]
      let bVal = b[sortBy]

      // Handle nested properties
      if (sortBy === 'planExpiry') {
        aVal = a.planExpiry ? new Date(a.planExpiry).getTime() : 0
        bVal = b.planExpiry ? new Date(b.planExpiry).getTime() : 0
      }

      if (aVal < bVal) return -1 * sortOrder
      if (aVal > bVal) return 1 * sortOrder
      return 0
    })

    // Pagination
    const totalCount = filteredUsers.length
    const totalPages = Math.ceil(totalCount / limit)
    const skip = (page - 1) * limit
    const paginatedUsers = filteredUsers.slice(skip, skip + parseInt(limit))

    res.json({
      success: true,
      count: totalCount,
      page: parseInt(page),
      totalPages,
      limit: parseInt(limit),
      users: paginatedUsers
    })
  } catch (error) {
    console.error('Get all users error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

exports.createAdmin = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' })
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() })
    if (existingAdmin) {
      return res.status(409).json({ message: 'Admin already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const admin = await Admin.create({
      email: email.toLowerCase(),
      password: hashedPassword
    })

    res.status(201).json({
      message: 'Admin created successfully',
      adminId: admin._id
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * ADMIN LOGIN
 */
exports.login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' })
  }

  const admin = await Admin.findOne({ email })
  if (!admin) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const isMatch = await admin.comparePassword(password)
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const token = jwt.sign(
    { adminId: admin._id, role: admin.role },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: '1d' }
  )

  res.json({
    message: 'Admin login successful',
    token,
    admin: {
      id: admin._id,
      email: admin.email,
      role: admin.role
    }
  })
}

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
  try {
    const totalUsers = await User.countDocuments()
    const blockedUsers = await User.countDocuments({ isBlocked: true })

    // Subscribed users: distinct users with at least one active subscription (isActive + not expired)
    const now = new Date()
    const subscribedUserIds = await UserSubscription.distinct('userId', {
      isActive: true,
      expiryDate: { $gt: now }
    })
    const subscribedUsers = subscribedUserIds.length
    const unsubscribedUsers = Math.max(0, totalUsers - subscribedUsers)

    // Live users (today): users active since start of current day
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const liveUsers = await User.countDocuments({
      lastActivity: { $gte: todayStart },
      isBlocked: false
    })

    res.json({
      success: true,
      data: {
        totalUsers,
        liveUsers,
        subscribedUsers,
        blockedUsers,
        unsubscribedUsers
      }
    })
  } catch (error) {
    console.error('Get user analytics error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user analytics'
    })
  }
}

exports.getEarningsAnalytics = async (req, res) => {
  try {
    // 📅 Date helpers
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const monthStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      1
    )

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
    ])

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
    ])

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
    ])

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
    ])

    res.json({
      success: true,
      data: {
        todayEarnings: todayEarningsAgg[0]?.total || 0,
        monthlyEarnings: monthlyEarningsAgg[0]?.total || 0,
        totalEarnings: totalEarningsAgg[0]?.total || 0,
        planWiseEarnings
      }
    })
  } catch (error) {
    console.error('Earnings analytics error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings analytics'
    })
  }
}

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
    ])

    res.json({
      success: true,
      data: {
        bestsellerPlan: plansAgg[0] || null,
        topPlans: plansAgg
      }
    })
  } catch (error) {
    console.error('Bestseller analytics error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bestseller plans'
    })
  }
}

exports.exportUsersExcel = async (req, res) => {
  try {
    const users = await User.find().lean()
    const userIds = users.map((u) => u._id)

    const activeSubscriptions = await UserSubscription.find({
      userId: { $in: userIds },
      isActive: true
    })
      .populate('planId', 'code durationInMonths')
      .lean()

    const subscriptionByUserId = new Map(
      activeSubscriptions.map((sub) => [String(sub.userId), sub])
    )

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Users')

    worksheet.columns = [
      { header: 'Full Name', key: 'fullName', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'WhatsApp', key: 'whatsapp', width: 15 },
      { header: 'Blocked', key: 'isBlocked', width: 10 },
      { header: 'Created At', key: 'createdAt', width: 20 },

      // 🔥 Bulk subscription columns
      { header: 'Plan Code', key: 'planCode', width: 15 },
      { header: 'Duration', key: 'duration', width: 12 }
    ]

    users.forEach(user => {
      const activeSub = subscriptionByUserId.get(String(user._id))
      const plan = activeSub?.planId

      worksheet.addRow({
        fullName: user.fullName,
        email: user.email,
        whatsapp: user.whatsapp,
        isBlocked: user.isBlocked ? 'Yes' : 'No',
        createdAt: user.createdAt,
        planCode: plan?.code || '',
        duration: plan?.durationInMonths ? `${plan.durationInMonths} month(s)` : ''
      })
    })

    // Optional: Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=users_bulk_subscription.xlsx'
    )

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Export users error:', error)
    res.status(500).json({ message: 'Failed to export users' })
  }
}

exports.exportEarningsExcel = async (req, res) => {
  try {
    const { from, to } = req.query

    const match = {}
    if (from || to) {
      match.createdAt = {}
      if (from) match.createdAt.$gte = new Date(from)
      if (to) match.createdAt.$lte = new Date(to)
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
    ])

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Earnings')

    worksheet.columns = [
      { header: 'Plan', key: 'planTitle', width: 25 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Start Date', key: 'startDate', width: 20 },
      { header: 'Expiry Date', key: 'expiryDate', width: 20 },
      { header: 'Purchased At', key: 'createdAt', width: 20 }
    ]

    earnings.forEach(e => {
      worksheet.addRow(e)
    })

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader('Content-Disposition', 'attachment; filename=earnings.xlsx')

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Export earnings error:', error)
    res.status(500).json({ message: 'Failed to export earnings' })
  }
}

exports.bulkAssignSubscription = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel file required' })
    }

    const workbook = xlsx.read(req.file.buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet)

    if (!rows.length) {
      return res.status(400).json({ message: 'Excel file is empty' })
    }

    const success = []
    const failed = []

    let rowNumber = 1

    for (const row of rows) {
      try {
        /* ===== NORMALIZE USER IDENTIFIER ===== */
        const email = row.Email ? String(row.Email).trim().toLowerCase() : null

        const mobile = row.Mobile ? String(row.Mobile).replace(/\D/g, '') : null

        if (!email && !mobile) {
          failed.push({
            rowNumber,
            email,
            mobile,
            reason: 'Email or Mobile required'
          })
          rowNumber++
          continue
        }

        /* ===== FIND USER ===== */
        const user = await User.findOne({
          $or: [email ? { email } : null, mobile ? { mobile } : null].filter(
            Boolean
          )
        })

        if (!user) {
          failed.push({
            rowNumber,
            email,
            mobile,
            reason: 'User not found'
          })
          rowNumber++
          continue
        }

        /* ===== PLAN CODE ===== */
        const planCode = row['Plan Code']
          ? String(row['Plan Code']).trim().toUpperCase()
          : null

        if (!planCode) {
          failed.push({
            rowNumber,
            email,
            mobile,
            reason: 'Plan Code missing'
          })
          rowNumber++
          continue
        }

        /* ===== FIND PLAN ===== */
        const plan = await Plan.findOne({
          code: planCode,
          isActive: true
        })

        if (!plan) {
          failed.push({
            rowNumber,
            email,
            mobile,
            planCode,
            reason: 'Plan not found or inactive'
          })
          rowNumber++
          continue
        }

        /* ===== DEACTIVATE OLD SUBSCRIPTIONS ===== */
        await UserSubscription.updateMany(
          { userId: user._id, isActive: true },
          { isActive: false }
        )

        /* ===== CALCULATE DATES ===== */
        const startDate = new Date()
        const expiryDate = new Date(startDate)
        expiryDate.setMonth(expiryDate.getMonth() + plan.durationInMonths)

        /* ===== CREATE SUBSCRIPTION ===== */
        const subscription = await UserSubscription.create({
          userId: user._id,
          planId: plan._id,
          startDate,
          expiryDate,
          isActive: true
        })

        /* ===== UPDATE USER ===== */
        await User.findByIdAndUpdate(user._id, {
          activePlan: subscription._id
        })

        success.push({
          rowNumber,
          userId: user._id,
          email,
          mobile,
          planCode,
          planName: plan.title,
          startDate,
          expiryDate
        })
      } catch (err) {
        failed.push({
          rowNumber,
          reason: err.message
        })
      }

      rowNumber++
    }

    return res.json({
      message: 'Bulk subscription processed',
      summary: {
        totalRows: rows.length,
        successCount: success.length,
        failedCount: failed.length
      },
      success,
      failed
    })
  } catch (error) {
    console.error('Bulk subscription error:', error)
    return res.status(500).json({ message: error.message })
  }
}

exports.bulkCreateUsers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel file required' });
    }

    const workbook = xlsx.read(req.file.buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return res.status(400).json({ message: 'Excel file is empty' });
    }

    const created = [];
    const skipped = [];
    const failed = [];

    let rowNumber = 1;

    for (const row of rows) {
      try {
        const fullName = row['Full Name']?.toString().trim();
        const email = row['Email']?.toString().trim().toLowerCase();
        const whatsappRaw = row['WhatsApp'] || row['Whatsapp'];
        let whatsapp = whatsappRaw?.toString().replace(/\D/g, '');
        const plainPassword = row['Password']?.toString();

        // Add India country code if missing
        if (whatsapp && !whatsapp.startsWith('91')) {
          whatsapp = '91' + whatsapp;
        }

        // Required validation
        if (!fullName || !email || !whatsapp || !plainPassword) {
          failed.push({
            rowNumber,
            reason: 'Full Name, Email, WhatsApp and Password are required'
          });
          rowNumber++;
          continue;
        }

        if (plainPassword.length < 8) {
          failed.push({
            rowNumber,
            email,
            whatsapp,
            reason: 'Password must be at least 8 characters'
          });
          rowNumber++;
          continue;
        }

        // Check duplicate
        const existingUser = await User.findOne({
          $or: [{ email }, { whatsapp }]
        });

        if (existingUser) {
          skipped.push({
            rowNumber,
            email,
            whatsapp,
            reason: 'User already exists'
          });
          rowNumber++;
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const user = await User.create({
          fullName,
          email,
          whatsapp,
          password: hashedPassword,
          isVerified: true
        });

        // ✅ Static Reset URL (as per your WATI template)
        const resetLink = `https://api.moneycrafttrader.com/reset-password`;

        // ✅ Send NEW WATI Template
        const whatsappResponse = await sendBulkUserResetMessage(
          whatsapp,
          fullName,
          email,
          resetLink
        );

        created.push({
          rowNumber,
          userId: user._id,
          email,
          whatsapp,
          resetLink,
          whatsappSent: whatsappResponse.success
        });

      } catch (err) {
        failed.push({
          rowNumber,
          reason: err.message
        });
      }

      rowNumber++;
    }

    return res.json({
      message: 'Bulk profile creation completed',
      summary: {
        totalRows: rows.length,
        created: created.length,
        skipped: skipped.length,
        failed: failed.length
      },
      created,
      skipped,
      failed
    });

  } catch (error) {
    console.error('Bulk user creation error:', error);
    return res.status(500).json({ message: error.message });
  }
};
// Controller lOad
const User = require('../user/user.model')
const Admin = require('./admin.model')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const xlsx = require('xlsx')
const Plan = require('../subscription/plan.model')
const Subscription = require('../subscription/subscription.model')
// const { sendBulkUserWelcomeMessage } = require('../../services/wati.service');
const { sendBulkUserResetMessage } = require('../../services/wati.service')
// Redis disabled
// const { getLiveUsersCount } = require('../../utils/liveUsers.redis');
const UserSubscription = require('../subscription/subscription.model')
const ExcelJS = require('exceljs')
const crypto = require('crypto')
const { normalizeWhatsappDigits } = require('../../utils/whatsappNormalize')
const Notification = require('../notification/notification.model')
const UserNotification = require('../notification/userNotification.model')
const {
  sendRegistrationDecisionEmail
} = require('../../services/email.service')

const normalizeSearchDigits = value =>
  String(value ?? '').replace(/\D/g, '')

const matchesSearchTerm = (value, searchTerm) => {
  if (value === null || value === undefined) return false

  if (Array.isArray(value)) {
    return value.some(item => matchesSearchTerm(item, searchTerm))
  }

  if (value instanceof Date) {
    return value.toString().toLowerCase().includes(searchTerm)
  }

  if (typeof value === 'object') {
    const stringValue = value.toString?.()
    if (
      stringValue &&
      stringValue !== '[object Object]' &&
      stringValue.toLowerCase().includes(searchTerm)
    ) {
      return true
    }

    return Object.values(value).some(item => matchesSearchTerm(item, searchTerm))
  }

  const stringValue = String(value).toLowerCase()
  if (stringValue.includes(searchTerm)) return true

  const valueDigits = normalizeSearchDigits(value)
  const searchDigits = normalizeSearchDigits(searchTerm)
  return Boolean(searchDigits) && valueDigits.includes(searchDigits)
}

const USER_SEARCH_FIELDS = [
  'fullName',
  'email',
  'mobile',
  'whatsapp',
  'deviceId',
  'profilePic',
  '_id',
  'createdAt',
  'updatedAt',
  'lastActivity',
  'lastDeviceLogin',
  'planExpiry',
  'hasActivePlan',
  'isBlocked',
  'firebaseTokens',
  'activePlan',
  'deviceChangeRequested',
  'deviceChangeRequestedAt',
  'passwordSet',
  'registrationStatus',
  'registrationRequestedAt',
  'registrationRejectionReason'
]

const userMatchesSearch = (user, searchTerm) =>
  USER_SEARCH_FIELDS.some(field => {
    const value = user[field]
    if (value === undefined || value === null) return false
    return matchesSearchTerm(value, searchTerm)
  })

const REGISTRATION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
}

const normalizeRegistrationStatus = user =>
  String(user?.registrationStatus || '').trim().toUpperCase()

const buildAdminUserResponse = user => {
  if (!user) return user
  return {
    ...user,
    registrationStatus: user.registrationStatus || REGISTRATION_STATUS.APPROVED
  }
}

const notifyRegistrationDecision = async ({
  user,
  adminId,
  decision,
  reason
}) => {
  const baseNotification = {
    createdBy: adminId
  }

  if (decision === REGISTRATION_STATUS.APPROVED) {
    const notification = await Notification.create({
      ...baseNotification,
      title: 'Registration Approved',
      message: 'Your registration has been approved. You can now log in.',
      type: 'ALERT',
      status: 'SENT'
    })

    await UserNotification.create({
      user: user._id,
      notification: notification._id,
      status: 'SENT'
    })
  }

  if (user.email) {
    try {
      if (user.email) {
        await sendRegistrationDecisionEmail({
          to: user.email,
          fullName: user.fullName,
          decision,
          reason
        })
      }
    } catch (emailError) {
      console.error('Registration decision email failed:', emailError)
    }
  }
}

const isUserLive = user => {
  if (user.isBlocked) return false
  if (normalizeRegistrationStatus(user) !== REGISTRATION_STATUS.APPROVED) return false
  const activityTime = user.lastActivity || user.lastDeviceLogin
  if (!activityTime) return false
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
  return new Date(activityTime) >= thirtyMinutesAgo
}

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

exports.getPendingRegistrations = async (req, res) => {
  try {
    const users = await User.find({
      registrationStatus: REGISTRATION_STATUS.PENDING
    })
      .select('-password -__v')
      .sort({ createdAt: -1 })
      .lean()

    res.json({
      success: true,
      total: users.length,
      data: users.map(buildAdminUserResponse)
    })
  } catch (error) {
    console.error('Get pending registrations error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

exports.approveRegistration = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -__v')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (normalizeRegistrationStatus(user) === REGISTRATION_STATUS.APPROVED) {
      return res.json({
        success: true,
        message: 'Registration already approved',
        data: buildAdminUserResponse(user.toObject())
      })
    }

    user.registrationStatus = REGISTRATION_STATUS.APPROVED
    user.registrationReviewedAt = new Date()
    user.registrationReviewedBy = req.admin._id
    user.registrationRejectionReason = null
    user.isBlocked = false
    await user.save()

    await notifyRegistrationDecision({
      user,
      adminId: req.admin._id,
      decision: REGISTRATION_STATUS.APPROVED
    })

    res.json({
      success: true,
      message: 'Registration approved successfully',
      data: buildAdminUserResponse(user.toObject())
    })
  } catch (error) {
    console.error('Approve registration error:', error)
    res.status(500).json({ message: 'Server error' })
  }
}

exports.rejectRegistration = async (req, res) => {
  try {
    const { reason } = req.body
    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (normalizeRegistrationStatus(user) === REGISTRATION_STATUS.REJECTED) {
      return res.json({
        success: true,
        message: 'Registration already rejected'
      })
    }

    await notifyRegistrationDecision({
      user,
      adminId: req.admin._id,
      decision: REGISTRATION_STATUS.REJECTED,
      reason
    })

    await UserSubscription.deleteMany({ userId: user._id })
    await UserNotification.deleteMany({ user: user._id })
    await User.deleteOne({ _id: user._id })

    res.json({
      success: true,
      message: 'Registration rejected successfully'
    })
  } catch (error) {
    console.error('Reject registration error:', error)
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

    const passwordSet = Boolean(user.password && String(user.password).length > 0)

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

    const userObj = user.toObject()
    delete userObj.password

    res.json({
      success: true,
      data: {
        ...userObj,
        planExpiry,
        passwordSet
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
    const {
      mobile,
      fullName,
      email,
      whatsapp,
      profilePic,
      firebaseToken,
      password
    } = req.body

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' })
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required' })
    }
    const trimmedPassword = password.trim()
    if (trimmedPassword.length < 8) {
      return res
        .status(400)
        .json({ message: 'Password must be at least 8 characters long' })
    }
    if (trimmedPassword.length > 128) {
      return res
        .status(400)
        .json({ message: 'Password must be at most 128 characters long' })
    }

    const formattedEmail =
      email !== undefined && email !== null
        ? String(email).trim().toLowerCase()
        : ''
    if (!formattedEmail) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const normalizedWhatsapp = normalizeWhatsappDigits(whatsapp)

    const existingMobile = await User.findOne({ mobile })
    if (existingMobile) {
      return res
        .status(409)
        .json({ message: 'User with this mobile number already exists' })
    }

    const existingEmail = await User.findOne({ email: formattedEmail })
    if (existingEmail) {
      return res
        .status(409)
        .json({ message: 'User with this email already exists' })
    }

    if (normalizedWhatsapp) {
      const existingWa = await User.findOne({ whatsapp: normalizedWhatsapp })
      if (existingWa) {
        return res.status(409).json({
          message: 'User with this WhatsApp number already exists'
        })
      }
    }

    const hashedPassword = await bcrypt.hash(trimmedPassword, 10)

    const user = await User.create({
      mobile,
      fullName,
      email: formattedEmail,
      whatsapp: normalizedWhatsapp,
      profilePic,
      firebaseToken,
      password: hashedPassword,
      isBlocked: false,
      registrationStatus: 'approved'
    })

    const created = await User.findById(user._id).select('-password -__v').lean()

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: created
    })
  } catch (error) {
    if (error.code === 11000) {
      const key = error.keyPattern ? Object.keys(error.keyPattern)[0] : null
      if (key === 'email') {
        return res
          .status(409)
          .json({ message: 'User with this email already exists' })
      }
      if (key === 'whatsapp') {
        return res.status(409).json({
          message: 'User with this WhatsApp number already exists'
        })
      }
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
    const { fullName, email, whatsapp, profilePic, firebaseToken, password } =
      req.body

    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update only provided fields
    if (fullName !== undefined) user.fullName = fullName

    if (email !== undefined) {
      const formattedEmail = String(email).trim().toLowerCase()
      if (!formattedEmail) {
        return res.status(400).json({ message: 'Email cannot be empty' })
      }
      const existingEmail = await User.findOne({
        email: formattedEmail,
        _id: { $ne: user._id }
      })
      if (existingEmail) {
        return res
          .status(409)
          .json({ message: 'User with this email already exists' })
      }
      user.email = formattedEmail
    }

    if (whatsapp !== undefined) {
      const normalized =
        whatsapp === null || String(whatsapp).trim() === ''
          ? undefined
          : normalizeWhatsappDigits(whatsapp)
      if (normalized) {
        const existingWa = await User.findOne({
          whatsapp: normalized,
          _id: { $ne: user._id }
        })
        if (existingWa) {
          return res.status(409).json({
            message: 'User with this WhatsApp number already exists'
          })
        }
      }
      user.whatsapp = normalized
    }

    if (profilePic !== undefined) user.profilePic = profilePic
    if (firebaseToken !== undefined) user.firebaseToken = firebaseToken

    if (password !== undefined && password !== null) {
      if (typeof password !== 'string' || !password.trim()) {
        return res
          .status(400)
          .json({ message: 'Password cannot be empty when provided' })
      }
      const trimmedPassword = password.trim()
      if (trimmedPassword.length < 8) {
        return res
          .status(400)
          .json({ message: 'Password must be at least 8 characters long' })
      }
      if (trimmedPassword.length > 128) {
        return res
          .status(400)
          .json({ message: 'Password must be at most 128 characters long' })
      }
      user.password = await bcrypt.hash(trimmedPassword, 10)
    }

    await user.save()

    const passwordSet = Boolean(user.password && String(user.password).length > 0)
    const safe = await User.findById(user._id).select('-password -__v').lean()

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        ...safe,
        passwordSet
      }
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
      limit,
      search,
      isBlocked,
      hasActivePlan,
      status,
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

    // Get all users matching filters (before pagination)
    let users = await User.find(query).select('-__v').lean()
    users = users.map(user => {
      user.passwordSet = Boolean(user.password && String(user.password).length > 0)
      delete user.password
      return user
    })

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

    if (status) {
      const normalizedStatus = String(status).trim().toLowerCase()

      if (normalizedStatus === 'blocked') {
        filteredUsers = filteredUsers.filter(user => user.isBlocked === true)
      } else if (normalizedStatus === 'subscribed') {
        filteredUsers = filteredUsers.filter(
          user => user.isBlocked !== true && user.hasActivePlan === true
        )
      } else if (normalizedStatus === 'unsubscribed') {
        filteredUsers = filteredUsers.filter(
          user => user.isBlocked !== true && user.hasActivePlan === false
        )
      } else if (normalizedStatus === 'live') {
        filteredUsers = filteredUsers.filter(user => isUserLive(user))
      } else if (normalizedStatus === 'pending') {
        filteredUsers = filteredUsers.filter(
          user =>
            user.registrationStatus === 'pending' && user.passwordSet === true
        )
      } else if (normalizedStatus === 'rejected') {
        filteredUsers = filteredUsers.filter(
          user => user.registrationStatus === 'rejected'
        )
      } else if (normalizedStatus !== 'all') {
        return res.status(400).json({
          success: false,
          message:
            "Invalid status filter. Use 'blocked', 'subscribed', 'unsubscribed', 'live', 'pending', 'rejected', or 'all'."
        })
      }
    }

    // Search across admin-meaningful user fields and derived plan fields
    if (search) {
      const searchTerm = String(search).trim().toLowerCase()
      if (searchTerm) {
        filteredUsers = filteredUsers.filter(user =>
          userMatchesSearch(user, searchTerm)
        )
      }
    }

    if (hasActivePlan !== undefined) {
      const hasPlan = hasActivePlan === 'true' || hasActivePlan === true
      filteredUsers = filteredUsers.filter(
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

    // Pagination is optional. If no limit is provided, return all matching users.
    const totalCount = filteredUsers.length
    const limitNum = limit !== undefined ? parseInt(limit) : null
    const pageNum = parseInt(page)
    const totalPages = limitNum ? Math.ceil(totalCount / limitNum) : 1
    const skip = limitNum ? (pageNum - 1) * limitNum : 0
    const usersToReturn = limitNum
      ? filteredUsers.slice(skip, skip + limitNum)
      : filteredUsers

    res.json({
      success: true,
      count: totalCount,
      page: pageNum,
      totalPages,
      limit: limitNum,
      users: usersToReturn
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
    const users = await User.find().select('-password').lean()
    const userIds = users.map(u => u._id)

    const activeSubscriptions = await UserSubscription.find({
      userId: { $in: userIds },
      isActive: true
    })
      .populate('planId', 'code durationInMonths')
      .lean()

    const subscriptionByUserId = new Map(
      activeSubscriptions.map(sub => [String(sub.userId), sub])
    )

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Users')

    worksheet.columns = [
      { header: 'Full Name', key: 'fullName', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'WhatsApp', key: 'whatsapp', width: 15 },
      { header: 'Mobile', key: 'mobile', width: 15 },
      { header: 'Password', key: 'password', width: 20 },
      { header: 'Blocked', key: 'isBlocked', width: 10 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Plan Code', key: 'planCode', width: 15 },
      { header: 'Duration', key: 'duration', width: 12 }
    ]

    users.forEach(user => {
      const activeSub = subscriptionByUserId.get(String(user._id))
      const plan = activeSub?.planId
      const mobileForSubscription = user.mobile || user.whatsapp || ''

      worksheet.addRow({
        fullName: user.fullName,
        email: user.email,
        whatsapp: user.whatsapp,
        mobile: mobileForSubscription,
        password: '',
        isBlocked: user.isBlocked ? 'Yes' : 'No',
        createdAt: user.createdAt,
        planCode: plan?.code || '',
        duration: plan?.durationInMonths
          ? `${plan.durationInMonths} month(s)`
          : ''
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

        const mobileRaw = row.Mobile || row.WhatsApp || row.Whatsapp
        const mobile = mobileRaw ? String(mobileRaw).replace(/\D/g, '') : null

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

exports.bulkRemoveSubscription = async (req, res) => {
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
        const email = row.Email ? String(row.Email).trim().toLowerCase() : null
        const mobileRaw = row.Mobile || row.WhatsApp || row.Whatsapp
        const mobile = mobileRaw ? String(mobileRaw).replace(/\D/g, '') : null

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

        const activeSubscription = await UserSubscription.findOne({
          userId: user._id,
          isActive: true
        })

        if (!activeSubscription) {
          failed.push({
            rowNumber,
            email,
            mobile,
            userId: user._id,
            reason: 'No active subscription found'
          })
          rowNumber++
          continue
        }

        await UserSubscription.updateMany(
          { userId: user._id, isActive: true },
          { isActive: false }
        )

        await User.findByIdAndUpdate(user._id, {
          activePlan: null
        })

        success.push({
          rowNumber,
          userId: user._id,
          email,
          mobile,
          removedSubscriptionId: activeSubscription._id,
          planId: activeSubscription.planId
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
      message: 'Bulk subscription removal processed',
      summary: {
        totalRows: rows.length,
        successCount: success.length,
        failedCount: failed.length
      },
      success,
      failed
    })
  } catch (error) {
    console.error('Bulk subscription removal error:', error)
    return res.status(500).json({ message: error.message })
  }
}

// exports.bulkCreateUsers = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'Excel file required' })
//     }

//     const workbook = xlsx.read(req.file.buffer)
//     const sheet = workbook.Sheets[workbook.SheetNames[0]]
//     const rows = xlsx.utils.sheet_to_json(sheet)

//     if (!rows.length) {
//       return res.status(400).json({ message: 'Excel file is empty' })
//     }

//     const created = []
//     const skipped = []
//     const failed = []

//     let rowNumber = 1

//     for (const row of rows) {
//       try {
//         const fullName = row['Full Name']?.toString().trim()
//         const email = row['Email'] || row['EMAIL'] || row['email']
//         const formattedEmail = email?.toString().trim().toLowerCase()
//         const whatsappRaw = row['WhatsApp'] || row['Whatsapp']
//         let whatsapp = whatsappRaw?.toString().replace(/\D/g, '')
//         const plainPassword = row['Password']?.toString()

//         // Add India country code if missing
//         if (whatsapp && !whatsapp.startsWith('91')) {
//           whatsapp = '91' + whatsapp
//         }

//         // Required validation
//         if (!fullName || !email || !whatsapp || !plainPassword) {
//           failed.push({
//             rowNumber,
//             reason: 'Full Name, Email, WhatsApp and Password are required'
//           })
//           rowNumber++
//           continue
//         }

//         if (plainPassword.length < 8) {
//           failed.push({
//             rowNumber,
//             email,
//             whatsapp,
//             reason: 'Password must be at least 8 characters'
//           })
//           rowNumber++
//           continue
//         }

//         // Check duplicate
//         const existingUser = await User.findOne({
//           $or: [{ email }, { whatsapp }]
//         })

//         if (existingUser) {
//           skipped.push({
//             rowNumber,
//             email,
//             whatsapp,
//             reason: 'User already exists'
//           })
//           rowNumber++
//           continue
//         }

//         // Hash password
//         const hashedPassword = await bcrypt.hash(plainPassword, 10)

//         const user = await User.create({
//           fullName,
//           email,
//           whatsapp,
//           password: hashedPassword,
//           isVerified: true
//         })

//         // // ✅ Static Reset URL (as per your WATI template)
//         // const resetLink = `https://api.moneycrafttrader.com/reset-password`
//         // console.log('Sending WATI:', {
//         //   fullName,
//         //   email,
//         //   resetLink
//         // })

//         // Generate secure token
//         const resetToken = crypto.randomBytes(32).toString('hex')

//         // Hash token before saving (security best practice)
//         const hashedToken = crypto
//           .createHash('sha256')
//           .update(resetToken)
//           .digest('hex')

//         // Save token + expiry (15 minutes)
//         user.resetPasswordToken = hashedToken
//         user.resetPasswordExpire = Date.now() + 15 * 60 * 1000
//         await user.save()

//         // Dynamic reset URL (this goes to WATI button {{3}})
//         const resetLink = `https://api.moneycrafttrader.com/reset-password/${resetToken}`

//         // ✅ Send NEW WATI Template
//         const whatsappResponse = await sendBulkUserResetMessage(
//           whatsapp,
//           fullName,
//           email,
//           resetLink
//           // resetToken
//         )

//         created.push({
//           rowNumber,
//           userId: user._id,
//           email,
//           whatsapp,
//           resetLink,
//           whatsappSent: whatsappResponse.success
//         })
//       } catch (err) {
//         failed.push({
//           rowNumber,
//           reason: err.message
//         })
//       }

//       rowNumber++
//     }

//     return res.json({
//       message: 'Bulk profile creation completed',
//       summary: {
//         totalRows: rows.length,
//         created: created.length,
//         skipped: skipped.length,
//         failed: failed.length
//       },
//       created,
//       skipped,
//       failed
//     })
//   } catch (error) {
//     console.error('Bulk user creation error:', error)
//     return res.status(500).json({ message: error.message })
//   }
// }

// exports.bulkCreateUsers = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'Excel file required' })
//     }

//     const workbook = xlsx.read(req.file.buffer)
//     const sheet = workbook.Sheets[workbook.SheetNames[0]]
//     const rows = xlsx.utils.sheet_to_json(sheet)

//     if (!rows.length) {
//       return res.status(400).json({ message: 'Excel file is empty' })
//     }

//     const created = []
//     const skipped = []
//     const failed = []

//     let rowNumber = 1

//     for (const row of rows) {
//       try {
//         const fullName = row['Full Name']?.toString().trim()
//         const emailRaw = row['Email'] || row['EMAIL'] || row['email']
//         const formattedEmail = emailRaw?.toString().trim().toLowerCase()

//         const whatsappRaw = row['WhatsApp'] || row['Whatsapp']
//         let whatsapp = whatsappRaw?.toString().replace(/\D/g, '')

//         const plainPassword = row['Password']?.toString()

//         // Add India country code if missing
//         if (whatsapp && !whatsapp.startsWith('91')) {
//           whatsapp = '91' + whatsapp
//         }

//         // Required validation
//         if (!fullName || !formattedEmail || !whatsapp || !plainPassword) {
//           failed.push({
//             rowNumber,
//             reason: 'Full Name, Email, WhatsApp and Password are required'
//           })
//           rowNumber++
//           continue
//         }

//         if (plainPassword.length < 8) {
//           failed.push({
//             rowNumber,
//             email: formattedEmail,
//             whatsapp,
//             reason: 'Password must be at least 8 characters'
//           })
//           rowNumber++
//           continue
//         }

//         // Check duplicate using formatted email
//         const existingUser = await User.findOne({
//           $or: [{ email: formattedEmail }, { whatsapp }]
//         })

//         if (existingUser) {
//           skipped.push({
//             rowNumber,
//             email: formattedEmail,
//             whatsapp,
//             reason: 'User already exists'
//           })
//           rowNumber++
//           continue
//         }

//         // Hash password
//         const hashedPassword = await bcrypt.hash(plainPassword, 10)

//         // Generate secure reset token
//         const resetToken = crypto.randomBytes(32).toString('hex')

//         const hashedToken = crypto
//           .createHash('sha256')
//           .update(resetToken)
//           .digest('hex')

//         // Create user with reset token directly (single save)
//         const user = await User.create({
//           fullName,
//           email: formattedEmail,
//           whatsapp,
//           password: hashedPassword,
//           isVerified: true,
//           resetPasswordToken: hashedToken,
//           resetPasswordExpire: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
//         })

//         // const resetLink = `https://api.moneycrafttrader.com/reset-password/${resetToken}`;
//         const BASE_URL = process.env.BASE_URL

//         const resetLink = `${BASE_URL}/reset-password/${resetToken}`

//         // Send WATI template
//         const whatsappResponse = await sendBulkUserResetMessage(
//           whatsapp,
//           fullName,
//           formattedEmail,
//           resetLink
//         )

//         created.push({
//           rowNumber,
//           userId: user._id,
//           email: formattedEmail,
//           whatsapp,
//           resetLink,
//           whatsappSent: whatsappResponse?.success || false
//         })
//       } catch (err) {
//         failed.push({
//           rowNumber,
//           reason: err.message
//         })
//       }

//       rowNumber++
//     }

//     return res.json({
//       message: 'Bulk profile creation completed',
//       summary: {
//         totalRows: rows.length,
//         created: created.length,
//         skipped: skipped.length,
//         failed: failed.length
//       },
//       created,
//       skipped,
//       failed
//     })
//   } catch (error) {
//     console.error('Bulk user creation error:', error)
//     return res.status(500).json({ message: error.message })
//   }
// }



// exports.bulkCreateUsers = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'Excel file required' });
//     }

//     const workbook = xlsx.read(req.file.buffer);
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const rows = xlsx.utils.sheet_to_json(sheet);

//     if (!rows.length) {
//       return res.status(400).json({ message: 'Excel file is empty' });
//     }

//     const created = [];
//     const skipped = [];
//     const failed = [];

//     const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

//     let rowNumber = 1;

//     for (const row of rows) {
//       try {
//         const fullName = row['Full Name']?.toString().trim();
//         const emailRaw = row['Email'] || row['EMAIL'] || row['email'];
//         const formattedEmail = emailRaw?.toString().trim().toLowerCase();

//         const whatsappRaw = row['WhatsApp'] || row['Whatsapp'];
//         let whatsapp = whatsappRaw?.toString().replace(/\D/g, '');

//         const plainPassword = row['Password']?.toString();

//         if (whatsapp && !whatsapp.startsWith('91')) {
//           whatsapp = '91' + whatsapp;
//         }

//         // Required validation
//         if (!fullName || !formattedEmail || !whatsapp || !plainPassword) {
//           failed.push({
//             rowNumber,
//             reason: 'Full Name, Email, WhatsApp and Password are required'
//           });
//           rowNumber++;
//           continue;
//         }

//         if (plainPassword.length < 8) {
//           failed.push({
//             rowNumber,
//             email: formattedEmail,
//             reason: 'Password must be at least 8 characters'
//           });
//           rowNumber++;
//           continue;
//         }

//         const existingUser = await User.findOne({
//           $or: [{ email: formattedEmail }, { whatsapp }]
//         });

//         if (existingUser) {
//           skipped.push({
//             rowNumber,
//             email: formattedEmail,
//             reason: 'User already exists'
//           });
//           rowNumber++;
//           continue;
//         }

//         // Hash password
//         const hashedPassword = await bcrypt.hash(plainPassword, 10);

//         // ✅ Create user WITHOUT token fields
//         const user = await User.create({
//           fullName,
//           email: formattedEmail,
//           whatsapp,
//           password: hashedPassword,
//           isVerified: true
//         });

//         // ✅ Email-based reset link
//         const resetLink = `${BASE_URL}/reset-password?email=${formattedEmail}`;

//         // Send WhatsApp message
//         const whatsappResponse = await sendBulkUserResetMessage(
//           whatsapp,
//           fullName,
//           formattedEmail,
//           resetLink
//         );

//         created.push({
//           rowNumber,
//           userId: user._id,
//           email: formattedEmail,
//           whatsapp,
//           resetLink,
//           whatsappSent: whatsappResponse?.success || false
//         });

//       } catch (err) {
//         failed.push({
//           rowNumber,
//           reason: err.message
//         });
//       }

//       rowNumber++;
//     }

//     return res.json({
//       message: 'Bulk profile creation completed',
//       summary: {
//         totalRows: rows.length,
//         created: created.length,
//         skipped: skipped.length,
//         failed: failed.length
//       },
//       created,
//       skipped,
//       failed
//     });

//   } catch (error) {
//     console.error('Bulk user creation error:', error);
//     return res.status(500).json({ message: error.message });
//   }
// };


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

    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

    let rowNumber = 1;

    for (const row of rows) {
      try {
        const fullName = row['Full Name']?.toString().trim();
        const emailRaw = row['Email'] || row['EMAIL'] || row['email'];
        const formattedEmail = emailRaw?.toString().trim().toLowerCase();

        const whatsappRaw = row['WhatsApp'] || row['Whatsapp'];
        const whatsapp = normalizeWhatsappDigits(whatsappRaw);

        const plainPassword = row['Password']?.toString();

        // Required validation
        if (!fullName || !formattedEmail || !whatsapp || !plainPassword) {
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
            email: formattedEmail,
            reason: 'Password must be at least 8 characters'
          });
          rowNumber++;
          continue;
        }

        // Check existing user
        const existingUser = await User.findOne({
          $or: [{ email: formattedEmail }, { whatsapp }]
        });

        if (existingUser) {
          skipped.push({
            rowNumber,
            email: formattedEmail,
            reason: 'User already exists'
          });
          rowNumber++;
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Create user
        const user = await User.create({
          fullName,
          email: formattedEmail,
          whatsapp,
          password: hashedPassword,
          registrationStatus: 'approved'
        });

        // Reset link (for API response only)
        const resetLink = `${BASE_URL}/reset-password?email=${formattedEmail}`;

        // Send WhatsApp template
        const whatsappResponse = await sendBulkUserResetMessage(
          whatsapp,
          fullName,
          formattedEmail   
        );

        created.push({
          rowNumber,
          userId: user._id,
          email: formattedEmail,
          whatsapp,
          resetLink,
          whatsappSent: whatsappResponse?.success || false
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

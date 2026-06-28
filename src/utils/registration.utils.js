const REGISTRATION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
}

const normalizeRegistrationStatus = user =>
  String(user?.registrationStatus || REGISTRATION_STATUS.APPROVED)
    .trim()
    .toUpperCase()

const isRegistrationComplete = user => Boolean(user?.password)

const isApproved = user =>
  normalizeRegistrationStatus(user) === REGISTRATION_STATUS.APPROVED

const isPending = user =>
  normalizeRegistrationStatus(user) === REGISTRATION_STATUS.PENDING

const isRejected = user =>
  normalizeRegistrationStatus(user) === REGISTRATION_STATUS.REJECTED

const clearRejectionMetadata = user => {
  user.registrationRejectionReason = null
  user.registrationReviewedAt = null
  user.registrationReviewedBy = null
}

const buildUserAuthResponse = (user, baseUrl) => ({
  _id: user._id,
  mobile: user.mobile,
  fullName: user.fullName,
  email: user.email,
  whatsapp: user.whatsapp,
  firebaseToken: user.firebaseToken,
  isBlocked: user.isBlocked,
  registrationStatus: normalizeRegistrationStatus(user),
  registrationRequestedAt: user.registrationRequestedAt || null,
  activePlan: user.activePlan,
  planExpiry: user.planExpiry,
  deviceChangeRequested: user.deviceChangeRequested,
  deviceChangeRequestedAt: user.deviceChangeRequestedAt,
  profilePic: user.profilePic ? `${baseUrl}/api/users/${user._id}` : null
})

const getLoginAuthBlock = user => {
  if (user.isBlocked) {
    return {
      blocked: true,
      status: 403,
      body: {
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      }
    }
  }

  if (isRejected(user)) {
    return {
      blocked: true,
      status: 403,
      body: {
        message:
          'Your registration was not approved. Check your email for details.',
        isRejected: true,
        registrationStatus: REGISTRATION_STATUS.REJECTED
      }
    }
  }

  if (isPending(user) && isRegistrationComplete(user)) {
    return {
      blocked: true,
      status: 403,
      body: {
        message:
          'Your account is not approved yet. Please wait for admin approval.',
        isPendingApproval: true,
        registrationStatus: REGISTRATION_STATUS.PENDING
      }
    }
  }

  if (!isApproved(user)) {
    return {
      blocked: true,
      status: 403,
      body: {
        message:
          'Your account is not approved yet. Please wait for admin approval.',
        isPendingApproval: true,
        registrationStatus: REGISTRATION_STATUS.PENDING
      }
    }
  }

  return { blocked: false }
}

const canIssueRegistrationToken = user => {
  if (user.isBlocked) {
    return {
      allowed: false,
      status: 403,
      body: {
        message: 'Your account has been blocked. Contact admin.',
        isBlocked: true,
        isDeviceMismatch: false
      }
    }
  }

  if (isApproved(user)) {
    return { allowed: true, mode: 'login' }
  }

  if (isPending(user) && isRegistrationComplete(user)) {
    return {
      allowed: false,
      status: 403,
      body: {
        message:
          'Your account is not approved yet. Please wait for admin approval.',
        isPendingApproval: true,
        registrationStatus: REGISTRATION_STATUS.PENDING
      }
    }
  }

  return { allowed: true, mode: 'registration' }
}

const isRegistrationWhitelistedRoute = req => {
  const path = String(req.path || '')
  return (
    path === '/complete-registration' ||
    path.endsWith('/complete-registration') ||
    path === '/logout' ||
    path.endsWith('/logout')
  )
}

module.exports = {
  REGISTRATION_STATUS,
  normalizeRegistrationStatus,
  isRegistrationComplete,
  isApproved,
  isPending,
  isRejected,
  clearRejectionMetadata,
  buildUserAuthResponse,
  getLoginAuthBlock,
  canIssueRegistrationToken,
  isRegistrationWhitelistedRoute
}

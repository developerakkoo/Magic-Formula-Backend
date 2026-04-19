const Plan = require('./plan.model')
const User = require('../user/user.model')
const UserSubscription = require('./subscription.model')
const Settings = require('../settings/settings.model')

const STARTER_PLAN_CODE = 'STARTER_1RS'

/**
 * ISO date string in env; if unset, any user who never bought starter may see it (local dev).
 * If set, only users with createdAt >= this instant are eligible (self-serve only).
 */
function getStarterOfferSinceDate () {
  const raw = process.env.STARTER_OFFER_SINCE
  if (!raw || !String(raw).trim()) return null
  const d = new Date(String(raw).trim())
  return Number.isNaN(d.getTime()) ? null : d
}

function planDocIsStarter (plan) {
  if (!plan) return false
  return plan.isStarterOffer === true || plan.code === STARTER_PLAN_CODE
}

async function getStarterPlan () {
  let p = await Plan.findOne({ code: STARTER_PLAN_CODE, isActive: true })
  if (p) return p
  return Plan.findOne({ isStarterOffer: true, isActive: true })
}

async function userHasEverHadStarterSubscription (userId, starterPlanId) {
  if (!starterPlanId) return false
  const uid = userId?._id || userId
  return UserSubscription.exists({ userId: uid, planId: starterPlanId })
}

function userIsEligibleBySignupDate (user) {
  const since = getStarterOfferSinceDate()
  if (!since) return true
  const created = user?.createdAt ? new Date(user.createdAt) : null
  if (!created || Number.isNaN(created.getTime())) return false
  return created >= since
}

async function isStarterVisibleToUsers () {
  const settings = await Settings.getSettings()
  return settings.starterOfferVisibleToUsers !== false
}

/**
 * Starter row should appear in user app catalog for this user.
 */
async function shouldListStarterPlanForUser (user) {
  const starter = await getStarterPlan()
  if (!starter) return false
  if (!(await isStarterVisibleToUsers())) return false
  if (!userIsEligibleBySignupDate(user)) return false
  const uid = user._id || user.id
  const consumed = await userHasEverHadStarterSubscription(uid, starter._id)
  return !consumed
}

/**
 * @param {object} options
 * @param {boolean} [options.forSelfServePurchase=true] Razorpay paths: enforce signup date + global visibility. Admin assign: false skips signup date and visibility; still blocks if user already consumed this starter planId.
 */
async function assertUserMayPurchaseStarter (userId, plan, options = {}) {
  const forSelfServePurchase = options.forSelfServePurchase !== false
  if (!planDocIsStarter(plan)) return

  const starter = await getStarterPlan()
  if (!starter || String(starter._id) !== String(plan._id)) {
    return
  }

  const user = await User.findById(userId).select('createdAt')
  if (!user) {
    const err = new Error('User not found')
    err.statusCode = 400
    throw err
  }

  if (forSelfServePurchase) {
    if (!(await isStarterVisibleToUsers())) {
      const err = new Error('Intro offer is not available at the moment.')
      err.statusCode = 400
      throw err
    }
    if (!userIsEligibleBySignupDate(user)) {
      const err = new Error('This introductory offer is only for new accounts.')
      err.statusCode = 400
      throw err
    }
  }

  const consumed = await userHasEverHadStarterSubscription(userId, starter._id)
  if (consumed) {
    const err = new Error('The one-time introductory plan is no longer available for your account.')
    err.statusCode = 400
    throw err
  }
}

/**
 * Reject creating a second active starter-marked plan (ambiguous getStarterPlan resolution).
 * @param {import('mongoose').Types.ObjectId|string|null} excludePlanId plan _id to exclude (updates)
 */
async function assertNoConflictingActiveStarterPlan (excludePlanId = null) {
  const q = { isStarterOffer: true, isActive: true }
  if (excludePlanId) {
    q._id = { $ne: excludePlanId }
  }
  const existing = await Plan.findOne(q).select('_id code').lean()
  if (existing) {
    const err = new Error(
      'Another active starter offer plan already exists. Disable it or unset "starter offer" before activating this one.'
    )
    err.statusCode = 409
    throw err
  }
}

module.exports = {
  STARTER_PLAN_CODE,
  getStarterOfferSinceDate,
  planDocIsStarter,
  getStarterPlan,
  userHasEverHadStarterSubscription,
  userIsEligibleBySignupDate,
  isStarterVisibleToUsers,
  shouldListStarterPlanForUser,
  assertUserMayPurchaseStarter,
  assertNoConflictingActiveStarterPlan
}

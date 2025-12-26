const Plan = require('./plan.model');
const UserSubscription = require('./subscription.model');
const User = require('../user/user.model');
const razorpay = require('../../config/razorpay');
// const Plan = require('./plan.model');
const crypto = require('crypto');
// const UserSubscription = require('./subscription.model');
// const Plan = require('./plan.model');
// const User = require('../user/user.model');

/* ================= ADMIN ================= */

/**
 * CREATE PLAN
 */
exports.createPlan = async (req, res) => {
  try {
    const {
      title,
      description,
      durationInMonths,
      actualPrice,
      discountedPrice,
      showOfferBadge,
      offerText,
      offerStartAt,
      offerEndAt
    } = req.body;

    if (!title || !durationInMonths || !actualPrice || !discountedPrice) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    if (description && description.length > 6) {
      return res.status(400).json({ message: 'Max 6 description points allowed' });
    }

    if (offerText && offerText.length > 30) {
      return res.status(400).json({ message: 'Offer text max 30 characters' });
    }

    const plan = await Plan.create({
      title,
      description,
      durationInMonths,
      actualPrice,
      discountedPrice,
      showOfferBadge,
      offerText,
      offerStartAt,
      offerEndAt,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Subscription plan created',
      data: plan
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET ALL PLANS (ADMIN)
 */
exports.getAllPlans = async (req, res) => {
  const plans = await Plan.find().sort({ createdAt: -1 });
  res.json({ success: true, data: plans });
};

/**
 * UPDATE PLAN
 */
exports.updatePlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    Object.assign(plan, req.body);
    await plan.save();

    res.json({
      success: true,
      message: 'Plan updated successfully',
      data: plan
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE PLAN (SOFT DELETE)
 */
exports.deletePlan = async (req, res) => {
  const plan = await Plan.findById(req.params.planId);
  if (!plan) return res.status(404).json({ message: 'Plan not found' });

  plan.isActive = false;
  await plan.save();

  res.json({ success: true, message: 'Plan disabled successfully' });
};

/**
 * ASSIGN PLAN TO USER (ADMIN)
 */
exports.assignPlanToUser = async (req, res) => {
  try {
    const { userId, planId } = req.body;

    const user = await User.findById(userId);
    const plan = await Plan.findById(planId);

    if (!user || !plan || !plan.isActive) {
      return res.status(400).json({ message: 'Invalid user or plan' });
    }

    // Deactivate previous subscriptions
    await UserSubscription.updateMany(
      { userId, isActive: true },
      { isActive: false }
    );

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + plan.durationInMonths);

    const subscription = await UserSubscription.create({
      userId,
      planId,
      startDate,
      expiryDate,
      isActive: true
    });

    user.activePlan = subscription._id;
    await user.save();

    res.json({
      success: true,
      message: 'Subscription assigned successfully',
      data: {
        expiryDate
      }
    });

  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * SUBSCRIPTION ANALYTICS
 */
exports.subscriptionAnalytics = async (req, res) => {
  const totalSubscribedUsers = await UserSubscription.countDocuments({ isActive: true });
  const planWise = await UserSubscription.aggregate([
    { $group: { _id: "$planId", count: { $sum: 1 } } }
  ]);

  res.json({
    success: true,
    data: {
      totalSubscribedUsers,
      planWise
    }
  });
};

/* ================= USER ================= */

/**
 * GET ACTIVE PLANS (USER)
 */
exports.getActivePlans = async (req, res) => {
  const now = new Date();

  const plans = await Plan.find({
    isActive: true,
    $or: [
      { showOfferBadge: false },
      { offerEndAt: { $gte: now } }
    ]
  });

  res.json({ success: true, data: plans });
};

/**
 * GET MY SUBSCRIPTION
 */
exports.getMySubscription = async (req, res) => {
  const subscription = await UserSubscription
    .findOne({ userId: req.user.id, isActive: true })
    .populate('planId');

  if (!subscription) {
    return res.json({
      success: true,
      data: null,
      message: 'No active subscription'
    });
  }

  const daysLeft = Math.ceil(
    (subscription.expiryDate - new Date()) / (1000 * 60 * 60 * 24)
  );

  res.json({
    success: true,
    data: {
      planName: subscription.planId.title,
      expiryDate: subscription.expiryDate,
      daysLeft
    }
  });
};



/**
 * USER SUBSCRIBE (CREATE RAZORPAY ORDER)
 */
exports.subscribe = async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    // Validate plan
    const plan = await Plan.findOne({ _id: planId, isActive: true });
    if (!plan) {
      return res.status(400).json({ message: 'Invalid or inactive plan' });
    }

    // Amount in paise
    const amount = plan.discountedPrice * 100;

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `sub_${userId.toString().slice(-6)}_${Date.now().toString().slice(-6)}` ,
      notes: {
        userId,
        planId
      }
    });

    return res.json({
      success: true,
      message: 'Razorpay order created',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        planName: plan.title
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Payment initiation failed' });
  }
};




/**
 * VERIFY PAYMENT & ACTIVATE SUBSCRIPTION
 */
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId
    } = req.body;

    const userId = req.user.id;

    // Step 1: Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    // Step 2: Validate plan
    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    // Step 3: Deactivate previous subscriptions
    await UserSubscription.updateMany(
      { userId, isActive: true },
      { isActive: false }
    );

    // Step 4: Calculate subscription dates
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + plan.durationInMonths);

    // Step 5: Create subscription
    const subscription = await UserSubscription.create({
      userId,
      planId,
      startDate,
      expiryDate,
      isActive: true,
      paymentId: razorpay_payment_id,
      paymentProvider: 'razorpay'
    });

    // Step 6: Attach subscription to user
    await User.findByIdAndUpdate(userId, {
      activePlan: subscription._id
    });

    return res.json({
      success: true,
      message: 'Subscription activated successfully',
      data: {
        plan: plan.title,
        expiryDate
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Subscription activation failed' });
  }
};

const Plan = require('./plan.model');
const UserSubscription = require('./subscription.model');
const User = require('../user/user.model');
const getRazorpayInstance = require('../../config/razorpay');
const crypto = require('crypto');
const Notification = require('../notification/notification.model');
const UserNotification = require('../notification/userNotification.model');
const { sendFirebasePush } = require('../../utils/firebasePush.utils');


/* ================= ADMIN ================= */

/**
 * CREATE PLAN
 */
exports.createPlan = async (req, res) => {
  try {
    const {
      title,
      code,                // ✅ ADD THIS
      description,
      durationInMonths,
      actualPrice,
      discountedPrice,
      showOfferBadge,
      offerText,
      offerStartAt,
      offerEndAt,
      isActive
    } = req.body;

    /* ===== BASIC VALIDATIONS ===== */
    if (!title || !code || !durationInMonths || !actualPrice || !discountedPrice) {
      return res.status(400).json({
        message: 'title, code, durationInMonths, actualPrice, discountedPrice are required'
      });
    }

    if (description && description.length > 6) {
      return res.status(400).json({ message: 'Max 6 description points allowed' });
    }

    if (offerText && offerText.length > 30) {
      return res.status(400).json({ message: 'Offer text max 30 characters' });
    }

    /* ===== DUPLICATE CODE CHECK ===== */
    const existingPlan = await Plan.findOne({ code: code.toUpperCase() });
    if (existingPlan) {
      return res.status(409).json({
        message: `Plan with code '${code}' already exists`
      });
    }

    /* ===== CREATE PLAN ===== */
    const plan = await Plan.create({
      title,
      code: code.toUpperCase(),   // ✅ IMPORTANT
      description,
      durationInMonths,
      actualPrice,
      discountedPrice,
      showOfferBadge,
      offerText,
      offerStartAt,
      offerEndAt,
      isActive: isActive ?? true
    });

    return res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully',
      data: plan
    });

  } catch (error) {
    console.error('Create plan error:', error);

    return res.status(400).json({
      message: error.message,
      error: error.name
    });
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

    /* 1️⃣ Deactivate previous subscriptions */
    await UserSubscription.updateMany(
      { userId, isActive: true },
      { isActive: false }
    );

    /* 2️⃣ Calculate dates - Handle month-end edge cases properly */
    const startDate = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setFullYear(
      expiryDate.getFullYear(),
      expiryDate.getMonth() + plan.durationInMonths,
      expiryDate.getDate()
    );
    // Handle month-end edge cases (e.g., Jan 31 + 1 month = Feb 28/29)
    if (expiryDate.getDate() !== startDate.getDate()) {
      expiryDate.setDate(0); // Set to last day of previous month
    }

    /* 3️⃣ Create new subscription */
    const subscription = await UserSubscription.create({
      userId,
      planId,
      startDate,
      expiryDate,
      isActive: true
    });

    /* 4️⃣ Attach subscription to user */
    user.activePlan = subscription._id;
    await user.save();

    /* ================= 🔔 NOTIFICATION PART ================= */

    // 5️⃣ Create notification master record
    const notification = await Notification.create({
      type: 'SUBSCRIPTION',
      title: '🎉 Subscription Activated',
      message: `Your ${plan.title} plan is active till ${expiryDate.toDateString()}`
    });

    // 6️⃣ Create user-notification mapping
    await UserNotification.create({
      user: user._id,
      notification: notification._id,
      status: 'PENDING'
    });

    // 7️⃣ Send Firebase push
    const tokens = user.firebaseTokens || [];

    for (const token of tokens) {
      try {
        await sendFirebasePush({
          token,
          title: notification.title,
          message: notification.message
        });
      } catch (err) {
        console.error('FCM send error:', err.message);
      }
    }

    /* ======================================================== */

    return res.json({
      success: true,
      message: 'Subscription assigned successfully',
      data: {
        expiryDate
      }
    });

  } catch (error) {
    console.error('Assign plan error:', error);
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
  // Show all active plans regardless of offer status
  const plans = await Plan.find({
    isActive: true
  }).sort({ createdAt: -1 });

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

    // Get Razorpay instance (lazy-loaded)
    const razorpay = getRazorpayInstance();

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
    console.error('Subscribe error:', error);
    
    // Handle Razorpay configuration errors
    if (error.message && error.message.includes('Razorpay configuration missing')) {
      return res.status(500).json({ 
        message: 'Payment service is not configured. Please contact support.' 
      });
    }
    
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

    /* 1️⃣ Verify Razorpay signature */
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    /* 2️⃣ Validate plan */
    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    /* 3️⃣ Deactivate previous subscriptions */
    await UserSubscription.updateMany(
      { userId, isActive: true },
      { isActive: false }
    );

    /* 4️⃣ Calculate dates - Handle month-end edge cases properly */
    const startDate = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setFullYear(
      expiryDate.getFullYear(),
      expiryDate.getMonth() + plan.durationInMonths,
      expiryDate.getDate()
    );
    // Handle month-end edge cases (e.g., Jan 31 + 1 month = Feb 28/29)
    if (expiryDate.getDate() !== startDate.getDate()) {
      expiryDate.setDate(0); // Set to last day of previous month
    }

    /* 5️⃣ Create subscription */
    const subscription = await UserSubscription.create({
      userId,
      planId,
      startDate,
      expiryDate,
      isActive: true,
      paymentId: razorpay_payment_id,
      paymentProvider: 'razorpay'
    });

    /* 6️⃣ Attach subscription to user */
    const user = await User.findByIdAndUpdate(
      userId,
      { activePlan: subscription._id },
      { new: true }
    );

    /* ================= 🔔 NOTIFICATION ================= */

    // Create notification
    const notification = await Notification.create({
      type: 'SUBSCRIPTION',
      title: '🎉 Subscription Activated',
      message: `Your ${plan.title} plan is active till ${expiryDate.toDateString()}`
    });

    // Map notification to user
    await UserNotification.create({
      user: user._id,
      notification: notification._id,
      status: 'PENDING'
    });

    // Send Firebase push
    const tokens = user.firebaseTokens || [];

    for (const token of tokens) {
      try {
        await sendFirebasePush({
          token,
          title: notification.title,
          message: notification.message
        });
      } catch (err) {
        console.error('FCM error:', err.message);
      }
    }

    /* =================================================== */

    return res.json({
      success: true,
      message: 'Subscription activated successfully',
      data: {
        plan: plan.title,
        expiryDate
      }
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ message: 'Subscription activation failed' });
  }
};

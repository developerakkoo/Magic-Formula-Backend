const cron = require('node-cron');
const UserSubscription = require('../modules/subscription/subscription.model');
const User = require('../modules/user/user.model');
const Notification = require('../modules/notification/notification.model');
const UserNotification = require('../modules/notification/userNotification.model');
const { sendFirebasePush } = require('../utils/firebasePush.utils');

/**
 * Runs every day at 1:00 AM
 * Expires subscriptions & sends notification
 */
cron.schedule('0 1 * * *', async () => {
  console.log('❌ Running subscription expiry job');

  const now = new Date();

  const expiredSubs = await UserSubscription
    .find({
      isActive: true,
      expiryDate: { $lt: now },
      expiredNotificationSent: false
    })
    .populate('userId planId');

  for (const sub of expiredSubs) {
    const user = sub.userId;
    const plan = sub.planId;

    // deactivate subscription
    sub.isActive = false;
    sub.expiredNotificationSent = true;
    await sub.save();

    // remove active plan from user
    await User.findByIdAndUpdate(user._id, {
      activePlan: null
    });

    const message = `Your ${plan.title} subscription has expired`;

    const notification = await Notification.create({
      type: 'SUBSCRIPTION_EXPIRED',
      title: '❌ Subscription Expired',
      message
    });

    await UserNotification.create({
      user: user._id,
      notification: notification._id,
      status: 'PENDING'
    });

    for (const token of user.firebaseTokens || []) {
      await sendFirebasePush({
        token,
        title: '❌ Subscription Expired',
        message
      });
    }
  }
});

const cron = require('node-cron')
const UserSubscription = require('../modules/subscription/subscription.model')
const User = require('../modules/user/user.model')
const Notification = require('../modules/notification/notification.model')
const UserNotification = require('../modules/notification/userNotification.model')
const { sendFirebasePush } = require('../utils/firebasePush.utils')

cron.schedule('0 10 * * *', async () => {
  console.log('⏰ Running subscription expiry reminder')

  const today = new Date()
  const reminderDate = new Date()
  reminderDate.setDate(today.getDate() + 3)

  const subscriptions = await UserSubscription
    .find({
      isActive: true,
      expiryDate: { $gte: today, $lte: reminderDate }
    })
    .populate('userId planId')

  for (const sub of subscriptions) {
    const user = sub.userId
    const plan = sub.planId

    const message = `Your ${plan.title} plan expires on ${sub.expiryDate.toDateString()}`

    const notification = await Notification.create({
      type: 'SUBSCRIPTION_EXPIRING',
      title: '⏰ Subscription Expiring Soon',
      message
    })

    await UserNotification.create({
      user: user._id,
      notification: notification._id,
      status: 'PENDING'
    })

    for (const token of user.firebaseTokens || []) {
      await sendFirebasePush({
        token,
        title: '⏰ Subscription Expiring Soon',
        message
      })
    }
  }
})

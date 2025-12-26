const User = require('../user/user.model');
const UserNotification = require('../notification/userNotification.model');
const Notification = require('../notification/notification.model');

exports.sendNotificationToUsers = async (req, res) => {
  try {
    const { notificationId, userIds, sendTo } = req.body;

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    let users = [];

    // 🎯 Target logic
    if (sendTo === 'ALL') {
      users = await User.find({}, '_id');
    } else if (sendTo === 'SUBSCRIBED') {
      users = await User.find({ isSubscribed: true }, '_id');
    } else if (sendTo === 'CUSTOM') {
      users = await User.find({ _id: { $in: userIds } }, '_id');
    } else {
      return res.status(400).json({ message: 'Invalid sendTo option' });
    }

    const userNotifications = users.map((u) => ({
      user: u._id,
      notification: notificationId,
    }));

    await UserNotification.insertMany(userNotifications);

    // Mark notification as SENT
    notification.status = 'SENT';
    await notification.save();

    res.json({
      success: true,
      sentCount: users.length,
      message: 'Notification assigned to users successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

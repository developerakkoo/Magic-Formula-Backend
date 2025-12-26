const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
    },

    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED'],
      default: 'PENDING',
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userNotificationSchema.index({ user: 1 });
userNotificationSchema.index({ notification: 1 });

module.exports = mongoose.model(
  'UserNotification',
  userNotificationSchema
);

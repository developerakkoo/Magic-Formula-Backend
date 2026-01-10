const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ['INFO', 'PROMOTION', 'ALERT', 'SUBSCRIPTION', 'SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_EXPIRED'],
      default: 'INFO',
    },

    status: {
      type: String,
      enum: ['DRAFT', 'SENT'],
      default: 'DRAFT',
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  { timestamps: true }
);

/* 🔍 INDEXES */
notificationSchema.index({ title: 'text' });      // for search
notificationSchema.index({ createdAt: -1 });      // for sorting by date

module.exports = mongoose.model('Notification', notificationSchema);

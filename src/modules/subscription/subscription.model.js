const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true
    },

    startDate: {
      type: Date,
      required: true
    },

    expiryDate: {
      type: Date,
      required: true
    },

    isActive: {
      type: Boolean,
      default: true
    },

    /* ===== PAYMENT (FUTURE) ===== */

    paymentId: {
      type: String,
      default: null
    },

    paymentProvider: {
      type: String,
      enum: ['razorpay', null],
      default: null
    },

    usageCount: {
      type: Number,
      default: 0
    },

    usageResetAt: {
      type: Date,
      default: () => {
        const now = new Date();
        now.setHours(24, 0, 0, 0); // reset at midnight
        return now;
      }
    }

  },
  {
    timestamps: true
  }
);

/* Ensure only ONE active subscription per user */
subscriptionSchema.index(
  { userId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('UserSubscription', subscriptionSchema);

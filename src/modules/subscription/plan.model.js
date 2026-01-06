const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    /* ===== BASIC INFO ===== */

    title: {
      type: String,
      required: true,
      trim: true
    },

    // 🔑 IMPORTANT: Used for bulk upload (Excel → Plan mapping)
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },

    description: {
      type: [String],
      validate: {
        validator: function (val) {
          return val.length <= 6;
        },
        message: 'Maximum 6 description points allowed'
      }
    },

    /* ===== PRICING ===== */

    durationInMonths: {
      type: Number,
      enum: [1, 3, 6, 12],
      required: true
    },

    actualPrice: {
      type: Number,
      required: true,
      min: 0
    },

    discountedPrice: {
      type: Number,
      required: true,
      min: 0
    },

    /* ===== OFFER BADGE ===== */

    showOfferBadge: {
      type: Boolean,
      default: false
    },

    offerText: {
      type: String,
      maxlength: 30
    },

    offerStartAt: {
      type: Date
    },

    offerEndAt: {
      type: Date
    },

    /* ===== STATUS ===== */

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Plan', planSchema);

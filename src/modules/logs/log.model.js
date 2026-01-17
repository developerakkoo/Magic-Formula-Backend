const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['INFO', 'WARNING', 'ERROR', 'SUCCESS'],
      required: true,
      default: 'INFO'
    },
    module: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes for better query performance
logSchema.index({ type: 1, createdAt: -1 });
logSchema.index({ module: 1, createdAt: -1 });
logSchema.index({ createdAt: -1 });
logSchema.index({ userId: 1 });
logSchema.index({ adminId: 1 });

module.exports = mongoose.model('Log', logSchema);


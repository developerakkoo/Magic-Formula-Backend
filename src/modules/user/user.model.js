const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    mobile: { type: String },

    fullName: String,
    email: { type: String },
    password: { type: String }, // Required for email/password users
    whatsapp: String,

    // store only filename, not full URL
    profilePic: { type: String },

    firebaseTokens: {
      type: [String],
      default: []
    },

    isBlocked: { type: Boolean, default: false },

    // Device restriction fields
    deviceId: { type: String, default: null }, // Capacitor device identifier
    lastDeviceLogin: { type: Date }, // Last successful device login timestamp
    lastActivity: { type: Date }, // Last activity timestamp (for live user tracking)
    deviceChangeRequested: { type: Boolean, default: false }, // Device change request pending
    deviceChangeRequestedAt: { type: Date }, // When device change was requested

    activePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    planExpiry: Date
  },
  { timestamps: true }
);

// Keep uniqueness only for meaningful non-empty values.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true, $type: 'string' } } }
);
userSchema.index(
  { whatsapp: 1 },
  { unique: true, partialFilterExpression: { whatsapp: { $exists: true, $type: 'string' } } }
);

// Add method to compare password
userSchema.methods.comparePassword = function (enteredPassword) {
  if (!this.password) {
    return Promise.resolve(false); // User doesn't have password (mobile-only registration)
  }
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema)

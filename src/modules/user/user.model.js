const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    mobile: { type: String, unique: true, sparse: true }, // Optional, sparse unique index allows multiple nulls

    fullName: String,
    email: { type: String, unique: true, sparse: true }, // Sparse unique index allows multiple nulls
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

// Add method to compare password
userSchema.methods.comparePassword = function (enteredPassword) {
  if (!this.password) {
    return Promise.resolve(false); // User doesn't have password (mobile-only registration)
  }
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema)

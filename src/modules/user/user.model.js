const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, unique: true },

    fullName: String,
    email: String,
    whatsapp: String,

    // store only filename, not full URL
    profilePic: { type: String }, 

    firebaseToken: String,
    isBlocked: { type: Boolean, default: false },

    activePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    planExpiry: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);

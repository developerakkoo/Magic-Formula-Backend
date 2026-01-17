const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    // General Settings
    appName: {
      type: String,
      default: 'Magic Formula'
    },
    appDescription: {
      type: String,
      default: ''
    },
    
    // Notification Settings
    defaultNotificationTitle: {
      type: String,
      default: 'New Notification'
    },
    defaultNotificationMessage: {
      type: String,
      default: 'You have a new notification'
    },
    
    // Payment Settings
    razorpayKeyId: {
      type: String,
      default: ''
    },
    razorpayKeySecret: {
      type: String,
      default: ''
    },
    
    // System Settings
    maintenanceMode: {
      type: Boolean,
      default: false
    },
    maintenanceMessage: {
      type: String,
      default: 'System is under maintenance. Please try again later.'
    },
    
    // Feature Flags
    enableWhatsAppNotifications: {
      type: Boolean,
      default: true
    },
    enableFirebaseNotifications: {
      type: Boolean,
      default: true
    },
    
    // Other settings can be added here
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);


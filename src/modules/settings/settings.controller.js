const Settings = require('./settings.model');

/**
 * GET SETTINGS
 * Get current system settings
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Don't send sensitive data like razorpay key secret
    const safeSettings = settings.toObject();
    if (safeSettings.razorpayKeySecret) {
      safeSettings.razorpayKeySecret = '***hidden***';
    }
    
    res.json({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

/**
 * UPDATE SETTINGS
 * Update system settings
 */
exports.updateSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = await Settings.create(req.body);
    } else {
      // Update only provided fields
      Object.keys(req.body).forEach(key => {
        if (req.body[key] !== undefined) {
          settings[key] = req.body[key];
        }
      });
      await settings.save();
    }
    
    // Don't send sensitive data
    const safeSettings = settings.toObject();
    if (safeSettings.razorpayKeySecret) {
      safeSettings.razorpayKeySecret = '***hidden***';
    }
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: safeSettings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};

/**
 * RESET SETTINGS
 * Reset settings to defaults
 */
exports.resetSettings = async (req, res) => {
  try {
    await Settings.deleteMany({});
    const settings = await Settings.create({});
    
    res.json({
      success: true,
      message: 'Settings reset to defaults',
      data: settings
    });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings'
    });
  }
};


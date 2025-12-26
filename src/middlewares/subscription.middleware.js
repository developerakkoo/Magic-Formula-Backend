const UserSubscription = require('../modules/subscription/subscription.model');

module.exports = (requiredFeature = null) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id;

      // Get active subscription
      const subscription = await UserSubscription
        .findOne({ userId, isActive: true })
        .populate('planId');

      if (!subscription) {
        return res.status(403).json({
          message: 'Active subscription required'
        });
      }

      // Check expiry
      if (subscription.expiryDate < new Date()) {
        return res.status(403).json({
          message: 'Subscription expired'
        });
      }

      // (Optional) Feature-based check
      if (requiredFeature) {
        const features = subscription.planId.features || [];
        if (!features.includes(requiredFeature)) {
          return res.status(403).json({
            message: 'Upgrade your plan to access this feature'
          });
        }
      }

      // Attach subscription to request
      req.subscription = subscription;

      next();
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'Subscription validation failed'
      });
    }
  };
};

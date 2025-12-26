module.exports = (dailyLimit = 50) => {
  return async (req, res, next) => {
    try {
      const subscription = req.subscription; // set by subscription middleware

      const now = new Date();

      // Reset usage if date passed
      if (now > subscription.usageResetAt) {
        subscription.usageCount = 0;

        const resetAt = new Date();
        resetAt.setHours(24, 0, 0, 0);
        subscription.usageResetAt = resetAt;
      }

      // Check limit
      if (subscription.usageCount >= dailyLimit) {
        return res.status(429).json({
          message: 'Daily usage limit exceeded'
        });
      }

      // Increment usage
      subscription.usageCount += 1;
      await subscription.save();

      next();
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'Usage limit validation failed'
      });
    }
  };
};

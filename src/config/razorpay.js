const Razorpay = require('razorpay');

let razorpayInstance = null;

/**
 * Get Razorpay instance (lazy-loaded)
 * Initializes Razorpay only when actually needed
 * @returns {Razorpay} Razorpay instance
 * @throws {Error} If Razorpay keys are not configured
 */
function getRazorpayInstance() {
  // Check if instance already exists
  if (razorpayInstance) {
    return razorpayInstance;
  }

  // Validate environment variables
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay configuration missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.'
    );
  }

  // Initialize Razorpay instance
  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });

  return razorpayInstance;
}

module.exports = getRazorpayInstance;

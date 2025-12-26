require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    // 1. Connect DB
    await connectDB();

    // 2. Connect Redis (optional)
    await connectRedis();

    // 3. Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Server failed to start:', error);
    process.exit(1);
  }
})();

// Redis functionality commented out
// const { createClient } = require('redis');

// let client;

// const connectRedis = async () => {
//   try {
//     client = createClient({
//       url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
//     });

//     client.on('error', (err) => {
//       console.error('❌ Redis Error:', err);
//     });

//     await client.connect();
//     console.log('✅ Redis connected');
//   } catch (error) {
//     console.error('⚠️ Redis not connected (continuing without Redis)');
//   }
// };

const connectRedis = async () => {
  // Redis disabled
  console.log('⚠️ Redis is disabled');
};

module.exports = {
  connectRedis,
  redisClient: () => null, // Return null instead of client
};

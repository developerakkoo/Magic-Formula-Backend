// Redis functionality commented out
// const { redisClient } = require('../config/redis');

// const LIVE_USERS_KEY = 'live_users';

// Redis functions disabled - return default values
exports.addLiveUser = async (userId) => {
  // Redis disabled - no-op
  // const client = redisClient();
  // if (!client) return;
  // await client.sAdd(LIVE_USERS_KEY, userId.toString());
};

exports.removeLiveUser = async (userId) => {
  // Redis disabled - no-op
  // const client = redisClient();
  // if (!client) return;
  // await client.sRem(LIVE_USERS_KEY, userId.toString());
};

exports.getLiveUsersCount = async () => {
  // Redis disabled - return 0
  // const client = redisClient();
  // if (!client) return 0;
  // return await client.sCard(LIVE_USERS_KEY);
  return 0;
};

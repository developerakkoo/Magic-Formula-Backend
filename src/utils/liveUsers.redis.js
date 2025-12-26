const { redisClient } = require('../config/redis');

const LIVE_USERS_KEY = 'live_users';

exports.addLiveUser = async (userId) => {
  const client = redisClient();
  if (!client) return;

  await client.sAdd(LIVE_USERS_KEY, userId.toString());
};

exports.removeLiveUser = async (userId) => {
  const client = redisClient();
  if (!client) return;

  await client.sRem(LIVE_USERS_KEY, userId.toString());
};

exports.getLiveUsersCount = async () => {
  const client = redisClient();
  if (!client) return 0;

  return await client.sCard(LIVE_USERS_KEY);
};

const User = require('../user/user.model');
const { signAccessToken } = require('../../utils/jwt.utils');

exports.login = async (mobile) => {
  let user = await User.findOne({ mobile });

  if (!user) {
    user = await User.create({ mobile });
  }

  const token = signAccessToken({ userId: user._id });

  return { token, user };
};

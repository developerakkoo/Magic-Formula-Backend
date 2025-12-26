const Rating = require('./rating.model');

exports.submitRating = async (userId, stars, comment) => {
  const today = new Date();
  today.setHours(0,0,0,0);

  const alreadyRated = await Rating.findOne({
    user: userId,
    createdAt: { $gte: today }
  });

  if (alreadyRated) {
    throw new Error('Already rated today');
  }

  return Rating.create({ user: userId, stars, comment });
};

exports.getPublicRatings = async () => {
  return Rating.find({ stars: { $gt: 4 } })
    .populate('user', 'fullName')
    .sort({ createdAt: -1 });
};

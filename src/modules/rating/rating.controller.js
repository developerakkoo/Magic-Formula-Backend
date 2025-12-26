const service = require('./rating.service');

exports.rate = async (req, res) => {
  const { stars, comment } = req.body;
  const userId = req.user.id;

  const rating = await service.submitRating(userId, stars, comment);
  res.json(rating);
};

exports.list = async (req, res) => {
  const ratings = await service.getPublicRatings();
  res.json(ratings);
};

const User = require('./user.model');
const path = require('path');
const fs = require('fs');
const { getLiveUsersCount } = require('../../utils/liveUsers.redis');

exports.getProfilePhoto = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user || !user.profilePic) {
    return res.status(404).json({ message: 'Profile photo not found' });
  }

  const filePath = path.join(
    __dirname,
    '../../uploads/profile',
    user.profilePic
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  res.sendFile(filePath);
};

exports.uploadProfilePic = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Save filename only
    user.profilePic = req.file.filename;
    await user.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.json({
      message: 'Profile image uploaded successfully',
      profilePic: `${baseUrl}/api/users/${user._id}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.getUserAnalytics = async (req, res) => {
  const totalUsers = await User.countDocuments();
  const subscribedUsers = await User.countDocuments({ isSubscribed: true });
  const unsubscribedUsers = totalUsers - subscribedUsers;
  const liveUsers = await getLiveUsersCount();

  res.json({
    success: true,
    data: {
      totalUsers,
      liveUsers,
      subscribedUsers,
      unsubscribedUsers,
    },
  });
};
const Notification = require('../notification/notification.model');
const UserNotification = require('../notification/userNotification.model');
const { sendWhatsAppMessage } = require('../../services/wati.service');

exports.createNotification = async (req, res) => {
  try {
    const { title, message, type } = req.body;

    const notification = await Notification.create({
      title,
      message,
      type,
      createdBy: req.admin._id,
    });

    res.status(201).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const query = {};

    // 🔍 Search by title
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    // 🧮 Filter by status
    if (status) {
      query.status = status;
    }

    // 📅 Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const notifications = await Notification.find(query)
      .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Notification.countDocuments(query);

    res.json({
      success: true,
      total,
      page: Number(page),
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



exports.updateNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.bulkDeleteNotifications = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide notification IDs',
      });
    }

    const result = await Notification.deleteMany({
      _id: { $in: ids },
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: 'Notifications deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};




exports.sendWhatsAppNotifications = async (req, res) => {
  try {
    const pendingNotifications = await UserNotification.find({
      status: 'PENDING',
    }).populate('user notification');

    let successCount = 0;
    let failedCount = 0;

    for (const item of pendingNotifications) {
      const phone = item.user.phone;
      const message = item.notification.message;

      const result = await sendWhatsAppMessage(phone, message);

      if (result.success) {
        item.status = 'SENT';
        successCount++;
      } else {
        item.status = 'FAILED';
        failedCount++;
      }

      await item.save();
    }

    res.json({
      success: true,
      successCount,
      failedCount,
      message: 'WhatsApp notifications processed',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

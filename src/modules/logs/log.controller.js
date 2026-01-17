const Log = require('./log.model');

/**
 * GET ALL LOGS
 * Get logs with pagination, filtering, and search
 */
exports.getLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      type,
      module: moduleFilter,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // Build query
    const query = {};

    // Filter by type
    if (type && ['INFO', 'WARNING', 'ERROR', 'SUCCESS'].includes(type)) {
      query.type = type;
    }

    // Filter by module
    if (moduleFilter) {
      query.module = { $regex: moduleFilter, $options: 'i' };
    }

    // Search in message
    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    // Fetch logs
    const logs = await Log.find(query)
      .populate('userId', 'fullName email mobile')
      .populate('adminId', 'email')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Log.countDocuments(query);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: logs
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs'
    });
  }
};

/**
 * GET LOG BY ID
 */
exports.getLogById = async (req, res) => {
  try {
    const log = await Log.findById(req.params.id)
      .populate('userId', 'fullName email mobile')
      .populate('adminId', 'email')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Get log by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch log'
    });
  }
};

/**
 * DELETE LOG
 */
exports.deleteLog = async (req, res) => {
  try {
    const log = await Log.findByIdAndDelete(req.params.id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    res.json({
      success: true,
      message: 'Log deleted successfully'
    });
  } catch (error) {
    console.error('Delete log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete log'
    });
  }
};

/**
 * BULK DELETE LOGS
 */
exports.bulkDeleteLogs = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide log IDs'
      });
    }

    const result = await Log.deleteMany({
      _id: { $in: ids }
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: 'Logs deleted successfully'
    });
  } catch (error) {
    console.error('Bulk delete logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete logs'
    });
  }
};

/**
 * CLEAR ALL LOGS
 */
exports.clearAllLogs = async (req, res) => {
  try {
    const result = await Log.deleteMany({});

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: 'All logs cleared successfully'
    });
  } catch (error) {
    console.error('Clear all logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear logs'
    });
  }
};


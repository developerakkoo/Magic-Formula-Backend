const Settings = require('../modules/settings/settings.model')

const isAdminPath = path => path === '/api/admin' || path.startsWith('/api/admin/')

module.exports = async (req, res, next) => {
  try {
    if (isAdminPath(req.path)) {
      return next()
    }

    const settings = await Settings.getSettings()

    if (!settings.maintenanceMode) {
      return next()
    }

    return res.status(503).json({
      success: false,
      message:
        settings.maintenanceMessage ||
        'System is under maintenance. Please try again later.',
      maintenanceMode: true
    })
  } catch (error) {
    console.error('Maintenance middleware error:', error)
    return next()
  }
}

const express = require('express');
const cors = require('cors');
const app = express();

require('./cron/subscriptionReminder'); // (cron is loaded)
require('./cron/subscriptionExpiry');

app.use(express.json());
app.use(cors());

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK2' });
});

// ROUTES
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/users', require('./modules/user/user.routes'));
app.use('/api/admin', require('./modules/admin/admin.routes'));
app.use('/api/admin/auth', require('./modules/admin/admin.auth.routes'));
app.use('/api/subscriptions', require('./modules/subscription/subscription.routes')); 
app.use('/api/notifications', require('./modules/notification/notification.routes'));
app.use('/api/admin/logs', require('./modules/logs/log.routes'));
app.use('/api/admin/settings', require('./modules/settings/settings.routes'));

module.exports = app;

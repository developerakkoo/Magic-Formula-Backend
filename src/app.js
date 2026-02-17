const express = require('express');
const cors = require('cors');
const app = express();

require('./cron/subscriptionReminder'); // (cron is loaded)
require('./cron/subscriptionExpiry');

app.use(express.json());

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      '*',  // Allow all origins when present
      'http://localhost:8100',  // Ionic dev server
      'http://localhost:8101',  // Ionic dev server (alternative port)
      'http://localhost:4200',  // Angular dev server (if used)
      process.env.CORS_ORIGIN_PROD || 'https://your-production-domain.com'
    ];
    
    if (allowedOrigins.indexOf('*') !== -1 || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,  // Allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  maxAge: 86400  // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', version: '1.0.1' });
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

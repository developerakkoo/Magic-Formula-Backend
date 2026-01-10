const admin = require('../config/firebase');

exports.sendFirebasePush = async ({ token, title, message }) => {
  return await admin.messaging().send({
  token,
  notification: {
    title: title,
    body: message
  },
  data: {
    click_action: 'FLUTTER_NOTIFICATION_CLICK'
  },
  
    webpush: {
      headers: {
        Urgency: 'high'
      },
      notification: {
        title,
        body: message,
        icon: '/firebase-logo.png', // optional
      }
    }
  });
};

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = require('../../magic-formula-d55e8-firebase-adminsdk-fbsvc-f0f70a2c7c.json');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;

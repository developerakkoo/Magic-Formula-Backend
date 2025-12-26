require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../src/modules/admin/admin.model');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = 'admin@test.com';
    const password = 'admin123';

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      console.log('Admin already exists');
      process.exit();
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await Admin.create({
      email,
      password: hashedPassword
    });

    console.log('Admin created successfully');
    process.exit();
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  }
})();

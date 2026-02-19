const mongoose = require('mongoose');

const ensureUserPhoneIndexes = async () => {
  try {
    const usersCollection = mongoose.connection.collection('users');
    const indexes = await usersCollection.indexes();
    const mobileIndex = indexes.find((idx) => idx.name === 'mobile_1');
    const whatsappIndex = indexes.find((idx) => idx.name === 'whatsapp_1');

    // Remove legacy mobile index - phone identity is WhatsApp now.
    if (mobileIndex) {
      await usersCollection.dropIndex('mobile_1');
      console.log('Dropped users.mobile_1 legacy index');
    }

    const hasValidWhatsappIndex =
      whatsappIndex &&
      whatsappIndex.unique === true &&
      !!whatsappIndex.partialFilterExpression;

    if (!hasValidWhatsappIndex) {
      if (whatsappIndex) {
        await usersCollection.dropIndex('whatsapp_1');
      }

      await usersCollection.createIndex(
        { whatsapp: 1 },
        { unique: true, partialFilterExpression: { whatsapp: { $exists: true, $type: 'string' } } }
      );
      console.log('Ensured users.whatsapp_1 partial unique index');
    }
  } catch (error) {
    console.error('Failed to ensure users phone indexes:', error.message);
  }
};

const connectDB = async () => {
  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log('MongoDB connected');
    await ensureUserPhoneIndexes();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

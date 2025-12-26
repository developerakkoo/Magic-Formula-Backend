const axios = require('axios');

const sendWhatsAppMessage = async (phone, message) => {
  try {
    const response = await axios.post(
      `${process.env.WATI_BASE_URL}/api/v1/sendSessionMessage/${phone}`,
      {
        messageText: message,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WATI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data || error.message };
  }
};

module.exports = { sendWhatsAppMessage };

const axios = require('axios')

/* ======================================================
   Helper Utilities
====================================================== */

const buildAuthHeader = () => {
  const token = process.env.WATI_ACCESS_TOKEN
  if (!token) {
    throw new Error('WATI_ACCESS_TOKEN is missing in environment variables')
  }
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`
}

const trimTrailingSlash = value =>
  String(value || '').replace(/\/+$/, '')

const formatPhoneNumber = phone => {
  if (!phone) throw new Error('Phone number is required')

  let formatted = String(phone).replace(/\D/g, '')

  if (!formatted.startsWith('91')) {
    formatted = '91' + formatted
  }

  return formatted
}

/* ======================================================
   Generic Template Sender
====================================================== */

const sendWhatsAppTemplate = async (
  phone,
  templateName,
  parametersArray = [],
  buttonUrl = null
) => {
  try {
    const authorizationHeader = buildAuthHeader()
    const baseUrl = trimTrailingSlash(process.env.WATI_BASE_URL)
    const formattedPhone = formatPhoneNumber(phone)

    const formattedParams = (parametersArray || []).map((value, index) => ({
      name: `${index + 1}`,
      value: String(value ?? '')
    }))

    const payload = {
      template_name: templateName,
      broadcast_name: `bulk_${Date.now()}`,  // ✅ UNIQUE broadcast name
      parameters: formattedParams
    }

    if (buttonUrl) {
      payload.buttons = [
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            {
              type: 'text',
              text: buttonUrl
            }
          ]
        }
      ]
    }
console.log("====== WATI TEMPLATE DEBUG ======");
console.log("Phone:", formattedPhone);
console.log("Template:", templateName);
console.log("Body Parameters:", formattedParams);
console.log("Button URL:", buttonUrl);
console.log("Final Payload:", JSON.stringify(payload, null, 2));
console.log("==================================");
    const response = await axios.post(
      `${baseUrl}/api/v1/sendTemplateMessage?whatsappNumber=${formattedPhone}`,
      payload,
      {
        headers: {
          Authorization: authorizationHeader,
          'Content-Type': 'application/json'
        }
      }
    )

    return { success: true, data: response.data }

  } catch (error) {
    console.error(
      'WATI SEND ERROR:',
      error.response?.data || error.message
    )

    return {
      success: false,
      error: error.response?.data || error.message
    }
  }
}
/* ======================================================
   Specific Template Wrappers
====================================================== */

// OTP Template
const sendOTPMessage = async (phone, otpCode) => {
  return sendWhatsAppTemplate(
    phone,
    'magic_formula_otp_v3',
    [otpCode]
  )
}



const sendBulkUserResetMessage = async (
  phone,
  fullName,
  email
) => {
  return sendWhatsAppTemplate(
    phone,
    'bulk',
    [fullName, email],  // body {{1}}, {{2}}
    email               // button {{1}}
  );
};
module.exports = {
  sendWhatsAppTemplate,
  sendOTPMessage,
  sendBulkUserResetMessage
}
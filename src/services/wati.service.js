// const axios = require('axios');

// const buildAuthHeader = () => {
//   const token = process.env.WATI_ACCESS_TOKEN;
//   if (!token) {
//     throw new Error('WATI_ACCESS_TOKEN is missing in environment variables');
//   }
//   return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
// };

// const trimTrailingSlash = (value) =>
//   String(value || '').replace(/\/+$/, '');

// // Ensure phone format: 91XXXXXXXXXX (no +)
// const formatPhoneNumber = (phone) => {
//   let formatted = phone.toString().replace(/\D/g, '');
//   if (!formatted.startsWith('91')) {
//     formatted = '91' + formatted;
//   }
//   return formatted;
// };

// /**
//  * Generic Template Sender
//  * @param {String} phone
//  * @param {String} templateName
//  * @param {Array} parametersArray  Example: ["Shubham"] OR ["123456"]
//  */
// const sendWhatsAppTemplate = async (phone, templateName, parametersArray = []) => {
//   try {
//     const authorizationHeader = buildAuthHeader();
//     const baseUrl = trimTrailingSlash(process.env.WATI_BASE_URL);

//     const formattedPhone = formatPhoneNumber(phone);

//     // Convert simple array → WATI format
//     const formattedParams = parametersArray.map((value, index) => ({
//       name: `${index + 1}`,
//       value: value.toString()
//     }));

//     const response = await axios.post(
//       `${baseUrl}/api/v1/sendTemplateMessage?whatsappNumber=${formattedPhone}`,
//       {
//         template_name: templateName,
//         broadcast_name: templateName,
//         parameters: formattedParams
//       },
//       {
//         headers: {
//           Authorization: authorizationHeader,
//           "Content-Type": "application/json"
//         }
//       }
//     );

//     return {
//       success: true,
//       data: response.data
//     };

//   } catch (error) {
//     console.error("WATI SEND ERROR:", error.response?.data || error.message);

//     return {
//       success: false,
//       error: error.response?.data || error.message
//     };
//   }
// };

// /* ======================================================
//    Helper Functions For Your Two Templates
//    ====================================================== */

// // 1️⃣ OTP Template
// const sendOTPMessage = async (phone, otpCode) => {
//   return sendWhatsAppTemplate(
//     phone,
//     "magic_formula_otp_v3",
//     [otpCode]
//   );
// };

// // 2️⃣ Bulk User Onboarding Template
// const sendBulkUserWelcomeMessage = async (phone, fullName) => {
//   return sendWhatsAppTemplate(
//     phone,
//     "bulk_user_onboarding_v6",
//     [fullName]
//   );
// };

// module.exports = {
//   sendWhatsAppTemplate,
//   sendOTPMessage,
//   sendBulkUserWelcomeMessage
// };




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

    // Safe parameter formatting (NO CRASH VERSION)
    const formattedParams = (parametersArray || []).map((value, index) => ({
      name: `${index + 1}`,
      value: String(value ?? '')
    }))

    const payload = {
      template_name: templateName,
      broadcast_name: templateName,
      parameters: formattedParams
    }

    // Optional dynamic URL button
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

    return {
      success: true,
      data: response.data
    }
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

// ✅ FIXED Bulk User Reset Template
// Template expects:
// {{1}} = email
// {{2}} = reset link
const sendBulkUserResetMessage = async (
  phone,
  fullName,
  maskedEmail,
  resetLink
) => {
  return sendWhatsAppTemplate(
    phone,
    'bulk_create_uuser',   // ✅ exact template name
    [fullName, maskedEmail], // body variables
    resetLink            // dynamic button URL
  )
}

module.exports = {
  sendWhatsAppTemplate,
  sendOTPMessage,
  sendBulkUserResetMessage
}
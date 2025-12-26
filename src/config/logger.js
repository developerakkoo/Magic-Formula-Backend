const log = (type, message, meta = null) => {
  const time = new Date().toISOString();
  if (meta) {
    console.log(`[${time}] [${type}] ${message}`, meta);
  } else {
    console.log(`[${time}] [${type}] ${message}`);
  }
};

module.exports = {
  info: (msg, meta) => log('INFO', msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta),
};

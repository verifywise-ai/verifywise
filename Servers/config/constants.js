const DEFAULT_FRONTEND_URL = "http://localhost:8082";

module.exports = {
  frontEndUrl: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL,
};

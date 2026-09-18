const jwt = require('jsonwebtoken');

const generateToken = (id, role, organizationId) => {
  return jwt.sign({ id, role, organizationId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

module.exports = { generateToken };

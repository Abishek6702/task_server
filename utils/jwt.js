const jwt = require('jsonwebtoken');

const generateToken = (id, role, organizationId) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ id, role, organizationId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
};

module.exports = { generateToken };

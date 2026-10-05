const mongoose = require('mongoose');

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

const isValidEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeEmail = (value) => value.trim().toLowerCase();

const cleanString = (value, field, { required = false, max = 200 } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required`);
    return value;
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error(`${field} is required`);
  if (cleaned.length > max) throw new Error(`${field} is too long`);
  return cleaned;
};

const parsePagination = (query, { defaultLimit = 50, maxLimit = 100 } = {}) => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
  if (!Number.isInteger(page) || page < 1) throw new Error('Page must be a positive integer');
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new Error(`Limit must be between 1 and ${maxLimit}`);
  }
  return { page, limit, skip: (page - 1) * limit };
};

const toObjectId = (value, field) => {
  if (!isValidObjectId(value)) throw new Error(`${field} is invalid`);
  return new mongoose.Types.ObjectId(value);
};

module.exports = {
  isValidObjectId,
  isValidEmail,
  normalizeEmail,
  cleanString,
  parsePagination,
  toObjectId,
};

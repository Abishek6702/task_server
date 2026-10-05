const { isValidObjectId } = require('../utils/validation');

const validateObjectIdParams = (...params) => (req, res, next) => {
  for (const param of params) {
    if (req.params[param] !== undefined && !isValidObjectId(req.params[param])) {
      return res.status(400).json({ success: false, message: `Invalid ${param}` });
    }
  }
  next();
};

module.exports = { validateObjectIdParams };

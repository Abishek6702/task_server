const errorHandler = (err, req, res, next) => {
  const statusCode = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : (res.statusCode >= 400 ? res.statusCode : 500);
  
  const message = process.env.NODE_ENV === 'production' && statusCode >= 500
    ? 'Something went wrong'
    : (err.name === 'ValidationError' ? Object.values(err.errors).map(e => e.message).join(', ') : err.message);
  res.status(statusCode).json({
    success: false,
    message,
  });
};

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

module.exports = { errorHandler, notFound };

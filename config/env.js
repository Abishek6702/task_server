const getMongoUri = () => process.env.MONGO_URI || process.env.MONGODB_URI;

module.exports = { getMongoUri };

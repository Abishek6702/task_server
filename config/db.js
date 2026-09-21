const mongoose = require('mongoose');
const dns = require('dns');
const { getMongoUri } = require('./env');


const connectDB = async () => {
  try {
    dns.setServers(['208.67.222.222', '208.67.220.220']);
    const conn = await mongoose.connect(getMongoUri());
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

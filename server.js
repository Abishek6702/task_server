const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const mongoose = require('mongoose');
const { getMongoUri } = require('./config/env');

// Load env vars
dotenv.config();

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security & CORS
app.use(helmet({ crossOriginResourcePolicy: false }));
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || process.env.CLIENT_URL || '')
  .split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin is not allowed'));
  },
  credentials: true,
}));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Basic route
app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({ success: true, status: databaseConnected ? 'ready' : 'starting' });
});
app.get('/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({ success: true, status: databaseConnected ? 'ready' : 'starting' });
});

const validateProductionConfig = () => {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [
    !getMongoUri() ? 'MONGO_URI' : null,
    !process.env.JWT_SECRET ? 'JWT_SECRET' : null,
    !process.env.JWT_EXPIRES_IN ? 'JWT_EXPIRES_IN' : null,
  ].filter(Boolean);
  if (!process.env.CORS_ORIGIN && !process.env.FRONTEND_URL && !process.env.CLIENT_URL) missing.push('CORS_ORIGIN or FRONTEND_URL');
  if (process.env.JWT_SECRET && (process.env.JWT_SECRET.length < 32 || /your_|change|secret/i.test(process.env.JWT_SECRET))) missing.push('a strong JWT_SECRET');
  if (missing.length) throw new Error(`Missing or unsafe production configuration: ${missing.join(', ')}`);
};

// Routes
const authRoutes = require('./routes/auth.routes');
const orgRoutes = require('./routes/organization.routes');
const userRoutes = require('./routes/user.routes');
const projectRoutes = require('./routes/project.routes');
const taskRoutes = require('./routes/task.routes');
const commentRoutes = require('./routes/comment.routes');
const notificationRoutes = require('./routes/notification.routes');
const activityRoutes = require('./routes/activity.routes');
const reportsRoutes = require('./routes/reports.routes');
const calendarRoutes = require('./routes/calendar.routes');
const timeEntryRoutes = require('./routes/timeEntry.routes');
const uploadRoutes = require('./routes/upload.routes');
const searchRoutes = require('./routes/search.routes');
const divisionRoutes = require('./routes/division.routes');

app.use('/api/auth', authRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/divisions', divisionRoutes);

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  validateProductionConfig();
  await connectDB();
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });

  process.on('unhandledRejection', (err) => {
    console.error(`Error: ${err.message}`);
    server.close(() => process.exit(1));
  });
  return server;
};

if (require.main === module) startServer();

module.exports = { app, startServer };

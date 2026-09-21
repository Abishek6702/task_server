const express = require('express');
const { login, register, getMe, updatePassword, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const { protect } = require('../middleware/authMiddleware');
const { rateLimit } = require('../middleware/rateLimit');

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10, message: 'Too many authentication attempts. Please try again later.' });

const router = express.Router();

router.post('/login', authLimit, login);
router.post('/register', register);
router.get('/me', protect, getMe);
router.put('/updatepassword', protect, updatePassword);
router.post('/forgotpassword', authLimit, forgotPassword);
router.put('/resetpassword/:resettoken', authLimit, resetPassword);
router.post('/resetpassword/:resettoken', authLimit, resetPassword);

module.exports = router;

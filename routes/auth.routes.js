const express = require('express');
const { login, register, getMe, updatePassword, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', protect, getMe);
router.put('/updatepassword', protect, updatePassword);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);

module.exports = router;

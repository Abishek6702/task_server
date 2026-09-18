const express = require('express');
const { uploadAttachment } = require('../controllers/upload.controller');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');

const router = express.Router();

router.use(protect);

router.post('/', upload.single('file'), uploadAttachment);

module.exports = router;

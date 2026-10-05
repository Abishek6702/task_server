const express = require('express');
const { uploadAttachment, downloadAttachment, deleteAttachment } = require('../controllers/upload.controller');
const { protect } = require('../middleware/authMiddleware');
const { upload } = require('../utils/upload');

const router = express.Router();

router.use(protect);

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'File exceeds the maximum allowed size' });
      return res.status(400).json({ success: false, message: error.message || 'Invalid upload' });
    }
    next();
  });
}, uploadAttachment);
router.get('/:fileName', downloadAttachment);
router.delete('/:fileName', deleteAttachment);

module.exports = router;

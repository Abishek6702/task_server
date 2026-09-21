const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const { storageRoot } = require('./storage');

const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB) || 10;
const maxFileSize = maxFileSizeMb * 1024 * 1024;
const allowedTypes = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  '.txt': ['text/plain'],
};

const isSafeOriginalName = (name) => (
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 255 &&
  !/[\0\\/]/.test(name) &&
  name !== '.' &&
  name !== '..' &&
  !name.includes('..')
);

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!isSafeOriginalName(file.originalname)) return cb(new Error('Filename is invalid'));
  if (!allowedTypes[extension]) return cb(new Error('File type is not supported'));
  if (!allowedTypes[extension].includes(file.mimetype)) return cb(new Error('File MIME type does not match its extension'));
  cb(null, true);
};

const upload = multer({
  storage: multer.diskStorage({
    destination: storageRoot,
    filename(req, file, cb) {
      cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: maxFileSize },
  fileFilter,
});

module.exports = { upload, maxFileSizeMb };

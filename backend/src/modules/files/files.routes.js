const express = require('express');
const multer = require('multer');
const controller = require('./files.controller');
const { authenticate } = require('../../middlewares/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يُسمح بالصور فقط'));
  },
});

const router = express.Router();

router.use(authenticate);
router.post('/upload', upload.single('file'), controller.upload);

module.exports = router;

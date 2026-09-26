const express = require('express');
const controller = require('./notifications.controller');
const { authenticate } = require('../../middlewares/auth');
const { query } = require('../../config/db');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/me', controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/:id/read', controller.markRead);
router.patch('/read-all', controller.markAllRead);
router.delete('/:id', controller.remove);

// FCM Token
router.post('/register-token', async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'التوكن مطلوب' });
    }
    await query(`UPDATE users SET fcm_token = $1 WHERE id = $2`, [fcmToken, req.user.id]);
    res.json({ success: true, message: 'تم حفظ التوكن' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;

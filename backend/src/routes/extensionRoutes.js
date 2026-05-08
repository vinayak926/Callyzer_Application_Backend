const express  = require('express');
const {
  registerFcm,
  triggerDial,
  getStatus
} = require('../controllers/extensionController');
const protect  = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);   // All 3 routes require JWT

router.post('/register-fcm', registerFcm);  // Mobile app startup
router.post('/dial',         triggerDial);  // Extension trigger
router.get('/status',        getStatus);    // Extension popup status

module.exports = router;

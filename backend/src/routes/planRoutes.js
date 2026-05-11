const express = require('express');
const {
  getPlans,
  startTrial,
  createOrder,
  verifyPayment,
  getMySubscription,
  getMyInvoices,
  cancelSubscription,
} = require('../controllers/planController');

const protect = require('../middlewares/authMiddleware');
const businessOnly = require('../middlewares/businessMiddleware');

const router = express.Router();

// Public
router.get('/plans', getPlans);

// Protected — business_user only
// router.use(protect);
// router.use(businessOnly);

router.post('/subscriptions/start-trial', startTrial);
router.post('/subscriptions/create-order', createOrder);
router.post('/subscriptions/verify-payment', verifyPayment);
router.get('/subscriptions/my', getMySubscription);
router.post('/subscriptions/cancel', cancelSubscription);
router.get('/invoices', getMyInvoices);

module.exports = router;
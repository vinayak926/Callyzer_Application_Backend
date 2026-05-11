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

// Protected — business_user only
router.post('/subscriptions/start-trial', protect, startTrial);
router.post('/subscriptions/create-order', protect, createOrder);
router.post('/subscriptions/verify-payment', protect, verifyPayment);
router.get('/subscriptions/my', protect, getMySubscription);
router.post('/subscriptions/cancel', protect, cancelSubscription);
router.get('/invoices', protect, getMyInvoices);

module.exports = router;
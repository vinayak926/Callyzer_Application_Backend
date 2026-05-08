const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const crypto = require('crypto');

// ── SEED PLANS ─────────────────────────────────────────────
const DEFAULT_PLANS = [
  {
    name: 'Starter',
    slug: 'starter',
    monthlyPrice: 99900,
    yearlyPrice: 999900,
    maxUsers: 5,
    trialDays: 14,
    sortOrder: 1,
    features: [
      'Up to 5 team members',
      'Call log sync',
      'Basic reports',
      'Device call sync',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    slug: 'growth',
    monthlyPrice: 299900,
    yearlyPrice: 2999900,
    maxUsers: 20,
    trialDays: 14,
    sortOrder: 2,
    features: [
      'Up to 20 team members',
      'All Starter features',
      'Live feed',
      'Team analytics',
      'Leaderboard',
      'CSV export',
      'Priority support',
    ],
  },
  {
    name: 'Pro',
    slug: 'pro',
    monthlyPrice: 799900,
    yearlyPrice: 7999900,
    maxUsers: 100,
    trialDays: 14,
    sortOrder: 3,
    features: [
      'Up to 100 team members',
      'All Growth features',
      'Advanced reports',
      'Custom branding',
      'API access',
      'Dedicated support',
    ],
  },
];

exports.seedPlans = async () => {
  for (const plan of DEFAULT_PLANS) {
    await Plan.findOneAndUpdate(
      { slug: plan.slug },
      { $setOnInsert: plan },
      { upsert: true, new: true }
    );
  }
  console.log('✅ Plans seeded');
};

// ── GET PLANS ─────────────────────────────────────────────
exports.getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean();
    res.json({ plans });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── START TRIAL ───────────────────────────────────────────
exports.startTrial = async (req, res) => {
  try {
    const { planSlug = 'starter' } = req.body;
    const userId = req.user._id;

    const existing = await Subscription.findOne({ businessUser: userId });
    if (existing) {
      return res.status(400).json({ message: 'You already have a subscription' });
    }

    const plan = await Plan.findOne({ slug: planSlug, isActive: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const trialEndsAt = new Date(Date.now() + plan.trialDays * 86400000);

    const sub = await Subscription.create({
      businessUser: userId,
      plan: plan._id,
      status: 'trialing',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEndsAt,
      trialEndsAt,
    });

    await User.findByIdAndUpdate(userId, {
      subscriptionId: sub._id,
      planId: plan._id,
      trialStartedAt: new Date(),
    });

    res.json({
      success: true,
      message: `${plan.trialDays}-day free trial started`,
      subscription: sub,
      trialEndsAt,
    });
  } catch (err) {
    console.error('startTrial error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── CREATE ORDER ──────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const { planSlug, billingCycle = 'monthly' } = req.body;

    const plan = await Plan.findOne({ slug: planSlug, isActive: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const amount =
      billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

    let razorpayOrderId = `order_mock_${Date.now()}`;

    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const Razorpay = require('razorpay');
      const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const order = await instance.orders.create({
        amount,
        currency: 'INR',
        receipt: `rcpt_${req.user._id}_${Date.now()}`,
      });

      razorpayOrderId = order.id;
    }

    res.json({
      success: true,
      orderId: razorpayOrderId,
      amount,
      currency: 'INR',
      planName: plan.name,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_XXXX',
    });
  } catch (err) {
    console.error('createOrder error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── VERIFY PAYMENT ────────────────────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      planSlug,
      billingCycle = 'monthly',
    } = req.body;

    const userId = req.user._id;

    if (
      process.env.RAZORPAY_KEY_SECRET &&
      !razorpayOrderId.startsWith('order_mock_')
    ) {
      const expectedSig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (expectedSig !== razorpaySignature) {
        return res.status(400).json({ message: 'Payment signature invalid' });
      }
    }

    const plan = await Plan.findOne({ slug: planSlug, isActive: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const amount =
      billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    const periodDays = billingCycle === 'yearly' ? 365 : 30;
    const periodEnd = new Date(Date.now() + periodDays * 86400000);

    const sub = await Subscription.findOneAndUpdate(
      { businessUser: userId },
      {
        plan: plan._id,
        status: 'active',
        billingCycle,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        razorpayOrderId,
        razorpayPaymentId,
        lastPaymentAmount: amount,
        lastPaymentAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(userId, {
      subscriptionId: sub._id,
      planId: plan._id,
    });

    const gst = Math.round(amount * 0.18);
    const invoiceCount = await Invoice.countDocuments();

    await Invoice.create({
      subscription: sub._id,
      businessUser: userId,
      invoiceNumber: `INV-${new Date().getFullYear()}-${String(
        invoiceCount + 1
      ).padStart(5, '0')}`,
      amount,
      gst,
      totalAmount: amount + gst,
      status: 'paid',
      razorpayPaymentId,
      planName: plan.name,
      billingCycle,
    });

    res.json({
      success: true,
      message: 'Payment verified. Subscription activated!',
      subscription: sub,
    });
  } catch (err) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET MY SUBSCRIPTION ───────────────────────────────────
exports.getMySubscription = async (req, res) => {
  try {
    const sub = await Subscription.findOne({
      businessUser: req.user._id,
    })
      .populate('plan')
      .lean();
    res.json({ subscription: sub });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET MY INVOICES ───────────────────────────────────────
exports.getMyInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({
      businessUser: req.user._id,
    })
      .sort({ issuedAt: -1 })
      .lean();
    res.json({ invoices });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── CANCEL SUBSCRIPTION ───────────────────────────────────
exports.cancelSubscription = async (req, res) => {
  try {
    const sub = await Subscription.findOneAndUpdate(
      {
        businessUser: req.user._id,
        status: { $in: ['active', 'trialing'] },
      },
      { status: 'cancelled', cancelledAt: new Date() },
      { new: true }
    );

    if (!sub)
      return res.status(404).json({ message: 'No active subscription' });

    res.json({
      success: true,
      message: 'Subscription cancelled',
      subscription: sub,
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
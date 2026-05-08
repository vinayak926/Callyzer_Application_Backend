const mongoose = require('mongoose');
 
const subscriptionSchema = new mongoose.Schema({
 
    businessUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
 
    plan:            { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
 
    status: {
 
        type: String,
 
        enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'],
 
        default: 'trialing',
 
    },
 
    billingCycle:    { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
 
    currentPeriodStart: { type: Date },
 
    currentPeriodEnd:   { type: Date },
 
    trialEndsAt:     { type: Date },
 
    cancelledAt:     { type: Date, default: null },
 
    // Razorpay
 
    razorpayOrderId:        { type: String, default: null },
 
    razorpayPaymentId:      { type: String, default: null },
 
    razorpaySubscriptionId: { type: String, default: null },
 
    lastPaymentAmount:      { type: Number, default: 0 },
 
    lastPaymentAt:          { type: Date, default: null },
 
    // Coupon
 
    couponCode:      { type: String, default: null },
 
    discountPercent: { type: Number, default: 0 },
 
}, { timestamps: true });
 
subscriptionSchema.index({ businessUser: 1 });
 
module.exports = mongoose.model('Subscription', subscriptionSchema);
 

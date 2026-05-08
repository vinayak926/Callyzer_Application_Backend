const mongoose = require('mongoose');
 
const invoiceSchema = new mongoose.Schema({
 
    subscription:    { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
 
    businessUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
 
    invoiceNumber:   { type: String, unique: true },
 
    amount:          { type: Number, required: true }, // before GST, in paise
 
    gst:             { type: Number, default: 0 },
 
    totalAmount:     { type: Number, required: true }, // after GST
 
    status:          { type: String, enum: ['paid', 'pending', 'refunded'], default: 'pending' },
 
    razorpayPaymentId: { type: String, default: null },
 
    planName:        { type: String },
 
    billingCycle:    { type: String },
 
    issuedAt:        { type: Date, default: Date.now },
 
}, { timestamps: true });
 
module.exports = mongoose.model('Invoice', invoiceSchema);
 

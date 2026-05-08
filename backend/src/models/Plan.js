const mongoose = require('mongoose');
 
const planSchema = new mongoose.Schema({
 
    name:         { type: String, required: true },
 
    slug:         { type: String, required: true, unique: true, lowercase: true },
 
    monthlyPrice: { type: Number, required: true }, // in paise (₹999 = 99900)
 
    yearlyPrice:  { type: Number, required: true },
 
    maxUsers:     { type: Number, default: 5 },
 
    features:     [{ type: String }],
 
    isActive:     { type: Boolean, default: true },
 
    trialDays:    { type: Number, default: 14 },
 
    sortOrder:    { type: Number, default: 0 },
 
}, { timestamps: true });
 
module.exports = mongoose.model('Plan', planSchema);
 

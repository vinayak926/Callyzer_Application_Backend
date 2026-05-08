const User   = require('../models/User');
const { getIO } = require('../socket');

// POST /api/extension/register-fcm
// Mobile app calls this on startup to save FCM token
exports.registerFcm = async (req, res) => {
  try {
    const { fcmToken, deviceName = 'Android' } = req.body;
    if (!fcmToken)
      return res.status(400).json({ message: 'fcmToken required' });

    const user = await User.findById(req.user._id);
    // Remove stale entry with same token, push fresh
    user.fcmTokens = (user.fcmTokens || []).filter(t => t.token !== fcmToken);
    user.fcmTokens.push({ token: fcmToken, deviceName, addedAt: new Date() });
    // Keep only last 3 devices
    if (user.fcmTokens.length > 3) user.fcmTokens = user.fcmTokens.slice(-3);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('registerFcm error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/extension/dial
// Extension calls this when user clicks phone icon on website
exports.triggerDial = async (req, res) => {
  try {
    const { phoneNumber, customerName = 'Unknown' } = req.body;
    if (!phoneNumber || !String(phoneNumber).trim())
      return res.status(400).json({ message: 'phoneNumber required' });

    const normalizedPhone = String(phoneNumber).trim();
    const userId = String(req.user._id);

    let socketSent = false;
    try {
      const io = getIO();
      io.to(`user-${userId}`).emit('dial-request', {
        phoneNumber: normalizedPhone,
        customerName,
        triggeredAt: new Date().toISOString(),
      });
      socketSent = true;
    } catch (socketErr) {
      console.warn('Socket emit failed:', socketErr.message);
    }

    console.log(`[Ext] Dial triggered => user:${userId} phone:${normalizedPhone} socket:${socketSent}`);
    res.json({
      success: true,
      message: socketSent
        ? 'Call trigger sent to mobile app'
        : 'Trigger sent — open mobile app to receive',
      socketSent,
    });
  } catch (err) {
    console.error('triggerDial error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/extension/status
// Extension popup calls this to show mobile online/offline
exports.getStatus = async (req, res) => {
  try {
    const userId = String(req.user._id);
    let mobileOnline = false;
    try {
      const io = getIO();
      const sockets = await io.in(`user-${userId}`).fetchSockets();
      mobileOnline = sockets.some(s => s.data && s.data.isMobile === true);
    } catch (_) {}
    res.json({
      extensionConnected: true,
      mobileOnline,
      user: { name: req.user.name, email: req.user.email, role: req.user.role },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

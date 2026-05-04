// const socketIO = require('socket.io');

// let io;

// const initSocket = (server) => {
//     io = socketIO(server, {
//         cors: {
//             origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
//             credentials: true,
//             methods: ["GET", "POST"]
//         }
//     });

//     io.on('connection', (socket) => {
//         console.log('🔌 New client connected:', socket.id);

//         socket.on('join-user', (userData) => {
//             const { userId, role } = userData;
            
//             // Join individual user room
//             socket.join(`user-${userId}`);
            
//             // Join role-based room (using exact role string)
//             socket.join(role);
            
//             console.log(`📢 User ${userId} (${role}) joined room: ${role}`);
//         });

//         socket.on('disconnect', () => {
//             console.log('🔌 Client disconnected:', socket.id);
//         });
//     });

//     return io;
// };

// const getIO = () => {
//     if (!io) {
//         throw new Error('Socket.io not initialized!');
//     }
//     return io;
// };

// // Broadcast new call to all relevant users
// const emitNewCall = (callData, agentId, agentRole) => {
//     if (!io) return;
    
//     console.log(`📢 Broadcasting new call to roles: admin, super_admin, manager`);
    
//     // Send to admin and super_admin rooms
//     io.to('admin').emit('new-call', callData);
//     io.to('super_admin').emit('new-call', callData);
    
//     // Send to manager room
//     io.to('manager').emit('new-call', callData);
    
//     // Send to the agent who created it (for confirmation)
//     io.to(`user-${agentId}`).emit('call-saved', callData);
    
//     console.log(`📢 New call broadcasted: ${callData.customerName} (${callData.callType})`);
// };

// module.exports = { initSocket, getIO, emitNewCall };

const socketIO = require('socket.io');

let io;

const initSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
            credentials: true,
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('🔌 New client connected:', socket.id);

        socket.on('join-user', (userData) => {
            const { userId, role, businessUserId } = userData;

            // Join individual user room
            socket.join(`user-${userId}`);

            // Join role-based room
            socket.join(role);

            // ── Business User: apne dedicated room mein join karo ──
            // Taaki sirf unki team ke calls milein
            if (role === 'business_user') {
                socket.join(`bu-${userId}`);
                console.log(`📢 Business User ${userId} joined room: bu-${userId}`);
            }

            // ── Salesperson: apne Business User ke room mein bhi join karo ──
            // Taaki BU ko unki team ke calls milein
            if (role === 'salesperson' && businessUserId) {
                socket.join(`bu-${businessUserId}`);
                console.log(`📢 Salesperson ${userId} joined BU room: bu-${businessUserId}`);
            }

            console.log(`📢 User ${userId} (${role}) joined room: ${role}`);
        });

        socket.on('disconnect', () => {
            console.log('🔌 Client disconnected:', socket.id);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

// ── Broadcast new call to all relevant users ──────────────
const emitNewCall = (callData, agentId, agentRole, businessUserId) => {
    if (!io) return;

    // Super Admin aur Admin — sab calls milti hain
    io.to('super_admin').emit('new-call', callData);
    io.to('admin').emit('new-call', callData);

    // Manager room (old role — backward compat)
    io.to('manager').emit('new-call', callData);

    // ── Business User — sirf apni team ki calls milti hain ──
    if (businessUserId) {
        io.to(`bu-${businessUserId}`).emit('new-call', callData);
        console.log(`📢 New call sent to BU room: bu-${businessUserId}`);
    }

    // Agent ko confirmation
    io.to(`user-${agentId}`).emit('call-saved', callData);

    console.log(`📢 New call broadcasted: ${callData.customerName} (${callData.callType})`);
};

module.exports = { initSocket, getIO, emitNewCall };
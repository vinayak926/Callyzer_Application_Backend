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
            const { userId, role } = userData;
            
            // Join individual user room
            socket.join(`user-${userId}`);
            
            // Join role-based room (using exact role string)
            socket.join(role);
            
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

// Broadcast new call to all relevant users
const emitNewCall = (callData, agentId, agentRole) => {
    if (!io) return;
    
    console.log(`📢 Broadcasting new call to roles: admin, super_admin, manager`);
    
    // Send to admin and super_admin rooms
    io.to('admin').emit('new-call', callData);
    io.to('super_admin').emit('new-call', callData);
    
    // Send to manager room
    io.to('manager').emit('new-call', callData);
    
    // Send to the agent who created it (for confirmation)
    io.to(`user-${agentId}`).emit('call-saved', callData);
    
    console.log(`📢 New call broadcasted: ${callData.customerName} (${callData.callType})`);
};

module.exports = { initSocket, getIO, emitNewCall };
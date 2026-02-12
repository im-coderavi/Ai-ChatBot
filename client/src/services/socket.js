import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || ''

let socket = null

export function getSocket() {
    if (!socket) {
        socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            autoConnect: false
        })
    }
    return socket
}

export function connectSocket() {
    const s = getSocket()
    if (!s.connected) {
        s.connect()
    }
    return s
}

export function disconnectSocket() {
    if (socket) {
        // Remove all listeners and disconnect
        socket.removeAllListeners()
        socket.disconnect()
        socket = null  // Force new socket on next connect
    }
}

export default { getSocket, connectSocket, disconnectSocket }

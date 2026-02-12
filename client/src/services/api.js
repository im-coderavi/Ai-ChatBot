import axios from 'axios'

const API_BASE = '/api/v1'

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json'
    }
})

// ---- Chat API ----
export const chatAPI = {
    startConversation: (jobId = 'fedex-driver-001') =>
        api.post('/chat/start', { jobId }),

    sendMessage: (conversationId, message) =>
        api.post('/chat/message', { conversationId, message }),

    getResult: (conversationId) =>
        api.get(`/chat/result/${conversationId}`)
}

// ---- Admin API ----
export const adminAPI = {
    getStats: () =>
        api.get('/admin/stats'),

    getCandidates: (params = {}) =>
        api.get('/admin/candidates', { params }),

    getCandidate: (id) =>
        api.get(`/admin/candidates/${id}`),

    deleteCandidate: (id) =>
        api.delete(`/admin/candidates/${id}`)
}

export default api

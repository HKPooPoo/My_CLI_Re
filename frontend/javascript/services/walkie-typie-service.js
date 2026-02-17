import { apiRequest } from './api.js';

export const WalkieTypieService = {
    getConnections() {
        return apiRequest('/walkie-typie/connections', { method: 'GET' });
    },
    createConnection(data) {
        return apiRequest('/walkie-typie/connections', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    updateConnectionTag(partnerUid, data) {
        return apiRequest(`/walkie-typie/connections/${partnerUid}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },
    sendSignal(data) {
        return apiRequest('/walkie-typie/signal', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    getConfig() {
        return apiRequest('/walkie-typie/config', { method: 'GET' });
    },

    // --- Board Operations (獨立於 Blackboard) ---

    commitBoard(data) {
        return apiRequest('/walkie-typie/boards/commit', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    fetchBoardRecords(branchId) {
        return apiRequest(`/walkie-typie/boards/${branchId}`, { method: 'GET' });
    }
};

import { apiRequest } from './api.js';

export const BlackboardService = {
    fetchBranches() {
        return apiRequest('/blackboard/branches', { method: 'GET' });
    },
    fetchBranchDetails(branchId) {
        return apiRequest(`/blackboard/branches/${branchId}`, { method: 'GET' });
    },
    deleteBranch(branchId) {
        return apiRequest(`/blackboard/branches/${branchId}`, { method: 'DELETE' });
    },
    commit(data) {
        return apiRequest('/blackboard/commit', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};

import { apiRequest } from './api.js';

export const BlackboardService = {
    fetchBranches() {
        return apiRequest('/blackboard/branches', { method: 'GET' });
    },
    fetchBranchDetails(branchId) {
        console.log(`BBS: Fetching details for branch ID: ${branchId}`);
        return apiRequest(`/blackboard/branches/${branchId}`, { method: 'GET' })
            .then(res => {
                console.log("BBS: Fetch Response:", res);
                return res;
            });
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

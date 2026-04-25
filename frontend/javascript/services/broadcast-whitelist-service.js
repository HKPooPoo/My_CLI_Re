/**
 * Whitelist preset service.
 *
 * Backend split (see CLAUDE.md "Whitelist + Distribution backbone"):
 *   - T2 `whitelists`                = audience (member uid set)
 *   - T1 `whitelist_distributions`   = who's cleared to apply
 *
 * This service only touches the owner-facing paths. Admin-side
 * CRUD (create whitelist, add-member, grant) is artisan-only.
 *
 *   listApplicable()       — GET /api/whitelists returns the
 *                            presets the authenticated user is
 *                            allowed to apply (member uids are
 *                            NOT returned — only member_count).
 *   apply(channelId, id)   — PUT sets channel.whitelist_id.
 *                            Pass `null` to detach and revert the
 *                            channel to public.
 */

import { apiRequest } from './api.js';

export const BroadcastWhitelistService = {
    listApplicable(signal) {
        return apiRequest('/whitelists', signal ? { signal } : {});
    },
    /**
     * Auth + apply-grant required. Server returns 403 unless the
     * caller has a T1 grant for this preset. Member uids are
     * sensitive — don't pre-fetch the whole catalogue at boot.
     */
    fetchMembers(whitelistId) {
        return apiRequest(`/whitelists/${whitelistId}/members`);
    },
    apply(channelId, whitelistId) {
        return apiRequest(`/broadcast/channels/${channelId}/whitelist`, {
            method: 'PUT',
            body: JSON.stringify({ whitelist_id: whitelistId }),
        });
    },
};

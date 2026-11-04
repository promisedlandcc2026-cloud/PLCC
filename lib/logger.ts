
/**
 * Log an activity to the system-wide audit log.
 * 
 * @param action - Short description of the action (e.g., "User Login", "Team Created")
 * @param details - precise details about the action (e.g., "Created team 'Worship Team'")
 * @param severity - 'info' | 'warning' | 'critical'
 * @param resource_type - Optional: The type of resource affected (e.g., 'team', 'user')
 * @param resource_id - Optional: The ID of the resource affected
 * @param user_id - Optional: The ID of the user performing the action (if known)
 */
export async function logActivity(
    action: string,
    details: string,
    severity: 'info' | 'warning' | 'critical' = 'info',
    resource_type?: string,
    resource_id?: string,
    user_id?: string
) {
    try {
        // Try to get user_id from localStorage if not provided
        const finalUserId = user_id || localStorage.getItem('awc_user_id');

        // Fire and forget - don't await the result to block UI
        fetch('/api/audit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('awc_auth_token') || ''}`, // Pass token for RLS
            },
            body: JSON.stringify({
                user_id: finalUserId,
                action,
                details,
                severity,
                resource_type,
                resource_id
            })
        }).catch(err => console.error("Background Audit Log Failed:", err));

    } catch (error) {
        console.error("Failed to log activity:", error);
    }
}

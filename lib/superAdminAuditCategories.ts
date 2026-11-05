/**
 * Shared action category for Super Admin dashboard previews and full audit history.
 * This is a view-only classifier; it does not change permissions or stored events.
 */
const SYSTEM_ACCESS_ACTION =
  /system_settings|admin_account|credential|access|suspend|reactivat|promot|sign_in|login|password|role_update|privacy|data_cleanup/i;

export const isSystemAccessChangeAction = (actionType: string): boolean =>
  SYSTEM_ACCESS_ACTION.test(actionType || "");

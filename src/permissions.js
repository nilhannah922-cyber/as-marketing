export const PERMISSIONS = [
  ['view_dashboard', 'View dashboard / summary'],
  ['create_orders', 'Create orders'],
  ['edit_orders', 'Edit orders and line items'],
  ['delete_orders', 'Soft-delete orders'],
  ['advance_order_status', 'Advance packing and delivery status'],
  ['record_payments', 'Record payments'],
  ['process_returns', 'Process returns and refunds'],
  ['view_all_orders', 'View all orders'],
  ['manage_products', 'Manage products'],
  ['manage_categories', 'Manage categories'],
  ['manage_customers', 'Manage customers'],
  ['manage_stock', 'Manage stock, entries, and restocking'],
  ['manage_suppliers', 'Manage suppliers and purchase orders'],
  ['view_reports', 'View reports'],
  ['export_reports', 'Export reports'],
  ['restore_deleted_records', 'Restore recycle-bin records'],
  ['permanently_delete_records', 'Permanently delete records'],
  ['backup_restore', 'Backup and restore database'],
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map(([key]) => key);
export const DEFAULT_USER_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter(key =>
  !['permanently_delete_records', 'backup_restore'].includes(key)
);

export function hasPermission(user, key) {
  if (!user) return false;
  if (user.permissions?.[key] === true) return true;
  if (Array.isArray(user.permissions) && user.permissions.includes(key)) return true;
  // Backward-compatible while the database migration is being deployed.
  return !user.role_id && user.role === 'superadmin';
}

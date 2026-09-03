import { supabase, isMock } from './supabaseClient';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { ALL_PERMISSION_KEYS, DEFAULT_USER_PERMISSION_KEYS } from './permissions';

const SEED_CATEGORIES = [
  { id: "c1", name: "Beverages", description: "Soft drinks, juices and water", image: "" },
  { id: "c2", name: "Snacks", description: "Chips, biscuits and confectionery", image: "" },
  { id: "c3", name: "Household", description: "Cleaning and daily essentials", image: "" },
];

const SEED_PRODUCTS = [
  { id: "p1", category_id: "c1", name: "Cola 1.5L", sku: "BEV-001", cost_price: 180, selling_price: 250, stock: 42, image_url: "", description: "Classic cola, 1.5 litre bottle." },
  { id: "p2", category_id: "c1", name: "Orange Juice 1L", sku: "BEV-002", cost_price: 220, selling_price: 320, stock: 8, image_url: "", description: "100% orange juice, 1 litre carton." },
  { id: "p3", category_id: "c1", name: "Mineral Water 500ml", sku: "BEV-003", cost_price: 40, selling_price: 70, stock: 120, image_url: "", description: "Purified drinking water." },
  { id: "p4", category_id: "c2", name: "Potato Chips 150g", sku: "SNK-001", cost_price: 120, selling_price: 180, stock: 55, image_url: "", description: "Crispy salted potato chips." },
  { id: "p5", category_id: "c2", name: "Cream Biscuits", sku: "SNK-002", cost_price: 90, selling_price: 140, stock: 6, image_url: "", description: "Vanilla cream biscuits, family pack." },
  { id: "p6", category_id: "c3", name: "Dish Wash Liquid 500ml", sku: "HH-001", cost_price: 200, selling_price: 290, stock: 30, image_url: "", description: "Grease-cutting dish wash liquid." },
];

const SEED_CUSTOMERS = [
  { id: "cu1", name: "Kamal Perera", company: "Perera Traders", mobile: "0771234567", address: "Galle", email: "kamal@pereratraders.com", nic: "841234567V", bank_details: { bank: "BOC", account: "123456" }, notes: "Reliable dealer", balance: 0 },
  { id: "cu2", name: "Nadeesha Silva", company: "", mobile: "0779876543", address: "Matara", email: "nadeesha@gmail.com", nic: "919876543V", bank_details: { bank: "Sampath", account: "987654" }, notes: "Cash on delivery preferred", balance: 0 },
];

const SUPER_ADMIN_MOCK = {
  id: "u_admin",
  name: "Nihlan",
  username: "Nihlan922",
  mobile: "0770000000",
  email: "nihlan922@stockorder.local",
  password: "NIH922nih##",
  role: "superadmin",
  must_change_password: true
};

const KEYS = {
  USERS: 'so:users',
  CATEGORIES: 'so:categories',
  PRODUCTS: 'so:products',
  CUSTOMERS: 'so:customers',
  ORDERS: 'so:orders',
  PAYMENTS: 'so:payments',
  STOCK_HISTORY: 'so:stock_history',
  STOCK_ENTRIES: 'so:stock_entries',
  SUPPLIERS: 'so:suppliers',
  PURCHASE_ORDERS: 'so:purchase_orders',
  REFUNDS: 'so:refunds',
  STOCK_BATCHES: 'so:stock_batches',
  WEBAUTHN: 'so:webauthn',
  AUDIT_LOGS: 'so:audit_logs'
  ,ROLES: 'so:roles'
};

const MOCK_ROLES = [
  { id: 'role_superadmin', name: 'Super admin', description: 'Protected full-access system role.', is_system_role: true, permissions: Object.fromEntries(ALL_PERMISSION_KEYS.map(key => [key, true])) },
  { id: 'role_user', name: 'User', description: 'Protected standard operational user role.', is_system_role: true, permissions: Object.fromEntries(DEFAULT_USER_PERMISSION_KEYS.map(key => [key, true])) },
];

function normalizeProfile(profile) {
  const roleRecord = profile?.assigned_role || profile?.role_record;
  const permissionRows = roleRecord?.role_permissions || [];
  const permissions = Object.fromEntries(permissionRows.filter(row => row.granted).map(row => [row.permission_key, true]));
  return { ...profile, role_name: roleRecord?.name || (profile?.role === 'superadmin' ? 'Super admin' : 'User'), is_system_role: !!roleRecord?.is_system_role, permissions };
}

async function getFunctionError(data, error, fallback) {
  if (data?.error) return data.error;
  if (error?.context) {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    } catch {
      // Fall through to the SDK or fallback message.
    }
  }
  return error?.message || fallback;
}

function initLocalStorage() {
  if (!localStorage.getItem(KEYS.ROLES)) localStorage.setItem(KEYS.ROLES, JSON.stringify(MOCK_ROLES));
  if (!localStorage.getItem(KEYS.USERS)) {
    localStorage.setItem(KEYS.USERS, JSON.stringify([{ ...SUPER_ADMIN_MOCK, role_id: 'role_superadmin', role_name: 'Super admin', permissions: MOCK_ROLES[0].permissions }]));
  } else {
    const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
    const migratedUsers = users.map(user => user.role_id ? user : { ...user, role_id: user.role === 'superadmin' ? 'role_superadmin' : 'role_user' });
    localStorage.setItem(KEYS.USERS, JSON.stringify(migratedUsers));
  }
  if (!localStorage.getItem(KEYS.CATEGORIES)) {
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(SEED_CATEGORIES));
  }
  if (!localStorage.getItem(KEYS.PRODUCTS)) {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(SEED_PRODUCTS));
  }
  if (!localStorage.getItem(KEYS.CUSTOMERS)) {
    localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(SEED_CUSTOMERS));
  }
  if (!localStorage.getItem(KEYS.ORDERS)) {
    localStorage.setItem(KEYS.ORDERS, JSON.stringify([]));
  }
  if (!localStorage.getItem(KEYS.PAYMENTS)) localStorage.setItem(KEYS.PAYMENTS, '[]');
  if (!localStorage.getItem(KEYS.STOCK_HISTORY)) {
    localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify([]));
  }
  if (!localStorage.getItem(KEYS.STOCK_ENTRIES)) localStorage.setItem(KEYS.STOCK_ENTRIES, '[]');
  if (!localStorage.getItem(KEYS.SUPPLIERS)) localStorage.setItem(KEYS.SUPPLIERS, '[]');
  if (!localStorage.getItem(KEYS.PURCHASE_ORDERS)) localStorage.setItem(KEYS.PURCHASE_ORDERS, '[]');
  if (!localStorage.getItem(KEYS.REFUNDS)) localStorage.setItem(KEYS.REFUNDS, '[]');
  if (!localStorage.getItem(KEYS.STOCK_BATCHES)) {
    const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS) || '[]');
    localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(products.filter(p => Number(p.stock) > 0).map((p, index) => ({
      id: `batch_initial_${index}_${p.id}`,
      product_id: p.id,
      quantity_remaining: Number(p.stock),
      cost_price: Number(p.cost_price || 0),
      source: 'initial',
      source_reference: null,
      received_at: p.created_at || new Date(0).toISOString()
    }))));
  }
  if (!localStorage.getItem(KEYS.WEBAUTHN)) {
    localStorage.setItem(KEYS.WEBAUTHN, JSON.stringify([]));
  }
  if (!localStorage.getItem(KEYS.AUDIT_LOGS)) {
    localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify([]));
  }
}

initLocalStorage();

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function addMockBatch(batches, productId, quantity, costPrice, source, sourceReference = null, receivedAt = new Date().toISOString()) {
  if (Number(quantity) <= 0) return;
  batches.push({ id: uid('batch'), product_id: productId, quantity_remaining: Number(quantity), cost_price: Number(costPrice || 0), source, source_reference: sourceReference, received_at: receivedAt });
}

function consumeMockFifo(batches, productId, quantity) {
  let remaining = Number(quantity);
  const usages = [];
  const available = batches.filter(b => b.product_id === productId && Number(b.quantity_remaining) > 0).sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
  for (const batch of available) {
    if (!remaining) break;
    const used = Math.min(remaining, Number(batch.quantity_remaining));
    batch.quantity_remaining -= used;
    usages.push({ id: uid('usage'), stock_batch_id: batch.id, quantity: used, returned_quantity: 0, cost_price_at_time: Number(batch.cost_price) });
    remaining -= used;
  }
  if (remaining) throw new Error(`Insufficient FIFO batch stock. Missing ${remaining} item(s).`);
  return usages;
}

function restoreMockFifo(batches, usages, quantity) {
  let remaining = Number(quantity);
  for (const usage of [...(usages || [])].reverse()) {
    if (!remaining) break;
    const available = Number(usage.quantity) - Number(usage.returned_quantity || 0);
    const restored = Math.min(remaining, available);
    const batch = batches.find(b => b.id === usage.stock_batch_id);
    if (!batch) throw new Error('The original FIFO stock batch no longer exists.');
    batch.quantity_remaining += restored;
    usage.returned_quantity = Number(usage.returned_quantity || 0) + restored;
    remaining -= restored;
  }
  if (remaining) throw new Error(`Unable to restore ${remaining} item(s) to their original batches.`);
}

async function logAudit(userId, action, targetTable, targetId) {
  if (isMock) {
    const logs = JSON.parse(localStorage.getItem(KEYS.AUDIT_LOGS) || '[]');
    logs.push({
      id: uid('al'),
      user_id: userId,
      action,
      target_table: targetTable,
      target_id: targetId,
      created_at: new Date().toISOString()
    });
    localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify(logs));
  } else {
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: userId,
          action,
          target_table: targetTable,
          target_id: targetId
        });
    } catch (err) {
      console.error("Failed to write audit log:", err);
    }
  }
}

export const db = {
  async isCurrentUserSuperAdmin(userId) {
    if (isMock) {
      const profile = await this.getCurrentProfile(userId);
      return profile?.role_name === 'Super admin' && (profile?.role_id === 'role_superadmin' || profile?.role === 'superadmin');
    }
    const { data, error } = await supabase.rpc('is_super_admin', { check_user_id: userId });
    if (error) throw error;
    return data === true;
  },

  async getCurrentProfile(cachedUserId) {
    if (isMock) {
      const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
      const roles = JSON.parse(localStorage.getItem(KEYS.ROLES) || '[]');
      const user = users.find(item => item.id === cachedUserId);
      const role = roles.find(item => item.id === user?.role_id) || roles.find(item => item.name === (user?.role === 'superadmin' ? 'Super admin' : 'User'));
      return user ? { ...user, role_id: role?.id, role_name: role?.name, permissions: role?.permissions || {} } : null;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await supabase.from('users').select('*, assigned_role:roles!users_role_id_fkey(id,name,is_system_role,role_permissions(permission_key,granted))').eq('id', auth.user.id).single();
    if (error) throw error;
    return normalizeProfile(data);
  },

  // Login with Username/Mobile and Password
  async login(username, password) {
    if (isMock) {
      const users = JSON.parse(localStorage.getItem(KEYS.USERS));
      const u = users.find(x => 
        (x.username === username || x.mobile === username || x.email === username) && 
        x.password === password
      );
      if (!u) throw new Error("Incorrect username/mobile or password.");
      const roles = JSON.parse(localStorage.getItem(KEYS.ROLES) || '[]');
      const role = roles.find(r => r.id === u.role_id) || roles.find(r => r.name === (u.role === 'superadmin' ? 'Super admin' : 'User'));
      return { ...u, role_id: role?.id, role_name: role?.name, permissions: role?.permissions || {} };
    } else {
      const { data: profile, error: pError } = await supabase
        .from('users')
        .select('email, role')
        .or(`email.eq.${username},mobile.eq.${username},name.eq.${username}`)
        .maybeSingle();

      if (pError) throw new Error("Database query failed: " + pError.message);
      
      const emailToAuth = profile ? profile.email : username;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToAuth,
        password: password
      });

      if (error) throw new Error("Authentication failed: " + error.message);

      const { data: userProfile, error: profileErr } = await supabase
        .from('users')
        .select('*, assigned_role:roles!users_role_id_fkey(id,name,is_system_role,role_permissions(permission_key,granted))')
        .eq('id', data.user.id)
        .single();

      if (profileErr) throw new Error("Profile retrieval failed: " + profileErr.message);
      return normalizeProfile(userProfile);
    }
  },

  // Update password (resolves first-login password change)
  async updatePassword(userId, newPassword) {
    if (isMock) {
      const users = JSON.parse(localStorage.getItem(KEYS.USERS));
      const nextUsers = users.map(u => 
        u.id === userId ? { ...u, password: newPassword, must_change_password: false } : u
      );
      localStorage.setItem(KEYS.USERS, JSON.stringify(nextUsers));
      return { success: true };
    } else {
      const { error: authErr } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (authErr) throw new Error("Failed to update password: " + authErr.message);

      const { error: dbErr } = await supabase
        .from('users')
        .update({ must_change_password: false })
        .eq('id', userId);
      
      if (dbErr) throw new Error("Failed to update profile flag: " + dbErr.message);
      return { success: true };
    }
  },

  // Fetch Categories
  async fetchCategories() {
    if (isMock) {
      return JSON.parse(localStorage.getItem(KEYS.CATEGORIES)).filter(c => !c.is_deleted);
    } else {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data;
    }
  },

  // Fetch Products
  async fetchProducts() {
    if (isMock) {
      return JSON.parse(localStorage.getItem(KEYS.PRODUCTS)).filter(p => !p.is_deleted);
    } else {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data;
    }
  },

  // Fetch stock movements for daily/monthly stock reports
  async fetchStockHistory() {
    if (isMock) {
      return JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY) || '[]');
    } else {
      const { data, error } = await supabase
        .from('stock_history')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  },

  async fetchStockBatches() {
    if (isMock) return JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]').sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
    const { data, error } = await supabase.from('stock_batches').select('id, product_id, quantity_remaining, cost_price, source, source_reference, received_at').order('received_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Fetch Customers
  async fetchCustomers() {
    if (isMock) {
      return JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)).filter(c => !c.is_deleted).map(c => ({ ...c, credit_balance: Number(c.credit_balance || 0) }));
    } else {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data;
    }
  },

  // Fetch Orders
  async fetchOrders() {
    if (isMock) {
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS) || '[]');
      const refunds = JSON.parse(localStorage.getItem(KEYS.REFUNDS) || '[]');
      return (JSON.parse(localStorage.getItem(KEYS.ORDERS)) || []).filter(o => !o.is_deleted).map(o => {
        const customer = customers.find(c => c.id === o.customer_id);
        return { ...o, customer, refunds: refunds.filter(refund => refund.order_id === o.id), customerName: customer?.name || o.customerName || 'Unknown', pack_status: o.pack_status || 'pending' };
      });
    } else {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(name, company, mobile, email, address, nic, bank_details, notes),
          creator:users(name),
          refunds(id, amount, method, created_at),
          items:order_items(
            *,
            product:products(name),
            batch_usage:order_item_batch_usage(quantity, returned_quantity, cost_price_at_time, stock_batch_id)
          )
        `)
        .eq('is_deleted', false)
        .order('order_number', { ascending: false });
      if (error) throw error;
      
      // Map relations so naming mimics Mock structures in frontend
      return (data || []).map(o => ({
        ...o,
        customerName: o.customer ? o.customer.name : 'Unknown',
        created_by_name: o.creator?.name || 'Unknown user',
        items: (o.items || []).map(i => ({
          ...i,
          name: i.product ? i.product.name : 'Unknown Product'
        }))
      }));
    }
  },

  // Get active dashboard stats summary
  async getDashboardStats() {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const categories = JSON.parse(localStorage.getItem(KEYS.CATEGORIES)) || [];
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];

      const activeOrders = orders.filter(o => !o.is_deleted);
      const activeProducts = products.filter(p => !p.is_deleted);
      const activeCategories = categories.filter(c => !c.is_deleted);
      const activeCustomers = customers.filter(c => !c.is_deleted);

      const todayStr = new Date().toDateString();
      const todaysOrders = activeOrders.filter(o => new Date(o.created_at).toDateString() === todayStr);
      const todaysSales = todaysOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

      const currentMonthStr = new Date().toISOString().slice(0, 7);
      const monthlyOrders = activeOrders.filter(o => o.created_at.slice(0, 7) === currentMonthStr);
      const monthlySales = monthlyOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

      const pendingOrders = activeOrders.filter(o => o.status !== 'paid').length;
      const outstandingBalance = activeCustomers.reduce((sum, c) => sum + Number(c.balance || 0), 0);
      const lowStockCount = activeProducts.filter(p => p.stock <= 10).length;

      return {
        todaysSales,
        monthlySales,
        todaysOrdersCount: todaysOrders.length,
        pendingOrders,
        outstandingBalance,
        totalProducts: activeProducts.length,
        totalCategories: activeCategories.length,
        totalCustomers: activeCustomers.length,
        lowStockCount
      };
    } else {
      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0,0,0,0);

      const { data: todayOrders, error: e1 } = await supabase
        .from('orders')
        .select('total')
        .eq('is_deleted', false)
        .gte('created_at', todayStart.toISOString());
      
      const todaysSales = (todayOrders || []).reduce((sum, o) => sum + Number(o.total), 0);
      const todaysOrdersCount = (todayOrders || []).length;

      const { data: monthOrders, error: e2 } = await supabase
        .from('orders')
        .select('total')
        .eq('is_deleted', false)
        .gte('created_at', monthStart.toISOString());
      
      const monthlySales = (monthOrders || []).reduce((sum, o) => sum + Number(o.total), 0);

      const { count: pendingOrders, error: e3 } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .neq('status', 'paid');

      const { data: custBalances, error: e4 } = await supabase
        .from('customers')
        .select('balance')
        .eq('is_deleted', false);
      const outstandingBalance = (custBalances || []).reduce((sum, c) => sum + Number(c.balance), 0);

      const { count: totalProducts } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_deleted', false);
      const { count: totalCategories } = await supabase.from('categories').select('*', { count: 'exact', head: true }).eq('is_deleted', false);
      const { count: totalCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_deleted', false);
      
      const { count: lowStockCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .lte('stock', 10);

      if (e1 || e2 || e3 || e4) {
        console.error("Dashboard stats query error:", { e1, e2, e3, e4 });
      }

      return {
        todaysSales,
        monthlySales,
        todaysOrdersCount,
        pendingOrders: pendingOrders || 0,
        outstandingBalance,
        totalProducts: totalProducts || 0,
        totalCategories: totalCategories || 0,
        totalCustomers: totalCustomers || 0,
        lowStockCount: lowStockCount || 0
      };
    }
  },

  // Confirm and create order
  async createOrder(customerId, cartItems, grandTotal, createdByProfile) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
      const stockHist = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY)) || [];
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');

      for (const item of cartItems) {
        const p = products.find(prod => prod.id === item.productId);
        if (!p) throw new Error(`Product ${item.name} not found.`);
        if (p.stock < item.qty) {
          throw new Error(`Insufficient stock for ${item.name}. Available: ${p.stock}, Requested: ${item.qty}`);
        }
      }

      const orderId = uid('o');
      const orderNumber = orders.length + 1;

      const newOrder = {
        id: orderId,
        order_number: orderNumber,
        customer_id: customerId,
        total: grandTotal,
        paid_amount: 0.00,
        status: 'unpaid',
        pack_status: 'pending',
        created_by: createdByProfile.id,
        created_by_name: createdByProfile.name || createdByProfile.username,
        created_at: new Date().toISOString(),
        is_deleted: false,
        items: cartItems.map(i => ({
          id: uid('oi'),
          order_id: orderId,
          product_id: i.productId,
          quantity: i.qty,
          unit_price: i.price,
          name: i.name,
          returned_quantity: 0,
          batch_usage: consumeMockFifo(batches, i.productId, i.qty)
        }))
      };

      const updatedProducts = products.map(p => {
        const cItem = cartItems.find(ci => ci.productId === p.id);
        if (cItem) {
          stockHist.push({
            id: uid('sh'),
            product_id: p.id,
            change_amount: -cItem.qty,
            reason: 'order_created',
            created_at: new Date().toISOString()
          });
          return { ...p, stock: p.stock - cItem.qty };
        }
        return p;
      });

      const updatedCustomers = customers.map(c => {
        if (c.id === customerId) {
          return { ...c, balance: Number(c.balance || 0) + grandTotal };
        }
        return c;
      });

      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updatedProducts));
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updatedCustomers));
      localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(stockHist));
      localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
      localStorage.setItem(KEYS.ORDERS, JSON.stringify([newOrder, ...orders]));

      return newOrder;
    } else {
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_id: customerId,
          total: grandTotal,
          paid_amount: 0.00,
          status: 'unpaid',
          pack_status: 'pending',
          created_by: createdByProfile.id
        })
        .select()
        .single();

      if (orderErr) throw new Error("Order creation failed: " + orderErr.message);

      const itemsToInsert = cartItems.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        quantity: item.qty,
        unit_price: item.price
      }));

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(itemsToInsert);

      if (itemsErr) {
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error("Failed to record items: " + itemsErr.message);
      }

      return order;
    }
  },

  // Edit quantity of a line item in an active order
  async updateOrderItemQty(orderId, productId, oldQty, newQty, unitPrice) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
      const stockHist = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY)) || [];
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');

      const product = products.find(p => p.id === productId);
      const diff = newQty - oldQty;
      if (diff > 0 && product.stock < diff) {
        throw new Error(`Insufficient stock for ${product.name}. Only ${product.stock} items left.`);
      }
      const targetOrder = orders.find(o => o.id === orderId);
      const targetItem = targetOrder?.items.find(i => i.product_id === productId);
      if (!targetItem) throw new Error('Order item not found.');
      if (diff > 0) targetItem.batch_usage = [...(targetItem.batch_usage || []), ...consumeMockFifo(batches, productId, diff)];
      if (diff < 0) restoreMockFifo(batches, targetItem.batch_usage, -diff);

      const updatedProducts = products.map(p => {
        if (p.id === productId) {
          stockHist.push({
            id: uid('sh'),
            product_id: p.id,
            change_amount: -diff,
            reason: 'order_edited',
            created_at: new Date().toISOString()
          });
          return { ...p, stock: p.stock - diff };
        }
        return p;
      });

      const priceDiff = diff * unitPrice;

      const updatedOrders = orders.map(o => {
        if (o.id === orderId) {
          const updatedItems = o.items.map(item => {
            if (item.product_id === productId) {
              return { ...item, quantity: newQty };
            }
            return item;
          });
          
          const nextTotal = Number(o.total) + priceDiff;
          
          const customerId = o.customer_id;
          const updatedCusts = customers.map(c => {
            if (c.id === customerId) {
              return { ...c, balance: Number(c.balance || 0) + priceDiff };
            }
            return c;
          });
          localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updatedCusts));

          return { 
            ...o, 
            total: nextTotal, 
            items: updatedItems,
            status: o.paid_amount >= nextTotal ? 'paid' : (o.paid_amount > 0 ? 'partial' : 'unpaid')
          };
        }
        return o;
      });

      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updatedProducts));
      localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(stockHist));
      localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));
      return { success: true };
    } else {
      // 1. Update line item quantity (fires trigger_order_item_stock)
      const { error: itemErr } = await supabase
        .from('order_items')
        .update({ quantity: newQty })
        .eq('order_id', orderId)
        .eq('product_id', productId);

      if (itemErr) throw new Error("Failed to update item: " + itemErr.message);

      // 2. Fetch remaining items
      const { data: items, error: fetchItemsErr } = await supabase
        .from('order_items')
        .select('quantity, unit_price')
        .eq('order_id', orderId);

      if (fetchItemsErr) throw new Error("Failed to fetch order items: " + fetchItemsErr.message);

      const nextTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

      // 3. Update orders total (fires trigger_order_balance)
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ total: nextTotal })
        .eq('id', orderId);

      if (orderErr) throw new Error("Failed to update order total: " + orderErr.message);

      return { success: true };
    }
  },

  // Remove a line item entirely from an order
  async removeOrderItem(orderId, productId, qty, unitPrice) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
      const stockHist = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY)) || [];
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');
      const orderToEdit = orders.find(o => o.id === orderId);
      const itemToRemove = orderToEdit?.items.find(i => i.product_id === productId);
      restoreMockFifo(batches, itemToRemove?.batch_usage, qty - Number(itemToRemove?.returned_quantity || 0));

      const updatedProducts = products.map(p => {
        if (p.id === productId) {
          stockHist.push({
            id: uid('sh'),
            product_id: p.id,
            change_amount: qty,
            reason: 'order_deleted',
            created_at: new Date().toISOString()
          });
          return { ...p, stock: p.stock + qty };
        }
        return p;
      });

      const priceDiff = qty * unitPrice;

      const updatedOrders = orders.map(o => {
        if (o.id === orderId) {
          const updatedItems = o.items.filter(item => item.product_id !== productId);
          const nextTotal = Number(o.total) - priceDiff;

          const customerId = o.customer_id;
          const updatedCusts = customers.map(c => {
            if (c.id === customerId) {
              return { ...c, balance: Number(c.balance || 0) - priceDiff };
            }
            return c;
          });
          localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updatedCusts));

          return { 
            ...o, 
            total: nextTotal, 
            items: updatedItems,
            status: o.paid_amount >= nextTotal ? 'paid' : (o.paid_amount > 0 ? 'partial' : 'unpaid')
          };
        }
        return o;
      });

      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updatedProducts));
      localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(stockHist));
      localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));
      return { success: true };
    } else {
      // 1. Delete row (fires trigger_order_item_stock)
      const { error: itemErr } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId)
        .eq('product_id', productId);

      if (itemErr) throw new Error("Failed to delete item: " + itemErr.message);

      // 2. Fetch remaining items
      const { data: items, error: fetchItemsErr } = await supabase
        .from('order_items')
        .select('quantity, unit_price')
        .eq('order_id', orderId);

      if (fetchItemsErr) throw new Error("Failed to fetch order items: " + fetchItemsErr.message);

      const nextTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

      // 3. Update orders total (fires trigger_order_balance)
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ total: nextTotal })
        .eq('id', orderId);

      if (orderErr) throw new Error("Failed to update order total: " + orderErr.message);

      return { success: true };
    }
  },

  // Record a payment against an order
  async recordPayment(orderId, amount, recordedByUserId) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];

      const updatedOrders = orders.map(o => {
        if (o.id === orderId) {
          const nextPaid = Number(o.paid_amount || 0) + Number(amount);
          
          const customerId = o.customer_id;
          const updatedCusts = customers.map(c => {
            if (c.id === customerId) {
              return { ...c, balance: Number(c.balance || 0) - Number(amount) };
            }
            return c;
          });
          localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updatedCusts));

          return {
            ...o,
            paid_amount: nextPaid,
            status: nextPaid >= o.total ? 'paid' : (nextPaid > 0 ? 'partial' : 'unpaid')
          };
        }
        return o;
      });

      localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));
      return { success: true };
    } else {
      // Insert payment. Fires trigger_payment_recorded:
      // updates orders.paid_amount, orders.status, and customers.balance
      const { error } = await supabase
        .from('payments')
        .insert({
          order_id: orderId,
          amount: amount,
          recorded_by: recordedByUserId
        });

      if (error) throw new Error("Failed to record payment: " + error.message);
      return { success: true };
    }
  },

  // Allocate one customer payment across outstanding orders, oldest first.
  async recordCustomerPayment(customerId, amount, recordedByUserId, resolution = null, refundMethod = null) {
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new Error('Enter a valid payment amount.');

    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS) || '[]');
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS) || '[]');
      const payments = JSON.parse(localStorage.getItem(KEYS.PAYMENTS) || '[]');
      const refunds = JSON.parse(localStorage.getItem(KEYS.REFUNDS) || '[]');
      const outstandingOrders = orders
        .filter(order => order.customer_id === customerId && !order.is_deleted && Number(order.total) > Number(order.paid_amount || 0))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const totalOutstanding = outstandingOrders.reduce((sum, order) => sum + Number(order.total) - Number(order.paid_amount || 0), 0);
      if (totalOutstanding <= 0) throw new Error('This customer has no outstanding orders.');

      const excess = Math.max(0, paymentAmount - totalOutstanding);
      if (excess > 0 && !['refund', 'credit'].includes(resolution)) throw new Error('Choose how to resolve the excess payment.');
      if (excess > 0 && resolution === 'refund' && !String(refundMethod || '').trim()) throw new Error('Refund method is required.');

      let remaining = Math.min(paymentAmount, totalOutstanding);
      const allocations = [];
      for (const order of outstandingOrders) {
        if (remaining <= 0) break;
        const outstanding = Number(order.total) - Number(order.paid_amount || 0);
        const allocated = Math.min(remaining, outstanding);
        order.paid_amount = Number(order.paid_amount || 0) + allocated;
        order.status = order.paid_amount >= Number(order.total) ? 'paid' : 'partial';
        payments.push({ id: uid('pay'), order_id: order.id, amount: allocated, recorded_by: recordedByUserId, created_at: new Date().toISOString() });
        allocations.push({ order_id: order.id, order_number: order.order_number, amount: allocated, remaining: Math.max(0, Number(order.total) - order.paid_amount), status: order.status });
        await logAudit(recordedByUserId, `Customer payment allocation: ${allocated}`, 'orders', order.id);
        remaining -= allocated;
      }

      const customer = customers.find(item => item.id === customerId);
      if (!customer) throw new Error('Customer not found.');
      customer.balance = Math.max(0, Number(customer.balance || 0) - Math.min(paymentAmount, totalOutstanding));
      if (excess > 0 && resolution === 'credit') customer.credit_balance = Number(customer.credit_balance || 0) + excess;
      if (excess > 0 && resolution === 'refund') refunds.push({ id: uid('refund'), order_id: allocations.at(-1).order_id, amount: excess, method: String(refundMethod).trim(), recorded_by: recordedByUserId, created_at: new Date().toISOString() });

      localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(customers));
      localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(payments));
      localStorage.setItem(KEYS.REFUNDS, JSON.stringify(refunds));
      await logAudit(recordedByUserId, `Recorded customer payment ${paymentAmount} across ${allocations.length} order(s)${excess ? `; ${resolution} excess ${excess}` : ''}`, 'customers', customerId);
      return { allocations, excess, resolution };
    }

    const { data, error } = await supabase.rpc('record_customer_payment', {
      p_customer_id: customerId,
      p_amount: paymentAmount,
      p_user_id: recordedByUserId,
      p_resolution: resolution,
      p_refund_method: refundMethod
    });
    if (error) throw new Error('Failed to record customer payment: ' + error.message);
    return data;
  },

  // Soft delete an order
  async softDeleteOrder(orderId) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
      const stockHist = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY)) || [];
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');

      const orderToDelete = orders.find(o => o.id === orderId);
      if (!orderToDelete) throw new Error("Order not found.");
      orderToDelete.items.forEach(item => restoreMockFifo(batches, item.batch_usage, Number(item.quantity) - Number(item.returned_quantity || 0)));

      // Restore stock
      const updatedProducts = products.map(p => {
        const item = orderToDelete.items.find(i => i.product_id === p.id);
        if (item) {
          stockHist.push({
            id: uid('sh'),
            product_id: p.id,
            change_amount: Number(item.quantity) - Number(item.returned_quantity || 0),
            reason: 'order_deleted',
            created_at: new Date().toISOString()
          });
          return { ...p, stock: p.stock + Number(item.quantity) - Number(item.returned_quantity || 0) };
        }
        return p;
      });

      // Deduct unpaid order amount from customer balance
      const unpaidAmount = Number(orderToDelete.total) - Number(orderToDelete.paid_amount);
      const updatedCusts = customers.map(c => {
        if (c.id === orderToDelete.customer_id) {
          return { ...c, balance: Number(c.balance || 0) - unpaidAmount };
        }
        return c;
      });

      const updatedOrders = orders.map(o => {
        if (o.id === orderId) {
          return { ...o, is_deleted: true, deleted_at: new Date().toISOString() };
        }
        return o;
      });

      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updatedProducts));
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updatedCusts));
      localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(stockHist));
      localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));
      return { success: true };
    } else {
      // Soft-delete order in Supabase. Fires trigger_order_soft_delete:
      // restores stock, adds to history, and deducts unpaid portion from customer's balance.
      const { error } = await supabase
        .from('orders')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;
      return { success: true };
    }
  },

  async advanceOrderPackStatus(orderId, currentStatus, userId, transportName = '') {
    const stages = ['pending', 'packed', 'given_to_transport', 'received'];
    const currentIndex = stages.indexOf(currentStatus || 'pending');
    if (currentIndex < 0 || currentIndex >= stages.length - 1) throw new Error('This order cannot advance further.');
    const nextStatus = stages[currentIndex + 1];
    if (nextStatus === 'given_to_transport' && !transportName.trim()) throw new Error('Transport or courier name is required.');
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS) || '[]');
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found.');
      const actualStatus = order.pack_status || 'pending';
      if (actualStatus !== currentStatus) throw new Error('Packing status changed elsewhere. Refresh and try again.');
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders.map(o => o.id === orderId ? { ...o, pack_status: nextStatus, ...(nextStatus === 'given_to_transport' ? { transport_name: transportName.trim() } : {}) } : o)));
    } else {
      const { data, error } = await supabase.from('orders').update({ pack_status: nextStatus, ...(nextStatus === 'given_to_transport' ? { transport_name: transportName.trim() } : {}) }).eq('id', orderId).eq('pack_status', currentStatus).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Packing status changed elsewhere. Refresh and try again.');
    }
    await logAudit(userId, `Pack status changed from ${currentStatus} to ${nextStatus}`, 'orders', orderId);
    return { pack_status: nextStatus };
  },

  async returnOrderItems(orderId, returns, userId, resolution = null, refundMethod = null) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS) || '[]');
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS) || '[]');
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS) || '[]');
      const history = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY) || '[]');
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');
      const refunds = JSON.parse(localStorage.getItem(KEYS.REFUNDS) || '[]');
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found.');
      const originalTotal = Number(order.total || 0);
      const amountAlreadyPaid = Number(order.paid_amount || 0);
      let returnedValue = 0;
      for (const item of order.items) {
        const qty = Number(returns[item.id] || 0);
        const available = Number(item.quantity) - Number(item.returned_quantity || 0);
        if (qty < 0 || qty > available) throw new Error(`Invalid return quantity for ${item.name}.`);
        if (!qty) continue;
        restoreMockFifo(batches, item.batch_usage, qty);
        item.returned_quantity = Number(item.returned_quantity || 0) + qty;
        const product = products.find(p => p.id === item.product_id);
        product.stock = Number(product.stock) + qty;
        returnedValue += qty * Number(item.unit_price);
        history.push({ id: uid('sh'), product_id: item.product_id, change_amount: qty, reason: 'order_return', created_at: new Date().toISOString() });
      }
      if (!returnedValue) throw new Error('Select at least one item to return.');
      const newOrderTotal = Math.max(0, originalTotal - returnedValue);
      const newBalance = newOrderTotal - amountAlreadyPaid;
      const overpaidAmount = Math.max(0, -newBalance);
      if (overpaidAmount > 0 && !['refund', 'credit'].includes(resolution)) throw new Error('Choose how to resolve the overpaid amount.');
      if (overpaidAmount > 0 && resolution === 'refund') {
        if (!refundMethod?.trim()) throw new Error('Refund method is required.');
        refunds.push({ id: uid('refund'), order_id: orderId, amount: overpaidAmount, method: refundMethod.trim(), recorded_by: userId, created_at: new Date().toISOString() });
      }
      order.total = newOrderTotal;
      order.paid_amount = Math.min(amountAlreadyPaid, newOrderTotal);
      order.status = order.paid_amount >= order.total ? 'paid' : order.paid_amount > 0 ? 'partial' : 'unpaid';
      order.has_returns = true;
      if (overpaidAmount > 0 && resolution === 'credit') order.return_credit_amount = Number(order.return_credit_amount || 0) + overpaidAmount;
      const customer = customers.find(c => c.id === order.customer_id);
      if (customer) {
        const originalOutstanding = Math.max(0, originalTotal - amountAlreadyPaid);
        const newOutstanding = Math.max(0, newBalance);
        customer.balance = Math.max(0, Number(customer.balance || 0) - originalOutstanding + newOutstanding);
        if (overpaidAmount > 0 && resolution === 'credit') customer.credit_balance = Number(customer.credit_balance || 0) + overpaidAmount;
      }
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders)); localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products)); localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(customers)); localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(history)); localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches)); localStorage.setItem(KEYS.REFUNDS, JSON.stringify(refunds));
      await logAudit(userId, `Returned order items totaling ${returnedValue}${overpaidAmount > 0 ? `; ${resolution} ${overpaidAmount}` : ''}`, 'orders', orderId);
      return { returned_value: returnedValue, new_order_total: newOrderTotal, new_balance: newBalance, overpaid_amount: overpaidAmount, resolution };
    }
    const { error } = await supabase.rpc('return_order_items', { p_order_id: orderId, p_returns: returns, p_user_id: userId, p_resolution: resolution, p_refund_method: refundMethod });
    if (error) throw error;
    return { success: true };
  },

  // WEBAUTHN DEVICE-NATIVE BIOMETRICS

  isWebAuthnSupported() {
    return !!(window.isSecureContext &&
              window.PublicKeyCredential &&
              navigator.credentials &&
              navigator.credentials.create &&
              navigator.credentials.get);
  },

  async registerBiometric() {
    if (!this.isWebAuthnSupported()) {
      throw new Error("Biometric sign-in (WebAuthn) is not supported by your browser or requires a secure context (HTTPS/localhost).");
    }

    if (isMock) {
      throw new Error("Secure fingerprint login requires Supabase and cannot be enabled in local mock mode.");
    }

    try {
      const { data: begin, error: beginError } = await supabase.functions.invoke('webauthn', {
        body: { action: 'registration-options' },
      });
      if (beginError || begin?.error) throw new Error(await getFunctionError(begin, beginError, "Could not begin fingerprint registration."));

      const credential = await startRegistration({ optionsJSON: begin.options });
      const { data: result, error: verifyError } = await supabase.functions.invoke('webauthn', {
        body: {
          action: 'registration-verify',
          ceremonyId: begin.ceremonyId,
          credential,
          deviceName: navigator.userAgent,
        },
      });
      if (verifyError || result?.error || !result?.verified) {
        throw new Error(await getFunctionError(result, verifyError, "The server could not verify this fingerprint credential."));
      }

      localStorage.setItem('so:registered_credential_id', result.credentialId);
      return { success: true, credentialId: result.credentialId };
    } catch (err) {
      console.error("WebAuthn register error:", err);
      if (err?.name === 'NotAllowedError') throw new Error("Fingerprint registration was cancelled or timed out.");
      throw new Error(err.message || "Failed to set up fingerprint biometric login.");
    }
  },

  async loginWithBiometric() {
    if (!this.isWebAuthnSupported()) {
      throw new Error("Biometric sign-in is not supported on this device/connection.");
    }

    const registeredCredId = localStorage.getItem('so:registered_credential_id');
    if (!registeredCredId) {
      throw new Error("No fingerprint login is registered on this device. Please log in with password first.");
    }

    if (isMock) {
      throw new Error("Secure fingerprint login requires Supabase. Sign in with your password while local mock mode is active.");
    }

    try {
      const { data: begin, error: beginError } = await supabase.functions.invoke('webauthn', {
        body: { action: 'authentication-options', credentialId: registeredCredId },
      });
      if (beginError || begin?.error) throw new Error(await getFunctionError(begin, beginError, "Could not begin fingerprint authentication."));

      const credential = await startAuthentication({ optionsJSON: begin.options });
      const { data: result, error: verifyError } = await supabase.functions.invoke('webauthn', {
        body: { action: 'authentication-verify', ceremonyId: begin.ceremonyId, credential },
      });
      if (verifyError || result?.error || !result?.verified || !result?.tokenHash) {
        throw new Error(await getFunctionError(result, verifyError, "The server rejected this fingerprint authentication."));
      }

      const { error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: 'magiclink',
      });
      if (sessionError) throw new Error("Fingerprint was verified, but an authenticated session could not be created: " + sessionError.message);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("The authenticated account could not be loaded.");
      const { data: userProfile, error: profileError } = await supabase
        .from('users').select('*, assigned_role:roles!users_role_id_fkey(id,name,is_system_role,role_permissions(permission_key,granted))').eq('id', authData.user.id).single();
      if (profileError) throw new Error("Failed to load profile: " + profileError.message);
      return normalizeProfile(userProfile);
    } catch (err) {
      console.error("WebAuthn verification error:", err);
      if (err?.name === 'NotAllowedError') throw new Error("Fingerprint authentication was cancelled, timed out, or not recognized.");
      throw new Error(err.message || "Fingerprint recognition failed.");
    }
  },

  // Create Category
  async createCategory(name, description, imageUrl = "", userId) {
    if (isMock) {
      const categories = JSON.parse(localStorage.getItem(KEYS.CATEGORIES)) || [];
      const newCat = {
        id: uid('c'),
        name,
        description,
        image_url: imageUrl,
        is_deleted: false,
        created_at: new Date().toISOString()
      };
      categories.push(newCat);
      localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(categories));
      await logAudit(userId, `Created category: ${name}`, 'categories', newCat.id);
      return newCat;
    } else {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name, description, image_url: imageUrl })
        .select()
        .single();
      if (error) throw error;
      await logAudit(userId, `Created category: ${name}`, 'categories', data.id);
      return data;
    }
  },

  // Update Category
  async updateCategory(id, name, description, imageUrl = "", userId) {
    if (isMock) {
      const categories = JSON.parse(localStorage.getItem(KEYS.CATEGORIES)) || [];
      const updated = categories.map(c => 
        c.id === id ? { ...c, name, description, image_url: imageUrl } : c
      );
      localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(updated));
      await logAudit(userId, `Updated category: ${name}`, 'categories', id);
      return { success: true };
    } else {
      const { error } = await supabase
        .from('categories')
        .update({ name, description, image_url: imageUrl })
        .eq('id', id);
      if (error) throw error;
      await logAudit(userId, `Updated category: ${name}`, 'categories', id);
      return { success: true };
    }
  },

  // Delete Category (Soft)
  async deleteCategory(id, userId) {
    if (isMock) {
      const categories = JSON.parse(localStorage.getItem(KEYS.CATEGORIES)) || [];
      const cat = categories.find(c => c.id === id);
      const name = cat ? cat.name : "Unknown";
      const updated = categories.map(c => 
        c.id === id ? { ...c, is_deleted: true, deleted_at: new Date().toISOString() } : c
      );
      localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(updated));
      await logAudit(userId, `Deleted category: ${name}`, 'categories', id);
      return { success: true };
    } else {
      const { data: cat } = await supabase.from('categories').select('name').eq('id', id).maybeSingle();
      const name = cat ? cat.name : "Unknown";
      const { error } = await supabase
        .from('categories')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await logAudit(userId, `Deleted category: ${name}`, 'categories', id);
      return { success: true };
    }
  },

  // Create Product
  async createProduct(categoryId, name, sku, barcode, costPrice, sellingPrice, stock, description = "", imageUrl = "", userId) {
    if (isMock) {
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const stockHist = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY)) || [];
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');
      const newProd = {
        id: uid('p'),
        category_id: categoryId,
        name,
        sku,
        barcode,
        cost_price: Number(costPrice),
        selling_price: Number(sellingPrice),
        stock: Number(stock),
        description,
        image_url: imageUrl,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false
      };
      products.push(newProd);
      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products));
      if (Number(stock) > 0) {
        addMockBatch(batches, newProd.id, Number(stock), Number(costPrice), 'initial', newProd.id, newProd.created_at);
        stockHist.push({
          id: uid('sh'),
          product_id: newProd.id,
          change_amount: Number(stock),
          reason: 'restock',
          created_at: new Date().toISOString()
        });
        localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(stockHist));
        localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
      }
      await logAudit(userId, `Created product: ${name} (Initial stock: ${stock})`, 'products', newProd.id);
      return newProd;
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert({
          category_id: categoryId,
          name,
          sku,
          barcode,
          cost_price: Number(costPrice),
          selling_price: Number(sellingPrice),
          stock: Number(stock),
          description,
          image_url: imageUrl,
          created_by: userId
        })
        .select()
        .single();
      if (error) throw error;
      if (Number(stock) > 0) {
        await supabase.from('stock_batches').insert({ product_id: data.id, quantity_remaining: Number(stock), cost_price: Number(costPrice), source: 'initial', source_reference: data.id, received_at: data.created_at });
        await supabase.from('stock_history').insert({
          product_id: data.id,
          change_amount: Number(stock),
          reason: 'restock'
        });
      }
      await logAudit(userId, `Created product: ${name} (Initial stock: ${stock})`, 'products', data.id);
      return data;
    }
  },

  // Update Product
  async updateProduct(id, categoryId, name, sku, barcode, costPrice, sellingPrice, description = "", imageUrl = "", userId) {
    if (isMock) {
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const updated = products.map(p => 
        p.id === id ? { 
          ...p, 
          category_id: categoryId, 
          name, 
          sku, 
          barcode, 
          cost_price: Number(costPrice), 
          selling_price: Number(sellingPrice), 
          description, 
          image_url: imageUrl,
          updated_at: new Date().toISOString()
        } : p
      );
      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updated));
      await logAudit(userId, `Updated product: ${name}`, 'products', id);
      return { success: true };
    } else {
      const { error } = await supabase
        .from('products')
        .update({
          category_id: categoryId,
          name,
          sku,
          barcode,
          cost_price: Number(costPrice),
          selling_price: Number(sellingPrice),
          description,
          image_url: imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      await logAudit(userId, `Updated product: ${name}`, 'products', id);
      return { success: true };
    }
  },

  // Delete Product (Soft)
  async deleteProduct(id, userId) {
    if (isMock) {
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const prod = products.find(p => p.id === id);
      const name = prod ? prod.name : "Unknown";
      const updated = products.map(p => 
        p.id === id ? { ...p, is_deleted: true, deleted_at: new Date().toISOString() } : p
      );
      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updated));
      await logAudit(userId, `Deleted product: ${name}`, 'products', id);
      return { success: true };
    } else {
      const { data: prod } = await supabase.from('products').select('name').eq('id', id).maybeSingle();
      const name = prod ? prod.name : "Unknown";
      const { error } = await supabase
        .from('products')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await logAudit(userId, `Deleted product: ${name}`, 'products', id);
      return { success: true };
    }
  },

  // Restock Product
  async restockProduct(id, adjustQty, userId, batchCostPrice = null) {
    if (isMock) {
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
      const stockHist = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY)) || [];
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');
      const prod = products.find(p => p.id === id);
      if (!prod) throw new Error("Product not found.");
      
      const updated = products.map(p => 
        p.id === id ? { ...p, stock: p.stock + Number(adjustQty) } : p
      );
      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updated));
      const effectiveCost = batchCostPrice == null ? Number(prod.cost_price) : Number(batchCostPrice);
      if (Number(adjustQty) > 0) addMockBatch(batches, id, Number(adjustQty), effectiveCost, 'restock', id);
      else consumeMockFifo(batches, id, Math.abs(Number(adjustQty)));
      localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
      if (Number(adjustQty) > 0) localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updated.map(p => p.id === id ? { ...p, cost_price: effectiveCost } : p)));

      stockHist.push({
        id: uid('sh'),
        product_id: id,
        change_amount: Number(adjustQty),
        reason: 'restock',
        created_at: new Date().toISOString()
      });
      localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(stockHist));
      await logAudit(userId, `Restocked product: ${prod.name} (Change: ${adjustQty > 0 ? '+' : ''}${adjustQty})`, 'products', id);
      return { success: true };
    } else {
      const { data: prod, error: fetchErr } = await supabase
        .from('products')
        .select('name, stock, cost_price')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error: updateErr } = await supabase
        .from('products')
        .update({ stock: prod.stock + Number(adjustQty) })
        .eq('id', id);
      if (updateErr) throw updateErr;

      if (Number(adjustQty) > 0) {
        const effectiveCost = batchCostPrice == null ? Number(prod.cost_price || 0) : Number(batchCostPrice);
        const { error: batchErr } = await supabase.from('stock_batches').insert({ product_id: id, quantity_remaining: Number(adjustQty), cost_price: effectiveCost, source: 'restock', source_reference: id });
        if (batchErr) throw batchErr;
        await supabase.from('products').update({ cost_price: effectiveCost }).eq('id', id);
      } else {
        const { error: fifoErr } = await supabase.rpc('consume_stock_adjustment_fifo', { p_product_id: id, p_quantity: Math.abs(Number(adjustQty)) });
        if (fifoErr) throw fifoErr;
      }

      const { error: histErr } = await supabase
        .from('stock_history')
        .insert({
          product_id: id,
          change_amount: Number(adjustQty),
          reason: 'restock'
        });
      if (histErr) throw histErr;

      await logAudit(userId, `Restocked product: ${prod.name} (Change: ${adjustQty > 0 ? '+' : ''}${adjustQty})`, 'products', id);
      return { success: true };
    }
  },

  // Create Customer
  async createCustomer(name, company, address, mobile, email, nic, bankDetails, notes, userId) {
    if (isMock) {
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
      const newCust = {
        id: uid('cu'),
        name,
        company,
        address,
        mobile,
        email,
        nic,
        bank_details: bankDetails,
        notes,
        balance: 0.00,
        is_deleted: false,
        created_at: new Date().toISOString()
      };
      customers.push(newCust);
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(customers));
      await logAudit(userId, `Registered customer: ${name}`, 'customers', newCust.id);
      return newCust;
    } else {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name,
          company,
          address,
          mobile,
          email,
          nic,
          bank_details: bankDetails,
          notes,
          balance: 0.00
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(userId, `Registered customer: ${name}`, 'customers', data.id);
      return data;
    }
  },

  // Update Customer
  async updateCustomer(id, name, company, address, mobile, email, nic, bankDetails, notes, userId) {
    if (isMock) {
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
      const updated = customers.map(c => 
        c.id === id ? { ...c, name, company, address, mobile, email, nic, bank_details: bankDetails, notes } : c
      );
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updated));
      await logAudit(userId, `Updated customer profile: ${name}`, 'customers', id);
      return { success: true };
    } else {
      const { error } = await supabase
        .from('customers')
        .update({
          name,
          company,
          address,
          mobile,
          email,
          nic,
          bank_details: bankDetails,
          notes
        })
        .eq('id', id);
      if (error) throw error;
      await logAudit(userId, `Updated customer profile: ${name}`, 'customers', id);
      return { success: true };
    }
  },

  // Delete Customer (Soft)
  async deleteCustomer(id, userId) {
    if (isMock) {
      const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
      const cust = customers.find(c => c.id === id);
      const name = cust ? cust.name : "Unknown";
      const updated = customers.map(c => 
        c.id === id ? { ...c, is_deleted: true, deleted_at: new Date().toISOString() } : c
      );
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updated));
      await logAudit(userId, `Deleted customer profile: ${name}`, 'customers', id);
      return { success: true };
    } else {
      const { data: cust } = await supabase.from('customers').select('name').eq('id', id).maybeSingle();
      const name = cust ? cust.name : "Unknown";
      const { error } = await supabase
        .from('customers')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await logAudit(userId, `Deleted customer profile: ${name}`, 'customers', id);
      return { success: true };
    }
  },

  // Create Staff User
  async createStaffUser(name, mobile, email, password, roleId, creatorUserId) {
    if (isMock) {
      const users = JSON.parse(localStorage.getItem(KEYS.USERS)) || [];
      const exists = users.some(u => u.username === email || u.email === email || u.mobile === mobile);
      if (exists) throw new Error("Staff user with this email or mobile already exists.");
      
      const newStaff = {
        id: uid('u'),
        name,
        username: email.split('@')[0],
        mobile,
        email,
        password,
        role_id: roleId,
        role: roleId === 'role_superadmin' ? 'superadmin' : 'user',
        must_change_password: true,
        created_at: new Date().toISOString()
      };
      users.push(newStaff);
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      await logAudit(creatorUserId, `Registered staff account: ${name}`, 'users', newStaff.id);
      return newStaff;
    } else {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'create', name, mobile, email, password, roleId },
      });
      if (error || data?.error) throw new Error(await getFunctionError(data, error, 'Staff creation failed.'));
      await logAudit(creatorUserId, `Registered staff account: ${name}`, 'users', data.user.id);
      return data.user;
    }
  },

  async updateStaffUser(userId, values, actorId) {
    if (isMock) {
      const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
      const next = users.map(user => user.id === userId ? { ...user, ...values } : user);
      localStorage.setItem(KEYS.USERS, JSON.stringify(next));
      await logAudit(actorId, `Updated staff account: ${values.name}`, 'users', userId);
      return next.find(user => user.id === userId);
    }
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'update', userId, ...values } });
    if (error || data?.error) throw new Error(await getFunctionError(data, error, 'Staff update failed.'));
    return data.user;
  },

  async deleteStaffUser(userId) {
    if (isMock) {
      const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
      localStorage.setItem(KEYS.USERS, JSON.stringify(users.filter(user => user.id !== userId)));
      return { success: true };
    }
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', userId } });
    if (error || data?.error) throw new Error(await getFunctionError(data, error, 'Staff deletion failed.'));
    return data;
  },

  async fetchRoles() {
    if (isMock) {
      const roles = JSON.parse(localStorage.getItem(KEYS.ROLES) || '[]');
      const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
      return roles.map(role => ({ ...role, staff: users.filter(user => user.role_id === role.id) }));
    }
    const { data, error } = await supabase.from('roles').select('*, role_permissions(permission_key,granted), staff:users(id,name,email)').order('name');
    if (error) throw error;
    return (data || []).map(role => ({ ...role, permissions: Object.fromEntries((role.role_permissions || []).filter(p => p.granted).map(p => [p.permission_key, true])) }));
  },

  async saveRole(values, actorId) {
    if (isMock) {
      const roles = JSON.parse(localStorage.getItem(KEYS.ROLES) || '[]');
      if (values.id) {
        const existing = roles.find(role => role.id === values.id);
        if (existing?.is_system_role) throw new Error('System roles cannot be edited.');
        Object.assign(existing, values);
      } else {
        if (roles.some(role => role.name.toLowerCase() === values.name.toLowerCase())) throw new Error('A role with this name already exists.');
        roles.push({ ...values, id: uid('role'), is_system_role: false, created_by: actorId, created_at: new Date().toISOString() });
      }
      localStorage.setItem(KEYS.ROLES, JSON.stringify(roles));
      return { success: true };
    }
    let roleId = values.id;
    if (roleId) {
      const { error } = await supabase.from('roles').update({ name: values.name, description: values.description }).eq('id', roleId);
      if (error) throw error;
      const { error: deleteError } = await supabase.from('role_permissions').delete().eq('role_id', roleId);
      if (deleteError) throw deleteError;
    } else {
      const { data, error } = await supabase.from('roles').insert({ name: values.name, description: values.description, created_by: actorId }).select('id').single();
      if (error) throw error;
      roleId = data.id;
    }
    const rows = Object.entries(values.permissions).filter(([, granted]) => granted).map(([permission_key]) => ({ role_id: roleId, permission_key, granted: true }));
    if (rows.length) { const { error } = await supabase.from('role_permissions').insert(rows); if (error) throw error; }
    return { success: true, id: roleId };
  },

  async deleteRole(role) {
    if (role.is_system_role) throw new Error('System roles cannot be deleted.');
    if (role.staff?.length) throw new Error(`Reassign these staff first: ${role.staff.map(user => user.name || user.email).join(', ')}`);
    if (isMock) {
      const roles = JSON.parse(localStorage.getItem(KEYS.ROLES) || '[]');
      localStorage.setItem(KEYS.ROLES, JSON.stringify(roles.filter(item => item.id !== role.id)));
      return { success: true };
    }
    const { error } = await supabase.from('roles').delete().eq('id', role.id);
    if (error) throw error;
    return { success: true };
  },

  // Fetch Audit Logs
  async fetchAuditLogs() {
    if (isMock) {
      const logs = JSON.parse(localStorage.getItem(KEYS.AUDIT_LOGS) || '[]');
      const users = JSON.parse(localStorage.getItem(KEYS.USERS)) || [];
      return logs.map(l => {
        const u = users.find(x => x.id === l.user_id);
        return {
          ...l,
          userName: u ? (u.name || u.username) : 'System'
        };
      }).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          user:users(name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(l => ({
        ...l,
        userName: l.user ? l.user.name : 'System'
      }));
    }
  },

  // Fetch Deleted Records (Recycle Bin)
  async fetchDeletedRecords() {
    if (isMock) {
      const orders = (JSON.parse(localStorage.getItem(KEYS.ORDERS)) || []).filter(o => o.is_deleted);
      const categories = (JSON.parse(localStorage.getItem(KEYS.CATEGORIES)) || []).filter(c => c.is_deleted);
      const products = (JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || []).filter(p => p.is_deleted);
      const customers = (JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || []).filter(c => c.is_deleted);
      return { orders, categories, products, customers };
    } else {
      const { data: orders, error: oErr } = await supabase.from('deleted_orders').select('*, customer:customers(name)');
      const { data: categories, error: cErr } = await supabase.from('categories').select('*').eq('is_deleted', true);
      const { data: products, error: pErr } = await supabase.from('products').select('*').eq('is_deleted', true);
      const { data: customers, error: cuErr } = await supabase.from('deleted_customers').select('*');
      if (oErr || cErr || pErr || cuErr) {
        throw new Error(`Failed to load Recycle Bin: ${oErr?.message || cErr?.message || pErr?.message || cuErr?.message}`);
      }
      return {
        orders: (orders || []).map(o => ({ ...o, customerName: o.customer ? o.customer.name : 'Unknown' })),
        categories: categories || [],
        products: products || [],
        customers: customers || []
      };
    }
  },

  // Restore deleted records
  async restoreRecord(type, id, userId) {
    if (isMock) {
      if (type === 'order') {
        const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
        const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
        const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
        const stockHist = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY)) || [];
        
        const order = orders.find(o => o.id === id);
        if (!order) throw new Error("Order not found.");

        for (const item of order.items) {
          const p = products.find(prod => prod.id === item.product_id);
          if (p && p.stock < item.quantity) {
            throw new Error(`Cannot restore order. Insufficient stock for ${item.name}. Stock: ${p.stock}, Required: ${item.quantity}`);
          }
        }

        const updatedProducts = products.map(p => {
          const item = order.items.find(i => i.product_id === p.id);
          if (item) {
            stockHist.push({
              id: uid('sh'),
              product_id: p.id,
              change_amount: -item.quantity,
              reason: 'order_created',
              created_at: new Date().toISOString()
            });
            return { ...p, stock: p.stock - item.quantity };
          }
          return p;
        });

        const unpaidPortion = Number(order.total) - Number(order.paid_amount);
        const updatedCusts = customers.map(c => {
          if (c.id === order.customer_id) {
            return { ...c, balance: Number(c.balance || 0) + unpaidPortion };
          }
          return c;
        });

        const updatedOrders = orders.map(o => 
          o.id === id ? { ...o, is_deleted: false, deleted_at: null } : o
        );

        localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updatedProducts));
        localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updatedCusts));
        localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(stockHist));
        localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));

      } else if (type === 'category') {
        const categories = JSON.parse(localStorage.getItem(KEYS.CATEGORIES)) || [];
        const updated = categories.map(c => 
          c.id === id ? { ...c, is_deleted: false, deleted_at: null } : c
        );
        localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(updated));

      } else if (type === 'product') {
        const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS)) || [];
        const updated = products.map(p => 
          p.id === id ? { ...p, is_deleted: false, deleted_at: null } : p
        );
        localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updated));

      } else if (type === 'customer') {
        const customers = JSON.parse(localStorage.getItem(KEYS.CUSTOMERS)) || [];
        const updated = customers.map(c => 
          c.id === id ? { ...c, is_deleted: false, deleted_at: null } : c
        );
        localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(updated));
      }
      
      await logAudit(userId, `Restored deleted ${type} (ID: ${id})`, type + 's', id);
      return { success: true };
    } else {
      let table = '';
      if (type === 'order') table = 'orders';
      else if (type === 'category') table = 'categories';
      else if (type === 'product') table = 'products';
      else if (type === 'customer') table = 'customers';

      const { error } = await supabase
        .from(table)
        .update({ is_deleted: false, deleted_at: null })
        .eq('id', id);
      if (error) throw error;
      
      await logAudit(userId, `Restored deleted ${type} (ID: ${id})`, table, id);
      return { success: true };
    }
  },

  async permanentDeleteRecord(type, id, userId) {
    const config = {
      order: { key: KEYS.ORDERS, table: 'orders' },
      product: { key: KEYS.PRODUCTS, table: 'products' },
      category: { key: KEYS.CATEGORIES, table: 'categories' },
      customer: { key: KEYS.CUSTOMERS, table: 'customers' }
    }[type];
    if (!config) throw new Error('Unsupported record type.');
    if (isMock) {
      const rows = JSON.parse(localStorage.getItem(config.key) || '[]');
      const record = rows.find(row => row.id === id);
      if (!record?.is_deleted) throw new Error('Only recycle-bin records can be permanently deleted.');
      localStorage.setItem(config.key, JSON.stringify(rows.filter(row => row.id !== id)));
    } else {
      const { data: record, error: readError } = await supabase.from(config.table).select('is_deleted').eq('id', id).single();
      if (readError) throw readError;
      if (!record.is_deleted) throw new Error('Only recycle-bin records can be permanently deleted.');
      const { error } = await supabase.from(config.table).delete().eq('id', id);
      if (error) throw new Error(`Permanent delete failed: ${error.message}`);
    }
    await logAudit(userId, `Permanently deleted ${type}`, config.table, id);
    return { success: true };
  },

  // Fetch chronological Ledger for customer
  async fetchCustomerLedger(customerId) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.ORDERS)) || [];
      const payments = JSON.parse(localStorage.getItem(KEYS.PAYMENTS) || '[]');
      const custOrders = orders.filter(o => o.customer_id === customerId && !o.is_deleted);
      
      const ledger = [];
      for (const o of custOrders) {
        // Order debit entry
        ledger.push({
          date: o.created_at,
          type: 'order',
          ref: `ORD-${String(o.order_number).padStart(6, '0')}`,
          debit: Number(o.total),
          credit: 0,
          rawRecord: o
        });
        
        const orderPayments = payments.filter(payment => payment.order_id === o.id);
        for (const payment of orderPayments) {
          ledger.push({
            date: payment.created_at,
            type: 'payment',
            ref: `PAY-ORD-${String(o.order_number).padStart(6, '0')}`,
            debit: 0,
            credit: Number(payment.amount),
            rawRecord: payment
          });
        }
        // Preserve legacy mock payments created before individual rows were stored.
        if (orderPayments.length === 0 && Number(o.paid_amount) > 0) {
          ledger.push({ date: o.created_at, type: 'payment', ref: `PAY-ORD-${String(o.order_number).padStart(6, '0')}`, debit: 0, credit: Number(o.paid_amount), rawRecord: o });
        }
      }
      
      // Sort chronological ascending
      return ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else {
      const { data: orders, error: oErr } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .eq('is_deleted', false);
      if (oErr) throw oErr;

      const { data: payments, error: pErr } = await supabase
        .from('payments')
        .select('*, order:orders!inner(order_number, customer_id)')
        .eq('order.customer_id', customerId);
      if (pErr) throw pErr;

      const ledger = [];
      
      for (const o of orders) {
        ledger.push({
          date: o.created_at,
          type: 'order',
          ref: `ORD-${String(o.order_number).padStart(6, '0')}`,
          debit: Number(o.total),
          credit: 0,
          rawRecord: o
        });
      }

      for (const p of payments) {
        ledger.push({
          date: p.created_at,
          type: 'payment',
          ref: `PAY-ORD-${String(p.order.order_number).padStart(6, '0')}`,
          debit: 0,
          credit: Number(p.amount),
          rawRecord: p
        });
      }

      return ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
  },

  // Fetch Staff Users
  async fetchStaffUsers() {
    if (isMock) {
      return JSON.parse(localStorage.getItem(KEYS.USERS)) || [];
    } else {
      const { data, error } = await supabase
        .from('users')
        .select('*, assigned_role:roles!users_role_id_fkey(id,name)')
        .order('name');
      if (error) throw error;
      return (data || []).map(user => ({ ...user, role_name: user.assigned_role?.name || user.role }));
    }
  },

  // Upload image to Supabase storage or convert to base64
  async uploadImage(file, bucketName = 'product-images') {
    if (isMock) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { error } = await supabase.storage
          .from(bucketName)
          .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from(bucketName)
          .getPublicUrl(filePath);

        return publicUrl;
      } catch (err) {
        console.error("Supabase storage upload failed, attempting fallback:", err);
        // Fallback to base64 encoding if Supabase bucket fails or is unconfigured
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
    }
  },

  async bulkUpdateStock(changes, userId) {
    if (!changes.length) return { success: true };
    if (changes.some(x => !Number.isInteger(Number(x.quantityAdded)) || Number(x.quantityAdded) <= 0)) throw new Error('Quantity added must be a positive whole number.');
    if (isMock) {
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS) || '[]');
      const history = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY) || '[]');
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');
      const byId = new Map(changes.map(x => [x.id, Number(x.quantityAdded)]));
      const updated = products.map(p => {
        if (!byId.has(p.id)) return p;
        const quantityAdded = byId.get(p.id);
        history.push({ id: uid('sh'), product_id: p.id, change_amount: quantityAdded, reason: 'bulk_update', created_at: new Date().toISOString() });
        addMockBatch(batches, p.id, quantityAdded, Number(changes.find(change => change.id === p.id)?.costPrice ?? p.cost_price), 'bulk_update', p.id);
        return { ...p, stock: Number(p.stock) + quantityAdded, cost_price: Number(changes.find(change => change.id === p.id)?.costPrice ?? p.cost_price) };
      });
      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updated));
      localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(history));
      localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
    } else {
      for (const change of changes) {
        const { data: product, error: readError } = await supabase.from('products').select('stock, cost_price').eq('id', change.id).single();
        if (readError) throw readError;
        const quantityAdded = Number(change.quantityAdded);
        const { error: updateError } = await supabase.from('products').update({ stock: Number(product.stock) + quantityAdded }).eq('id', change.id);
        if (updateError) throw updateError;
        const { error: historyError } = await supabase.from('stock_history').insert({ product_id: change.id, change_amount: quantityAdded, reason: 'bulk_update' });
        if (historyError) throw historyError;
        const effectiveCost = Number(change.costPrice ?? product.cost_price ?? 0);
        const { error: batchError } = await supabase.from('stock_batches').insert({ product_id: change.id, quantity_remaining: quantityAdded, cost_price: effectiveCost, source: 'bulk_update', source_reference: change.id });
        if (batchError) throw batchError;
        await supabase.from('products').update({ cost_price: effectiveCost }).eq('id', change.id);
      }
    }
    await logAudit(userId, `Bulk updated ${changes.length} product stock values`, 'products', changes[0].id);
    return { success: true };
  },

  async fetchStockEntries() {
    if (isMock) return (JSON.parse(localStorage.getItem(KEYS.STOCK_ENTRIES) || '[]')).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const { data, error } = await supabase.from('stock_entries').select('*, supplier:suppliers(id, name), items:stock_entry_items(*, product:products(name)), creator:users(name)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(x => ({ ...x, supplier_name: x.supplier?.name, created_by_name: x.creator?.name, items: (x.items || []).map(item => ({ ...item, name: item.product?.name || 'Unknown product' })) }));
  },

  async createStockEntry(items, user, supplierId = null) {
    if (!items.length) throw new Error('Add at least one line item.');
    if (isMock) {
      const entries = JSON.parse(localStorage.getItem(KEYS.STOCK_ENTRIES) || '[]');
      const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS) || '[]');
      const history = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY) || '[]');
      const suppliers = JSON.parse(localStorage.getItem(KEYS.SUPPLIERS) || '[]');
      const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');
      const supplier = suppliers.find(x => x.id === supplierId);
      const entry = { id: uid('se'), reference_number: entries.length + 1, supplier_id: supplierId || null, supplier_name: supplier?.name || null, created_by: user.id, created_by_name: user.name || user.username, created_at: new Date().toISOString(), items: items.map(x => ({ ...x, id: uid('sei') })) };
      const updated = products.map(p => {
        const line = items.find(x => x.product_id === p.id);
        if (!line) return p;
        history.push({ id: uid('sh'), product_id: p.id, change_amount: Number(line.quantity), reason: 'stock_entry', created_at: entry.created_at });
        addMockBatch(batches, p.id, Number(line.quantity), line.cost_price === '' || line.cost_price == null ? Number(p.cost_price) : Number(line.cost_price), 'stock_entry', entry.id, entry.created_at);
        return { ...p, stock: Number(p.stock) + Number(line.quantity), ...(line.cost_price !== '' && line.cost_price != null ? { cost_price: Number(line.cost_price) } : {}) };
      });
      localStorage.setItem(KEYS.STOCK_ENTRIES, JSON.stringify([entry, ...entries]));
      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updated));
      localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(history));
      localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches));
      return entry;
    }
    const { data: entry, error } = await supabase.from('stock_entries').insert({ created_by: user.id, supplier_id: supplierId || null }).select().single();
    if (error) throw error;
    for (const line of items) {
      const { data: product, error: readError } = await supabase.from('products').select('stock, cost_price').eq('id', line.product_id).single();
      if (readError) throw readError;
      const effectiveCost = line.cost_price === '' || line.cost_price == null ? Number(product.cost_price || 0) : Number(line.cost_price);
      const { error: itemError } = await supabase.from('stock_entry_items').insert({ stock_entry_id: entry.id, product_id: line.product_id, quantity: Number(line.quantity), cost_price: effectiveCost });
      if (itemError) throw itemError;
      const update = { stock: Number(product.stock) + Number(line.quantity) };
      update.cost_price = effectiveCost;
      const { error: updateError } = await supabase.from('products').update(update).eq('id', line.product_id);
      if (updateError) throw updateError;
      const { error: historyError } = await supabase.from('stock_history').insert({ product_id: line.product_id, change_amount: Number(line.quantity), reason: 'stock_entry' });
      if (historyError) throw historyError;
      const { error: batchError } = await supabase.from('stock_batches').insert({ product_id: line.product_id, quantity_remaining: Number(line.quantity), cost_price: effectiveCost, source: 'stock_entry', source_reference: entry.id });
      if (batchError) throw batchError;
    }
    return entry;
  },

  async fetchSuppliers() {
    if (isMock) return (JSON.parse(localStorage.getItem(KEYS.SUPPLIERS) || '[]')).sort((a, b) => a.name.localeCompare(b.name));
    const { data, error } = await supabase.from('suppliers').select('id, name, contact_person, mobile, email, address, notes, created_at').order('name', { ascending: true });
    if (error) throw new Error(`Supplier list failed: ${error.message}`);
    return data || [];
  },

  async saveSupplier(values, userId) {
    if (isMock) {
      const suppliers = JSON.parse(localStorage.getItem(KEYS.SUPPLIERS) || '[]');
      const saved = values.id ? { ...suppliers.find(x => x.id === values.id), ...values } : { ...values, id: uid('sup'), created_at: new Date().toISOString() };
      localStorage.setItem(KEYS.SUPPLIERS, JSON.stringify(values.id ? suppliers.map(x => x.id === values.id ? saved : x) : [...suppliers, saved]));
      await logAudit(userId, `${values.id ? 'Updated' : 'Created'} supplier: ${values.name}`, 'suppliers', saved.id); return saved;
    }
    const payload = { name: values.name.trim(), contact_person: values.contact_person?.trim() || null, mobile: values.mobile?.trim() || null, email: values.email?.trim() || null, address: values.address?.trim() || null, notes: values.notes?.trim() || null };
    if (!payload.name) throw new Error('Supplier name is required.');
    const result = values.id
      ? await supabase.from('suppliers').update(payload).eq('id', values.id).select('id, name, contact_person, mobile, email, address, notes, created_at').single()
      : await supabase.from('suppliers').insert(payload).select('id, name, contact_person, mobile, email, address, notes, created_at').single();
    if (result.error) throw new Error(`Supplier save failed: ${result.error.message}`);
    await logAudit(userId, `${values.id ? 'Updated' : 'Created'} supplier: ${payload.name}`, 'suppliers', result.data.id);
    return result.data;
  },

  async fetchPurchaseOrders() {
    if (isMock) return (JSON.parse(localStorage.getItem(KEYS.PURCHASE_ORDERS) || '[]')).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const { data, error } = await supabase.from('purchase_orders').select('*, supplier:suppliers(name), items:purchase_order_items(*, product:products(name)), creator:users(name)').order('created_at', { ascending: false });
    if (error) throw error; return (data || []).map(x => ({ ...x, supplier_name: x.supplier?.name, created_by_name: x.creator?.name }));
  },

  async createPurchaseOrder(supplierId, status, items, user) {
    if (!items.length) throw new Error('Add at least one line item.');
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.PURCHASE_ORDERS) || '[]');
      const po = { id: uid('po'), po_number: orders.length + 1, supplier_id: supplierId, status, created_by: user.id, created_by_name: user.name || user.username, created_at: new Date().toISOString(), items: items.map(x => ({ ...x, id: uid('poi'), quantity_received: 0 })) };
      localStorage.setItem(KEYS.PURCHASE_ORDERS, JSON.stringify([po, ...orders])); return po;
    }
    const { data: po, error } = await supabase.from('purchase_orders').insert({ supplier_id: supplierId, status, created_by: user.id }).select().single(); if (error) throw error;
    const rows = items.map(x => ({ purchase_order_id: po.id, product_id: x.product_id, quantity_ordered: Number(x.quantity_ordered), unit_cost: Number(x.unit_cost) }));
    const { error: itemError } = await supabase.from('purchase_order_items').insert(rows); if (itemError) throw itemError; return po;
  },

  async receivePurchaseOrder(poId, receipts, userId) {
    if (isMock) {
      const orders = JSON.parse(localStorage.getItem(KEYS.PURCHASE_ORDERS) || '[]'); const products = JSON.parse(localStorage.getItem(KEYS.PRODUCTS) || '[]'); const history = JSON.parse(localStorage.getItem(KEYS.STOCK_HISTORY) || '[]'); const batches = JSON.parse(localStorage.getItem(KEYS.STOCK_BATCHES) || '[]');
      const po = orders.find(x => x.id === poId); if (!po) throw new Error('Purchase order not found.');
      const items = po.items.map(line => { const qty = Number(receipts[line.id] || 0); if (qty < 0 || qty > Number(line.quantity_ordered) - Number(line.quantity_received)) throw new Error('Invalid received quantity.'); return { ...line, quantity_received: Number(line.quantity_received) + qty }; });
      const updatedProducts = products.map(p => { const line = po.items.find(x => x.product_id === p.id); if (!line) return p; const qty = Number(receipts[line.id] || 0); if (!qty) return p; const receivedAt = new Date().toISOString(); history.push({ id: uid('sh'), product_id: p.id, change_amount: qty, reason: 'po_received', created_at: receivedAt }); addMockBatch(batches, p.id, qty, Number(line.unit_cost), 'po_received', poId, receivedAt); return { ...p, stock: Number(p.stock) + qty, cost_price: Number(line.unit_cost) }; });
      const status = items.every(x => x.quantity_received >= x.quantity_ordered) ? 'received' : 'partial';
      localStorage.setItem(KEYS.PURCHASE_ORDERS, JSON.stringify(orders.map(x => x.id === poId ? { ...x, items, status } : x))); localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(updatedProducts)); localStorage.setItem(KEYS.STOCK_HISTORY, JSON.stringify(history)); localStorage.setItem(KEYS.STOCK_BATCHES, JSON.stringify(batches)); await logAudit(userId, `Received stock against PO-${String(po.po_number).padStart(6,'0')}`, 'purchase_orders', poId); return { success: true };
    }
    const { data: po, error } = await supabase.from('purchase_orders').select('*, items:purchase_order_items(*)').eq('id', poId).single(); if (error) throw error;
    for (const line of po.items) { const qty = Number(receipts[line.id] || 0); if (!qty) continue; const remaining = Number(line.quantity_ordered) - Number(line.quantity_received); if (qty < 0 || qty > remaining) throw new Error('Invalid received quantity.'); const { data: product } = await supabase.from('products').select('stock').eq('id', line.product_id).single(); await supabase.from('products').update({ stock: Number(product.stock) + qty, cost_price: Number(line.unit_cost) }).eq('id', line.product_id); await supabase.from('purchase_order_items').update({ quantity_received: Number(line.quantity_received) + qty }).eq('id', line.id); await supabase.from('stock_history').insert({ product_id: line.product_id, change_amount: qty, reason: 'po_received' }); const { error: batchError } = await supabase.from('stock_batches').insert({ product_id: line.product_id, quantity_remaining: qty, cost_price: Number(line.unit_cost), source: 'po_received', source_reference: poId }); if (batchError) throw batchError; }
    const { data: refreshed } = await supabase.from('purchase_order_items').select('*').eq('purchase_order_id', poId); const status = refreshed.every(x => x.quantity_received >= x.quantity_ordered) ? 'received' : 'partial'; await supabase.from('purchase_orders').update({ status }).eq('id', poId); await logAudit(userId, 'Received purchase order stock', 'purchase_orders', poId); return { success: true };
  },

  // Re-verify user password
  async reverifyPassword(usernameOrEmail, password) {
    if (isMock) {
      const users = JSON.parse(localStorage.getItem(KEYS.USERS)) || [];
      const u = users.find(x => 
        (x.username === usernameOrEmail || x.mobile === usernameOrEmail || x.email === usernameOrEmail) && 
        x.password === password
      );
      if (!u) throw new Error("Incorrect password.");
      return true;
    } else {
      const { data: profile, error: pError } = await supabase
        .from('users')
        .select('email')
        .or(`email.eq.${usernameOrEmail},mobile.eq.${usernameOrEmail},name.eq.${usernameOrEmail}`)
        .maybeSingle();

      if (pError) throw new Error("Database query failed: " + pError.message);
      
      const emailToAuth = profile ? profile.email : usernameOrEmail;

      const { error } = await supabase.auth.signInWithPassword({
        email: emailToAuth,
        password: password
      });

      if (error) throw new Error("Verification failed: " + error.message);
      return true;
    }
  },

  // Export system backup payload (JSON string)
  async exportBackup() {
    if (isMock) {
      const backup = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('so:')) {
          backup[key] = localStorage.getItem(key);
        }
      }
      return JSON.stringify(backup);
    } else {
      const tables = ['users', 'categories', 'products', 'customers', 'orders', 'order_items', 'stock_batches', 'order_item_batch_usage', 'payments', 'refunds', 'stock_history', 'stock_entries', 'stock_entry_items', 'suppliers', 'purchase_orders', 'purchase_order_items', 'audit_logs', 'webauthn_credentials'];
      const backup = {};
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw new Error(`Backup failed on table ${table}: ${error.message}`);
        backup[table] = data;
      }
      return JSON.stringify(backup);
    }
  },

  // Restore system backup payload
  async restoreBackup(jsonString, creatorUserId) {
    const backup = JSON.parse(jsonString);
    if (isMock) {
      if (!backup['so:users'] && !backup['so:products']) {
        throw new Error("Invalid backup file format. Expected system keys.");
      }
      // Clean previous keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('so:')) {
          localStorage.removeItem(key);
        }
      }
      // Populate backup keys
      for (const [key, val] of Object.entries(backup)) {
        localStorage.setItem(key, val);
      }
      await logAudit(creatorUserId, "Restored database from local JSON backup file", 'users', creatorUserId);
      return { success: true };
    } else {
      const tablesOrderDelete = ['audit_logs', 'webauthn_credentials', 'stock_history', 'payments', 'order_items', 'orders', 'products', 'customers', 'categories'];
      const tablesOrderInsert = ['users', 'categories', 'customers', 'products', 'orders', 'order_items', 'payments', 'stock_history', 'webauthn_credentials', 'audit_logs'];

      for (const table of tablesOrderDelete) {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw new Error(`Failed to clear table ${table} during restore: ${error.message}`);
      }

      for (const table of tablesOrderInsert) {
        const rows = backup[table];
        if (!rows || rows.length === 0) continue;
        const { error } = await supabase.from(table).upsert(rows);
        if (error) throw new Error(`Failed to restore table ${table}: ${error.message}`);
      }

      await logAudit(creatorUserId, "Restored database from Supabase JSON backup file", 'users', creatorUserId);
      return { success: true };
    }
  }
};

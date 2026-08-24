import { useState, useEffect, useCallback, Fragment } from "react";
import { Html5Qrcode } from "html5-qrcode";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { db } from "./db";
import { isMock } from "./supabaseClient";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState("login");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPasswordForm, setNewPasswordForm] = useState({ password: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);
  const [stockBatches, setStockBatches] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  
  const [stats, setStats] = useState({
    todaysSales: 0,
    monthlySales: 0,
    todaysOrdersCount: 0,
    pendingOrders: 0,
    outstandingBalance: 0,
    totalProducts: 0,
    totalCategories: 0,
    totalCustomers: 0,
    lowStockCount: 0
  });

  const [activeCategory, setActiveCategory] = useState(null);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [cart, setCart] = useState([]);
  
  const [catSearch, setCatSearch] = useState("");
  const [catSort, setCatSort] = useState("name");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [theme, setThemeState] = useState(() => localStorage.getItem("so:theme") || "light");
  const [currency, setCurrencyState] = useState(() => localStorage.getItem("so:currency") || "LKR");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (t) => {
    setThemeState(t);
    localStorage.setItem("so:theme", t);
  };

  const setCurrency = (c) => {
    setCurrencyState(c);
    localStorage.setItem("so:currency", c);
  };

  const showToast = useCallback((msg, requestedType) => {
    const text = String(msg || '');
    const icon = requestedType || (/fail|error|incorrect|invalid|cannot|denied|unavailable|insufficient/i.test(text) ? 'error' : /please|enter|select|required|limit|empty/i.test(text) ? 'warning' : 'success');
    Swal.fire({ toast: true, position: 'bottom', icon, title: text, showConfirmButton: false, timer: icon === 'error' ? 4500 : 2800, timerProgressBar: true });
  }, []);

  const setConfirmDialog = useCallback((dialog) => {
    if (!dialog) { Swal.close(); return; }
    const destructive = /delete|remove|cancel|restore database|permanent/i.test(`${dialog.title} ${dialog.message}`);
    Swal.fire({
      title: dialog.title,
      text: dialog.message,
      icon: destructive ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: destructive ? 'Yes, continue' : 'Confirm',
      cancelButtonText: 'Go back',
      confirmButtonColor: destructive ? '#993C1D' : '#0F6E56',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      allowEscapeKey: () => !Swal.isLoading(),
      preConfirm: async () => {
        try { return await dialog.onConfirm(); }
        catch (error) { Swal.showValidationMessage(error?.message || 'The action failed.'); throw error; }
      }
    });
  }, []);

  // Load app data
  const loadData = useCallback(async () => {
    try {
      const cats = await db.fetchCategories();
      const prods = await db.fetchProducts();
      const custs = await db.fetchCustomers();
      const ords = await db.fetchOrders();
      const history = await db.fetchStockHistory();
      const batches = await db.fetchStockBatches();
      const s = await db.getDashboardStats();
      setCategories(cats);
      setProducts(prods);
      setCustomers(custs);
      setOrders(ords);
      setStockHistory(history);
      setStockBatches(batches);
      setStats(s);
    } catch (err) {
      console.error("Error loading workspace data:", err);
      showToast("Data loading failed: " + err.message);
    }
  }, [showToast]);

  useEffect(() => {
    (async () => {
      const cachedSession = localStorage.getItem("so:session");
      if (cachedSession) {
        try {
          const u = JSON.parse(cachedSession);
          setSession(u);
          setScreen("home");
        } catch {
          localStorage.removeItem("so:session");
        }
      }
      await loadData();
      setBooting(false);
    })();
  }, [loadData]);

  // Handle manual sign in
  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    try {
      const user = await db.login(loginForm.username, loginForm.password);
      if (user.must_change_password) {
        setSession(user);
        setMustChangePassword(true);
      } else {
        setSession(user);
        localStorage.setItem("so:session", JSON.stringify(user));
        setScreen("home");
        showToast(`Welcome back, ${user.name || user.username}!`);
      }
    } catch (err) {
      setLoginError(err.message);
    }
  }

  // Handle fingerprint WebAuthn login
  async function handleBiometricLogin() {
    setLoginError("");
    try {
      const user = await db.loginWithBiometric();
      setSession(user);
      localStorage.setItem("so:session", JSON.stringify(user));
      setScreen("home");
      showToast(`Logged in via biometrics as ${user.name || user.username}!`);
    } catch (err) {
      setLoginError(err.message);
      showToast(err.message);
    }
  }

  // Register biometrics on the current device
  async function handleRegisterBiometrics() {
    try {
      await db.registerBiometric(session);
      showToast("Fingerprint biometric login registered successfully for this device!");
    } catch (err) {
      showToast(err.message);
    }
  }

  // Handle password update on first login
  async function handlePasswordChange(e) {
    e.preventDefault();
    setPasswordError("");
    if (!newPasswordForm.password) {
      setPasswordError("Password cannot be empty.");
      return;
    }
    if (newPasswordForm.password.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      return;
    }
    if (newPasswordForm.password !== newPasswordForm.confirm) {
      setPasswordError("Passwords do not match.");
      return;
    }

    try {
      await db.updatePassword(session.id, newPasswordForm.password);
      const updatedUser = { ...session, must_change_password: false };
      setSession(updatedUser);
      localStorage.setItem("so:session", JSON.stringify(updatedUser));
      setMustChangePassword(false);
      setScreen("home");
      showToast("Password updated successfully. Account secured!");
    } catch (err) {
      setPasswordError(err.message);
    }
  }

  function logout() {
    setSession(null);
    setScreen("login");
    setCart([]);
    setLoginForm({ username: "", password: "" });
    localStorage.removeItem("so:session");
    showToast("Logged out successfully.");
  }

  // Add product to cart with strict stock availability check
  function addToCart(product, qty, unitPrice) {
    const actualPrice = Number(unitPrice);
    if (!Number.isFinite(actualPrice) || actualPrice <= 0) {
      showToast("Enter a valid selling price greater than zero.");
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      const currentQty = existing ? existing.qty : 0;
      const nextQty = currentQty + qty;
      
      if (nextQty > product.stock) {
        showToast(`Cannot add to cart. Only ${product.stock} items left in stock.`);
        return prev;
      }
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, qty: nextQty, price: actualPrice } : i);
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        price: actualPrice,
        qty 
      }];
    });
    setQuickViewProduct(null);
    showToast(`Added ${qty} × ${product.name} to cart.`);
  }

  // Update quantity controls on Cart items with stock limits
  function changeCartQty(productId, delta) {
    const product = products.find(p => p.id === productId);
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const next = i.qty + delta;
      if (next > product.stock) {
        showToast(`Stock limit reached! Only ${product.stock} items available.`);
        return i;
      }
      return { ...i, qty: next };
    }).filter(i => i.qty > 0));
  }

  function removeCartItem(productId, name) {
    setConfirmDialog({
      title: "Remove item?",
      message: `Remove ${name} from the cart?`,
      onConfirm: () => {
        setCart(prev => prev.filter(i => i.productId !== productId));
        setConfirmDialog(null);
      }
    });
  }

  function cancelOrder() {
    setConfirmDialog({
      title: "Cancel order?",
      message: "This will empty your cart. This cannot be undone.",
      onConfirm: () => {
        setCart([]);
        setSelectedCustomer(null);
        setConfirmDialog(null);
        setScreen("home");
      }
    });
  }

  // Checkout order submission
  async function confirmOrder() {
    if (cart.length === 0) {
      showToast("Cart is empty.");
      return;
    }
    if (!selectedCustomer) {
      showToast("Please select a customer first.");
      return;
    }

    setConfirmDialog({
      title: "Confirm order?",
      message: `Confirm checkout for ${selectedCustomer.name} totaling ${fmt(cartTotal)}?`,
      onConfirm: async () => {
        try {
          await db.createOrder(selectedCustomer.id, cart, cartTotal, session);
          showToast("Order checked out successfully!");
          
          setCart([]);
          setSelectedCustomer(null);
          setConfirmDialog(null);
          
          await loadData();
          setScreen("home");
        } catch (err) {
          showToast("Checkout failed: " + err.message);
          setConfirmDialog(null);
        }
      }
    });
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  function fmt(n) {
    const val = Number(n || 0);
    if (currency === "USD") {
      return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (currency === "EUR") {
      return "€" + val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return "Rs. " + val.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const filteredCategories = categories
    .filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()))
    .sort((a, b) => {
      if (catSort === "name") {
        return a.name.localeCompare(b.name);
      } else {
        const countA = products.filter(p => p.category_id === a.id).length;
        const countB = products.filter(p => p.category_id === b.id).length;
        return countB - countA;
      }
    });

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
    c.mobile.includes(customerSearch) ||
    (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  if (booting) {
    return (
      <div style={S.bootWrap}>
        <div style={S.bootSpinner} />
        <p style={{ color: "var(--color-ink-soft)", fontWeight: 500 }}>Initializing Stock &amp; Order workspace…</p>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div style={S.loginWrap}>
        <div style={S.loginCard}>
          <div style={S.loginBadge}>🔒</div>
          <h1 style={S.loginTitle}>Secure Your Account</h1>
          <p style={S.loginSub}>First-time login detected. Please change your password to continue.</p>
          <form onSubmit={handlePasswordChange} style={{ width: "100%" }}>
            <label style={S.label}>New Password</label>
            <input 
              style={S.input} 
              type="password" 
              value={newPasswordForm.password} 
              onChange={e => setNewPasswordForm({ ...newPasswordForm, password: e.target.value })} 
              placeholder="Min 8 characters" 
              autoComplete="new-password" 
            />
            <label style={S.label}>Confirm Password</label>
            <input 
              style={S.input} 
              type="password" 
              value={newPasswordForm.confirm} 
              onChange={e => setNewPasswordForm({ ...newPasswordForm, confirm: e.target.value })} 
              placeholder="Confirm new password" 
              autoComplete="new-password" 
            />
            {passwordError && <p style={S.errorText}>{passwordError}</p>}
            <button type="submit" style={S.primaryBtn}>Update Password &amp; Log In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      {screen === "login" && (
        <LoginScreen 
          loginForm={loginForm} 
          setLoginForm={setLoginForm} 
          onSubmit={handleLogin} 
          error={loginError} 
          onBiometricLogin={handleBiometricLogin}
          showToast={showToast}
        />
      )}

      {screen !== "login" && (
        <>
          <Header 
            session={session} 
            cartCount={cartCount} 
            pendingPackCount={orders.filter(order => (order.pack_status || "pending") === "pending").length}
            screen={screen} 
            setScreen={setScreen} 
            logout={logout} 
          />

          {screen === "home" && (
            <HomeScreen
              stats={stats}
              categories={filteredCategories}
              products={products}
              catSearch={catSearch} 
              setCatSearch={setCatSearch}
              catSort={catSort} 
              setCatSort={setCatSort}
              onOpenCategory={(cat) => { setActiveCategory(cat); setScreen("category"); }}
              onMakeOrder={() => setScreen("quick_order")}
              fmt={fmt}
            />
          )}

          {screen === "quick_order" && (
            <QuickOrderScreen
              categories={categories}
              products={products}
              onBack={() => setScreen("home")}
              onOpenProduct={setQuickViewProduct}
              fmt={fmt}
            />
          )}

          {screen === "category" && activeCategory && (
            <CategoryScreen
              category={activeCategory}
              products={products.filter(p => p.category_id === activeCategory.id)}
              onBack={() => setScreen("home")}
              onOpenProduct={(p) => setQuickViewProduct(p)}
              fmt={fmt}
            />
          )}

          {screen === "cart" && (
            <CartScreen
              cart={cart}
              total={cartTotal}
              onQtyChange={changeCartQty}
              onRemove={removeCartItem}
              customers={filteredCustomers}
              customerSearch={customerSearch} 
              setCustomerSearch={setCustomerSearch}
              selectedCustomer={selectedCustomer} 
              setSelectedCustomer={setSelectedCustomer}
              onConfirm={confirmOrder}
              onCancel={cancelOrder}
              onContinueShopping={() => setScreen("home")}
              fmt={fmt}
            />
          )}

          {screen === "orders" && (
            <OrdersScreen
              orders={orders}
              onOpenOrder={(o) => {
                const refreshedOrder = orders.find(x => x.id === o.id) || o;
                setActiveOrder(refreshedOrder);
                setScreen("order_detail");
              }}
              onBack={() => setScreen("home")}
              fmt={fmt}
            />
          )}

          {screen === "order_detail" && activeOrder && (
            <OrderDetailScreen
              order={orders.find(x => x.id === activeOrder.id) || activeOrder}
              onBack={() => setScreen("orders")}
              onRefresh={loadData}
              session={session}
              fmt={fmt}
              showToast={showToast}
              setConfirmDialog={setConfirmDialog}
              products={products}
            />
          )}

          {screen === "settings" && (
            <SettingsScreen
              session={session}
              onRegisterBiometric={handleRegisterBiometrics}
              onBack={() => setScreen("home")}
              theme={theme}
              setTheme={setTheme}
              currency={currency}
              setCurrency={setCurrency}
              loadData={loadData}
              showToast={showToast}
              logout={logout}
            />
          )}

          {screen === "reports" && (
            <ReportsScreen
              orders={orders}
              categories={categories}
              products={products}
              customers={customers}
              stockHistory={stockHistory}
              stockBatches={stockBatches}
              fmt={fmt}
              currency={currency}
              onBack={() => setScreen("home")}
              showToast={showToast}
            />
          )}

          {screen === "account" && (
            <AccountScreen 
              session={session}
              customers={customers}
              orders={orders}
              loadData={loadData}
              showToast={showToast}
              fmt={fmt}
              onBack={() => setScreen("home")}
              onOpenOrder={(o) => {
                setActiveOrder(o);
                setScreen("order_detail");
              }}
            />
          )}

          {screen === "manage" && (
            <ManageScreen 
              session={session}
              categories={categories}
              products={products}
              customers={customers}
              loadData={loadData}
              showToast={showToast}
              setConfirmDialog={setConfirmDialog}
              fmt={fmt}
              onBack={() => setScreen("home")}
            />
          )}
        </>
      )}

      {quickViewProduct && (
        <QuickView 
          product={quickViewProduct} 
          onClose={() => setQuickViewProduct(null)} 
          onAdd={addToCart} 
          fmt={fmt} 
        />
      )}

    </div>
  );
}

// SCREEN COMPONENTS

function LoginScreen({ loginForm, setLoginForm, onSubmit, error, onBiometricLogin, showToast }) {
  const isBiometricAvailable = db.isWebAuthnSupported();
  const isRegisteredOnDevice = !!localStorage.getItem('so:registered_credential_id');

  return (
    <div style={S.loginWrap} className="animate-fade-in">
      <div style={S.loginCard} className="animate-scale-in">
        <div style={S.loginBadge}>SO</div>
        <h1 style={S.loginTitle}>Stock &amp; Order</h1>
        <p style={S.loginSub}>Sign in to manage your inventory and orders.</p>
        
        {isMock && (
          <div style={S.mockBanner}>
            Running in Local Mock Mode. DB changes persist locally.
          </div>
        )}

        <form onSubmit={onSubmit} style={{ width: "100%" }}>
          <label style={S.label}>Username or mobile number</label>
          <input 
            style={S.input} 
            value={loginForm.username} 
            onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} 
            placeholder="e.g. Nihlan922" 
            autoComplete="username" 
          />
          <label style={S.label}>Password</label>
          <input 
            style={S.input} 
            type="password" 
            value={loginForm.password} 
            onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} 
            placeholder="Enter your password" 
            autoComplete="current-password" 
          />
          {error && <p style={S.errorText}>{error}</p>}
          <button type="submit" style={S.primaryBtn}>Sign in</button>
        </form>

        {isBiometricAvailable && isRegisteredOnDevice && (
          <button style={S.fingerprintBtn} onClick={onBiometricLogin}>
            <span style={{ fontSize: 18 }}>⚷</span> Sign in with Fingerprint
          </button>
        )}

        {(!isRegisteredOnDevice || !isBiometricAvailable) && (
          <button style={{ ...S.fingerprintBtn, opacity: 0.6, cursor: "not-allowed" }} onClick={() => {
            showToast("Register biometrics from Settings after signing in with your password.");
          }}>
            <span style={{ fontSize: 18 }}>⚷</span> Biometrics not configured on device
          </button>
        )}
        
        <p style={S.demoNote}>Demo Admin: <strong>Nihlan922</strong> / <strong>NIH922nih##</strong></p>
      </div>
    </div>
  );
}

function Header({ session, cartCount, pendingPackCount, screen, setScreen, logout }) {
  const navItems = [
    { key: "settings", label: "Settings", icon: "⚙" },
    { key: "cart", label: "Cart", icon: "▤", badge: cartCount },
    { key: "orders", label: "Orders", icon: "▦", badge: pendingPackCount },
    { key: "account", label: "Summary", icon: "▥" },
    { key: "reports", label: "Reports", icon: "📈" },
    { key: "manage", label: "Manage", icon: "🔧" },
  ];
  return (
    <header style={S.header}>
      <div style={S.headerInner}>
        <div style={S.headerTop}>
          <div style={S.headerBrand} onClick={() => setScreen("home")}>
            <div style={S.headerLogo}>SO</div>
            <div>
              <div style={S.headerTitle}>AS Marketing</div>
              <div style={S.headerUser}>
                {session.name || session.username} · {session.role === "superadmin" ? "Super admin" : "User"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMock ? (
              <span style={S.mockIndicator}>Mock DB</span>
            ) : (
              <span style={S.liveIndicator}>Supabase Live</span>
            )}
            <button style={S.logoutBtn} onClick={logout}>Log out</button>
          </div>
        </div>
        <nav style={S.headerNav}>
          {navItems.map(item => (
            <button 
              key={item.key} 
              style={{ ...S.navBtn, ...(screen === item.key ? S.navBtnActive : {}) }} 
              onClick={() => setScreen(item.key)}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
              {!!item.badge && <span style={S.navBadge}>{item.badge}</span>}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function HomeScreen({ stats, categories, catSearch, setCatSearch, catSort, setCatSort, onOpenCategory, onMakeOrder, products, fmt }) {
  const [exportMode, setExportMode] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const stockMessage = selectedCategories.map(id => {
    const category = categories.find(c => c.id === id);
    const lines = products.filter(p => p.category_id === id).map(p => `- ${p.name}: ${p.stock}${Number(p.stock) <= 10 ? ' (LOW STOCK)' : ''}`);
    return `${category?.name || 'Category'}\n${lines.length ? lines.join('\n') : '- No products'}`;
  }).join('\n\n');

  async function copyStockMessage() {
    if (!stockMessage) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(stockMessage);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = stockMessage;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  async function shareStockMessage() {
    if (!stockMessage) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Stock summary', text: stockMessage }); }
      catch (error) { if (error?.name !== 'AbortError') await copyStockMessage(); }
    } else await copyStockMessage();
  }
  const cards = [
    { label: "Today's sales", value: fmt(stats.todaysSales) },
    { label: "Monthly sales", value: fmt(stats.monthlySales) },
    { label: "Today's orders", value: stats.todaysOrdersCount },
    { label: "Pending orders", value: stats.pendingOrders },
    { label: "Outstanding balance", value: fmt(stats.outstandingBalance) },
    { label: "Total products", value: stats.totalProducts },
    { label: "Total categories", value: stats.totalCategories },
    { label: "Total customers", value: stats.totalCustomers },
    { label: "Low stock items", value: stats.lowStockCount, warn: stats.lowStockCount > 0 },
  ];
  return (
    <main style={S.main} className="animate-fade-in">
      <div style={S.statsGrid}>
        {cards.map(c => (
          <div key={c.label} style={{ ...S.statCard, ...(c.warn ? S.statCardWarn : {}) }}>
            <div style={S.statLabel}>{c.label}</div>
            <div style={{ ...S.statValue, ...(c.warn ? { color: "#993c1d" } : {}) }}>{c.value}</div>
          </div>
        ))}
      </div>

      <button type="button" style={{ ...S.primaryBtn, margin: "0 0 18px" }} onClick={onMakeOrder}>Make an order</button>
      <div style={S.sectionHeadRow}>
        <h2 style={S.sectionHead}>Categories</h2>
        <button style={{ ...S.ghostBtn, margin: 0, width: "auto" }} onClick={() => { setExportMode(x => !x); setSelectedCategories([]); }}>Export stock</button>
      </div>
      {exportMode && (
        <div style={{ ...S.profileCard, marginBottom: 14 }}>
          <p style={{ ...S.profileDetail, marginBottom: 10 }}>Select one or more categories to create a shareable stock message.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map(category => <label key={category.id} style={S.pillFilter}><input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={() => setSelectedCategories(ids => ids.includes(category.id) ? ids.filter(id => id !== category.id) : [...ids, category.id])} /> {category.name}</label>)}
          </div>
          {stockMessage && <pre style={{ whiteSpace: "pre-wrap", background: "var(--color-bg)", padding: 12, borderRadius: 10, marginTop: 12, fontFamily: "var(--font-body)" }}>{stockMessage}</pre>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={{ ...S.primaryBtn, margin: 0 }} disabled={!stockMessage} onClick={copyStockMessage}>Copy to clipboard</button>
            <button style={{ ...S.ghostBtn, margin: 0 }} disabled={!stockMessage} onClick={shareStockMessage}>Share</button>
          </div>
        </div>
      )}
      <div style={S.toolRow}>
        <input 
          style={S.searchInput} 
          placeholder="Search categories" 
          value={catSearch} 
          onChange={e => setCatSearch(e.target.value)} 
        />
        <select style={S.sortSelect} value={catSort} onChange={e => setCatSort(e.target.value)}>
          <option value="name">Sort: Name</option>
          <option value="count">Sort: Product count</option>
        </select>
      </div>

      <div style={S.catGrid}>
        {categories.map(cat => {
          const count = products.filter(p => p.category_id === cat.id).length;
          return (
            <div key={cat.id} style={S.catCard} onClick={() => onOpenCategory(cat)}>
              <div style={S.catImage}>{cat.name.slice(0, 1)}</div>
              <div style={S.catName}>{cat.name}</div>
              <div style={S.catDesc}>{cat.description}</div>
              <div style={S.catCount}>{count} product{count === 1 ? "" : "s"}</div>
            </div>
          );
        })}
        {categories.length === 0 && <p style={S.emptyText}>No categories match your search.</p>}
      </div>

      <footer style={S.footer}>
        <div style={S.footerTitle}>Need help? Call us</div>
        <div style={S.footerNumbers}>
          <span>0757451414</span><span>0752222895</span><span>0788517272</span><span>0754004708</span>
        </div>
      </footer>
    </main>
  );
}

function QuickOrderScreen({ categories, products, onBack, onOpenProduct, fmt }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => categories[0]?.id || "");
  const selectedCategory = categories.find(category => category.id === selectedCategoryId);
  const shownProducts = products.filter(product => product.category_id === selectedCategoryId);

  useEffect(() => {
    if (!categories.some(category => category.id === selectedCategoryId)) setSelectedCategoryId(categories[0]?.id || "");
  }, [categories, selectedCategoryId]);

  return (
    <main style={S.main} className="animate-fade-in">
      <button type="button" style={S.backBtn} onClick={onBack}>← Back to Home</button>
      <h2 style={S.sectionHead}>Make an order</h2>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 18, scrollbarWidth: "none" }}>
        {categories.map(category => (
          <button
            type="button"
            key={category.id}
            style={{ ...S.pillFilter, ...(selectedCategoryId === category.id ? S.pillFilterActive : {}), flexShrink: 0 }}
            onClick={() => setSelectedCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      {selectedCategory && <h3 style={{ ...S.sectionHead, fontSize: 16 }}>{selectedCategory.name}</h3>}
      <div style={S.prodGrid}>
        {shownProducts.map(product => (
          <div key={product.id} style={S.prodCard} onClick={() => onOpenProduct(product)}>
            <div style={S.prodImage}>{product.name.slice(0, 1)}</div>
            <div style={S.prodName}>{product.name}</div>
            <div style={S.prodPrice}>{fmt(product.selling_price)}</div>
            <div style={{ ...S.prodStock, ...(product.stock <= 10 ? S.lowStock : {}) }}>{product.stock <= 10 ? `Low stock · ${product.stock} left` : `${product.stock} in stock`}</div>
          </div>
        ))}
      </div>
      {!categories.length && <p style={S.emptyText}>No categories are available yet.</p>}
      {!!categories.length && !shownProducts.length && <p style={S.emptyText}>No products in this category yet.</p>}
    </main>
  );
}

function CategoryScreen({ category, products, onBack, onOpenProduct, fmt }) {
  return (
    <main style={S.main} className="animate-fade-in">
      <button style={S.backBtn} onClick={onBack}>← Back to categories</button>
      <h2 style={S.sectionHead}>{category.name}</h2>
      <p style={{ ...S.catDesc, marginBottom: "1.25rem" }}>{category.description}</p>
      <div style={S.prodGrid}>
        {products.map(p => (
          <div key={p.id} style={S.prodCard} onClick={() => onOpenProduct(p)}>
            <div style={S.prodImage}>{p.name.slice(0, 1)}</div>
            <div style={S.prodName}>{p.name}</div>
            <div style={S.prodPrice}>{fmt(p.selling_price)}</div>
            <div style={{ ...S.prodStock, ...(p.stock <= 10 ? S.lowStock : {}) }}>
              {p.stock <= 10 ? `Low stock · ${p.stock} left` : `${p.stock} in stock`}
            </div>
          </div>
        ))}
        {products.length === 0 && <p style={S.emptyText}>No products in this category yet.</p>}
      </div>
    </main>
  );
}

function QuickView({ product, onClose, onAdd, fmt }) {
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState("1");
  const defaultSellingPrice = Number(product.selling_price ?? product.sellingPrice ?? 0);
  const costPrice = Number(product.cost_price ?? product.costPrice ?? 0);
  const [sellingPriceText, setSellingPriceText] = useState(String(defaultSellingPrice));
  const [priceError, setPriceError] = useState("");
  const isOutOfStock = product.stock === 0;

  const applyQuantity = () => {
    const parsed = Number(qtyText);
    const next = Number.isFinite(parsed) && parsed > 0 ? Math.min(product.stock, Math.floor(parsed)) : 1;
    setQty(next); setQtyText(String(next)); return next;
  };
  const stepQty = delta => { const next = Math.max(1, Math.min(product.stock, qty + delta)); setQty(next); setQtyText(String(next)); };
  const applySellingPrice = () => {
    const parsed = Number(sellingPriceText);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPriceError("Enter a selling price greater than zero.");
      return null;
    }
    const normalized = Math.round(parsed * 100) / 100;
    setSellingPriceText(String(normalized));
    setPriceError("");
    return normalized;
  };
  const previewSellingPrice = Number(sellingPriceText) > 0 ? Number(sellingPriceText) : 0;

  return (
    <div style={S.sheetOverlay} onClick={onClose} className="animate-fade-in">
      <div style={S.sheet} onClick={e => e.stopPropagation()} className="animate-slide-up">
        <div style={S.sheetHandle} />
        <div style={S.sheetImage}>{product.name.slice(0, 1)}</div>
        <h3 style={S.sheetTitle}>{product.name}</h3>
        <p style={S.sheetDesc}>{product.description}</p>
        <div style={S.sheetRow}>
          <div>
            <div style={{ ...S.profileDetail, marginBottom: 2 }}>Default selling: <strong>{fmt(defaultSellingPrice)}</strong></div>
            <div style={{ ...S.profileDetail, marginBottom: 0 }}>Default cost for next manual batch: <strong>{fmt(costPrice)}</strong></div>
          </div>
          <span style={{ ...S.prodStock, ...(product.stock <= 10 ? S.lowStock : {}) }}>
            {isOutOfStock ? "Out of stock" : `${product.stock} left in stock`}
          </span>
        </div>
        
        {!isOutOfStock && (
          <>
            <div style={{ marginTop: 14 }}>
              <label style={S.label}>Selling price for this sale</label>
              <input
                aria-label="Selling price for this cart line"
                type="number"
                min="0.01"
                step="0.01"
                value={sellingPriceText}
                onChange={e => { setSellingPriceText(e.target.value); setPriceError(""); }}
                onBlur={applySellingPrice}
                style={S.input}
              />
              <p style={{ ...S.profileDetail, marginTop: 4 }}>Applies only to this cart and order line.</p>
              {priceError && <p style={S.errorText}>{priceError}</p>}
            </div>
            <div style={S.qtyRow}>
              <button style={S.qtyBtn} onClick={() => stepQty(-1)}>−</button>
              <input aria-label="Quantity" type="number" min="1" max={product.stock} step="1" value={qtyText} onChange={e => setQtyText(e.target.value)} onBlur={applyQuantity} style={{ ...S.input, width: 90, margin: 0, textAlign: "center", fontWeight: 700 }} />
              <button style={S.qtyBtn} onClick={() => stepQty(1)}>+</button>
            </div>
            <button style={S.primaryBtn} onClick={() => { const validQty = applyQuantity(); const validPrice = applySellingPrice(); if (validPrice !== null) onAdd(product, validQty, validPrice); }}>
              Add to cart · {fmt(previewSellingPrice * qty)}
            </button>
          </>
        )}

        {isOutOfStock && (
          <button style={{ ...S.primaryBtn, background: "var(--color-border)", color: "var(--color-ink-soft)", cursor: "not-allowed" }} disabled>
            Temporarily Out of Stock
          </button>
        )}

        <button style={S.ghostBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function CartScreen({ cart, total, onQtyChange, onRemove, customers, customerSearch, setCustomerSearch, selectedCustomer, setSelectedCustomer, onConfirm, onCancel, onContinueShopping, fmt }) {
  return (
    <main style={S.main} className="animate-fade-in">
      <h2 style={S.sectionHead}>Your cart</h2>
      {cart.length === 0 ? (
        <div style={S.emptyState}>
          <p style={S.emptyText}>Your cart is empty.</p>
          <button style={{ ...S.primaryBtn, marginTop: 15 }} onClick={onContinueShopping}>Browse categories</button>
        </div>
      ) : (
        <>
          <div style={S.cartList}>
            {cart.map(item => (
              <div key={item.productId} style={S.cartRow}>
                <div style={S.cartImage}>{item.name.slice(0, 1)}</div>
                <div style={{ flex: 1 }}>
                  <div style={S.cartName}>{item.name}</div>
                  <div style={S.cartUnitPrice}>{fmt(item.price)} each</div>
                </div>
                <div style={S.qtyRow}>
                  <button style={S.qtyBtnSm} onClick={() => onQtyChange(item.productId, -1)}>−</button>
                  <span style={S.qtyValueSm}>{item.qty}</span>
                  <button style={S.qtyBtnSm} onClick={() => onQtyChange(item.productId, 1)}>+</button>
                </div>
                <div style={S.cartLineTotal}>{fmt(item.price * item.qty)}</div>
                <button style={S.removeBtn} onClick={() => onRemove(item.productId, item.name)}>✕</button>
              </div>
            ))}
          </div>

          <div style={S.customerBox}>
            <div style={S.label}>Customer Search / Assign</div>
            {selectedCustomer ? (
              <div style={S.selectedCustomer}>
                <span>
                  <strong>{selectedCustomer.name}</strong> 
                  {selectedCustomer.company ? ` · ${selectedCustomer.company}` : ""} 
                  {` (Outstanding Bal: ${fmt(selectedCustomer.balance)})`}
                </span>
                <button style={S.linkBtn} onClick={() => setSelectedCustomer(null)}>Change</button>
              </div>
            ) : (
              <>
                <input 
                  style={S.searchInput} 
                  placeholder="Type name, company, or mobile number..." 
                  value={customerSearch} 
                  onChange={e => setCustomerSearch(e.target.value)} 
                />
                <div style={S.customerList}>
                  {customers.map(c => (
                    <div key={c.id} style={S.customerOption} onClick={() => setSelectedCustomer(c)}>
                      <span>{c.name} {c.company ? `(${c.company})` : ""}</span>
                      <span style={S.customerMobile}>{c.mobile}</span>
                    </div>
                  ))}
                  {customers.length === 0 && <p style={S.emptyText}>No customers match search</p>}
                </div>
              </>
            )}
          </div>

          <div style={S.totalRow}>
            <span>Grand total</span>
            <span style={S.totalValue}>{fmt(total)}</span>
          </div>

          <div style={S.cartActions}>
            <button style={S.dangerGhostBtn} onClick={onCancel}>Cancel order</button>
            <button 
              style={{ ...S.primaryBtn, margin: 0, flex: 1 }} 
              onClick={onConfirm} 
              disabled={!selectedCustomer}
            >
              Confirm &amp; Checkout
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function PackStatusBadge({ status }) {
  const normalized = status || "pending";
  const config = {
    pending: { label: "Pending packing", color: "#993C1D", background: "#FAECE7" },
    packed: { label: "Packed", color: "#8A560C", background: "#FAEEDA" },
    given_to_transport: { label: "Given to transport", color: "#245B88", background: "#E6F1FA" },
    received: { label: "Delivered", color: "#0F6E56", background: "#E4F3EC" }
  }[normalized] || { label: normalized, color: "var(--color-ink-soft)", background: "var(--color-bg)" };
  return <span style={{ display: "inline-flex", alignItems: "center", width: "fit-content", marginTop: 6, padding: "4px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: config.color, background: config.background }}>{config.label}</span>;
}

function OrdersScreen({ orders, onOpenOrder, onBack, fmt }) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [packFilter, setPackFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const matchDate = (dateStr) => {
    if (dateFilter === "all") return true;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (dateFilter === "today") {
      return date >= today;
    }
    if (dateFilter === "yesterday") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return date >= yesterday && date < today;
    }
    if (dateFilter === "week") {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(startOfWeek.getDate() - today.getDay());
      return date >= startOfWeek;
    }
    if (dateFilter === "month") {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return date >= startOfMonth;
    }
    return true;
  };

  const filtered = orders
    .filter(o => {
      const matchSearch = String(o.order_number).includes(search) || 
                          (o.customerName && o.customerName.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const matchPackStatus = packFilter === "all" || (o.pack_status || "pending") === packFilter;
      return matchSearch && matchStatus && matchPackStatus && matchDate(o.created_at);
    })
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === "total_high") return b.total - a.total;
      if (sortBy === "total_low") return a.total - b.total;
      return 0;
    });

  return (
    <main style={S.main} className="animate-fade-in">
      <button style={S.backBtn} onClick={onBack}>← Back to home</button>
      <h2 style={S.sectionHead}>Order History</h2>

      <div style={S.toolRow}>
        <input 
          style={S.searchInput} 
          placeholder="Search order # or customer..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
        <select style={S.sortSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total_high">Total: High to Low</option>
          <option value="total_low">Total: Low to High</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 12, scrollbarWidth: "none" }}>
        <span style={{ fontSize: 13, alignSelf: "center", color: "var(--color-ink-soft)", fontWeight: 600, paddingRight: 4 }}>Period:</span>
        {["all", "today", "yesterday", "week", "month"].map(p => (
          <button 
            key={p} 
            style={{ 
              ...S.pillFilter, 
              ...(dateFilter === p ? S.pillFilterActive : {}) 
            }} 
            onClick={() => setDateFilter(p)}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 18, scrollbarWidth: "none" }}>
        <span style={{ fontSize: 13, alignSelf: "center", color: "var(--color-ink-soft)", fontWeight: 600, paddingRight: 4 }}>Status:</span>
        {["all", "paid", "partial", "unpaid"].map(s => (
          <button 
            key={s} 
            style={{ 
              ...S.pillFilter, 
              ...(statusFilter === s ? S.pillFilterActive : {}) 
            }} 
            onClick={() => setStatusFilter(s)}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 18, scrollbarWidth: "none" }}>
        <span style={{ fontSize: 13, alignSelf: "center", color: "var(--color-ink-soft)", fontWeight: 600, paddingRight: 4 }}>Packing:</span>
        {["all", "pending", "packed", "given_to_transport", "received"].map(packStatus => (
          <button key={packStatus} style={{ ...S.pillFilter, ...(packFilter === packStatus ? S.pillFilterActive : {}) }} onClick={() => setPackFilter(packStatus)}>
            {packStatus === "given_to_transport" ? "IN TRANSPORT" : packStatus === "received" ? "DELIVERED" : packStatus.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(o => (
          <div key={o.id} style={S.orderCard} onClick={() => onOpenOrder(o)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={S.orderNumber}>ORD-{String(o.order_number).padStart(6, "0")}</span>
              <span style={{ ...S.statusBadge, ...S[`status_${o.status}`] }}>
                {o.status.toUpperCase()}
              </span>
            </div>
            <div style={S.orderCust}>{o.customerName}</div>
            {o.has_returns
              ? <span style={{ ...S.statusBadge, display: "inline-block", marginTop: 7, background: "var(--color-danger-bg)", color: "var(--color-danger)" }}>RETURNED</span>
              : <PackStatusBadge status={o.pack_status || "pending"} />}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 8 }}>
              <span>{new Date(o.created_at).toLocaleDateString("en-LK")}</span>
              <strong>{fmt(o.total)}</strong>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={S.emptyText}>No orders match your filters.</p>}
      </div>
    </main>
  );
}

function OrderDetailScreen({ order, onBack, onRefresh, session, fmt, showToast, setConfirmDialog, products = [] }) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [qtyInputs, setQtyInputs] = useState({});

  useEffect(() => {
    setQtyInputs({});
  }, [order.items]);

  const outstanding = Number(order.total) - Number(order.paid_amount);
  const packStatus = order.pack_status || "pending";
  const packActions = {
    pending: "Mark as packed",
    packed: "Mark as given to transport",
    given_to_transport: "Mark as delivered"
  };

  async function handleCopyOrder() {
    const customer = order.customer || {};
    const creator = order.created_by_name || session.name || session.username;
    const packLabel = { pending: 'Pending packing', packed: 'Packed', given_to_transport: 'Given to transport', received: 'Delivered' }[packStatus];
    const customerLines = [
      `Name: ${customer.name || order.customerName || 'Unknown'}`,
      customer.company && `Company: ${customer.company}`,
      customer.mobile && `Mobile: ${customer.mobile}`,
      customer.email && `Email: ${customer.email}`,
      customer.address && `Address: ${customer.address}`,
      customer.nic && `NIC: ${customer.nic}`,
      customer.notes && `Notes: ${customer.notes}`
    ].filter(Boolean);
    const itemLines = (order.items || []).map((item, index) => { const netQty = Number(item.quantity) - Number(item.returned_quantity || 0); return `${index + 1}. ${item.name}\n   ${netQty} × ${fmt(item.unit_price)} = ${fmt(netQty * Number(item.unit_price))}${item.returned_quantity ? ` (${item.returned_quantity} returned)` : ''}`; });
    const text = [
      `ORDER ORD-${String(order.order_number).padStart(6, '0')}`,
      `Date: ${new Date(order.created_at).toLocaleString('en-LK')}`,
      `Created by: ${creator}`,
      '',
      'CUSTOMER',
      ...customerLines,
      '',
      `Packing status: ${packLabel}`,
      `Payment status: ${order.status.toUpperCase()}`,
      '',
      'ITEMS',
      ...itemLines,
      '',
      `Grand total: ${fmt(order.total)}`,
      `Paid: ${fmt(order.paid_amount)}`,
      `Outstanding: ${fmt(outstanding)}`
    ].join('\n');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
      }
      showToast('Copied');
    } catch (err) {
      showToast('Copy failed: ' + err.message);
    }
  }

  async function handleAdvancePackStatus() {
    try {
      let transportName = '';
      if (packStatus === 'packed') {
        const result = await Swal.fire({ title: 'Transport details', text: 'Enter the courier company, service, or driver name.', input: 'text', inputLabel: 'Transport / courier name', inputPlaceholder: 'e.g. Uber Parcel', showCancelButton: true, confirmButtonColor: '#0F6E56', inputValidator: value => !value.trim() ? 'Transport name is required.' : undefined });
        if (!result.isConfirmed) return;
        transportName = result.value.trim();
      }
      await db.advanceOrderPackStatus(order.id, packStatus, session.id, transportName);
      showToast(`Order updated: ${packActions[packStatus]}.`);
      await onRefresh();
    } catch (err) {
      showToast("Packing status update failed: " + err.message);
    }
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    const amt = Number(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("Please enter a valid positive payment amount.");
      return;
    }
    if (amt > outstanding) {
      showToast(`Payment amount cannot exceed outstanding balance of ${fmt(outstanding)}.`);
      return;
    }

    const confirmation = await Swal.fire({ title: 'Record payment?', text: `Apply ${fmt(amt)} to this order?`, icon: 'question', showCancelButton: true, confirmButtonColor: '#0F6E56', showLoaderOnConfirm: true, preConfirm: () => db.recordPayment(order.id, amt, session.id), allowOutsideClick: () => !Swal.isLoading() });
    if (!confirmation.isConfirmed) return;
    try {
      showToast(`Recorded payment of ${fmt(amt)}.`);
      setPaymentAmount("");
      setShowPaymentSheet(false);
      onRefresh();
    } catch (err) {
      showToast("Payment failed: " + err.message);
    }
  }

  async function handleReturn() {
    const availableItems = (order.items || []).filter(item => Number(item.quantity) > Number(item.returned_quantity || 0));
    if (!availableItems.length) return showToast('All items on this order have already been returned.', 'warning');
    const escapeReturnText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char]);
    const html = availableItems.map(item => {
      const remaining = Number(item.quantity) - Number(item.returned_quantity || 0);
      return `<label style="display:grid;grid-template-columns:1fr 90px;gap:12px;align-items:center;text-align:left;margin:10px 0"><span>${escapeReturnText(item.name)}<small style="display:block;color:#667">Available: ${remaining}</small></span><input id="return-${item.id}" class="swal2-input return-quantity" data-remaining="${remaining}" style="width:90px;margin:0" type="number" min="0" max="${remaining}" value="0"></label>`;
    }).join('');
    const result = await Swal.fire({
      title: 'Return order items', html: `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button type="button" id="select-all-returns" class="swal2-styled" style="background:#0F6E56;margin:0;padding:8px 14px">Select all</button></div>${html}`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Confirm return', confirmButtonColor: '#993C1D', showLoaderOnConfirm: true,
      didOpen: () => {
        document.getElementById('select-all-returns')?.addEventListener('click', () => {
          document.querySelectorAll('.return-quantity').forEach(input => { input.value = input.dataset.remaining; });
        });
      },
      preConfirm: async () => {
        const returns = Object.fromEntries(availableItems.map(item => [item.id, Number(document.getElementById(`return-${item.id}`)?.value || 0)]));
        if (!Object.values(returns).some(qty => qty > 0)) return Swal.showValidationMessage('Select at least one quantity to return.');
        if (availableItems.some(item => returns[item.id] < 0 || returns[item.id] > Number(item.quantity) - Number(item.returned_quantity || 0))) return Swal.showValidationMessage('A return quantity is outside its allowed range.');
        return returns;
      },
      allowOutsideClick: () => !Swal.isLoading()
    });
    if (result.isConfirmed) {
      const returnedValue = (order.items || []).reduce((sum, item) => sum + Number(result.value?.[item.id] || 0) * Number(item.unit_price || 0), 0);
      const newOrderTotal = Math.max(0, Number(order.total || 0) - returnedValue);
      const newBalance = newOrderTotal - Number(order.paid_amount || 0);
      const overpaidAmount = Math.max(0, -newBalance);
      let resolution = null;
      let refundMethod = null;

      if (overpaidAmount > 0) {
        const resolutionResult = await Swal.fire({
          title: 'Resolve overpayment',
          html: `<p style="margin-bottom:14px">The customer has overpaid <strong>${escapeReturnText(fmt(overpaidAmount))}</strong> after this return.</p><label style="display:flex;gap:9px;text-align:left;margin:10px 0"><input type="radio" name="return-resolution" value="refund" checked> Refund the customer</label><label style="display:flex;gap:9px;text-align:left;margin:10px 0"><input type="radio" name="return-resolution" value="credit"> Add to customer credit balance</label><label style="display:block;text-align:left;margin-top:14px">Refund method<select id="return-refund-method" class="swal2-select" style="display:block;width:100%;margin:6px 0 0"><option value="cash">Cash</option><option value="bank transfer">Bank transfer</option><option value="card reversal">Card reversal</option><option value="other">Other</option></select></label><small style="display:block;text-align:left;color:#667;margin-top:10px">Stored credit is accumulated for future use; applying it at checkout is not yet available.</small>`,
          icon: 'warning', showCancelButton: true, confirmButtonText: 'Continue', confirmButtonColor: '#993C1D',
          preConfirm: () => {
            const choice = document.querySelector('input[name="return-resolution"]:checked')?.value;
            const method = document.getElementById('return-refund-method')?.value;
            if (!choice) return Swal.showValidationMessage('Choose refund or customer credit.');
            return { resolution: choice, refundMethod: choice === 'refund' ? method : null };
          }
        });
        if (!resolutionResult.isConfirmed) return;
        resolution = resolutionResult.value.resolution;
        refundMethod = resolutionResult.value.refundMethod;
      }

      Swal.fire({ title: 'Finalizing return…', text: 'Updating stock, order totals, and customer balance.', allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
      try {
        await db.returnOrderItems(order.id, result.value, session.id, resolution, refundMethod);
        Swal.close();
      } catch (error) {
        await Swal.fire({ title: 'Return failed', text: error?.message || 'Unknown database error.', icon: 'error' });
        return;
      }
      const allItemsReturned = (order.items || []).every(item =>
        Number(item.returned_quantity || 0) + Number(result.value?.[item.id] || 0) >= Number(item.quantity)
      );
      showToast(allItemsReturned ? 'All order items were returned.' : 'Returned items were restored to their original stock batches.');
      await onRefresh();
      if (allItemsReturned) onBack();
    }
  }

  function handlePrintInvoice() {
    const customer = order.customer || {};
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char]);
    const rows = (order.items || []).map(item => { const netQty = Number(item.quantity) - Number(item.returned_quantity || 0); return `<tr><td>${esc(item.name)}${item.returned_quantity ? ` (${item.returned_quantity} returned)` : ''}</td><td>${netQty}</td><td>${esc(fmt(item.unit_price))}</td><td>${esc(fmt(netQty * Number(item.unit_price)))}</td></tr>`; }).join('');
    const invoice = window.open('', '_blank', 'width=900,height=700');
    if (!invoice) return showToast('Allow pop-ups to print the invoice.', 'warning');
    invoice.document.write(`<!doctype html><html><head><title>Invoice ORD-${String(order.order_number).padStart(6,'0')}</title><style>body{font:14px Arial;color:#17231c;padding:32px}h1{margin:0;color:#085041}.meta{color:#59665d;margin:5px 0 22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:22px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th{background:#f4f6f3}.totals{margin-left:auto;width:320px;margin-top:20px}.totals div{display:flex;justify-content:space-between;padding:6px}.grand{font-size:18px;font-weight:bold;border-top:2px solid #085041}@media print{body{padding:0}}</style></head><body><h1>AS Marketing</h1><div class="meta">0757451414 · 0752222895 · 0788517272 · 0754004708</div><div class="grid"><div><strong>Invoice</strong><br>ORD-${String(order.order_number).padStart(6,'0')}<br>${esc(new Date(order.created_at).toLocaleString('en-LK'))}</div><div><strong>Bill to</strong><br>${esc(customer.name || order.customerName || '')}<br>${esc(customer.company || '')}<br>${esc(customer.mobile || '')}<br>${esc(customer.address || '')}</div></div><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="grand"><span>Grand total</span><span>${esc(fmt(order.total))}</span></div><div><span>Paid (${esc(order.status)})</span><span>${esc(fmt(order.paid_amount))}</span></div><div><span>Outstanding</span><span>${esc(fmt(outstanding))}</span></div></div><script>window.onload=()=>window.print()</script></body></html>`);
    invoice.document.close();
  }

  async function handleQtyChange(productId, oldQty, newQty, unitPrice, name) {
    if (newQty <= 0) {
      handleRemoveItem(productId, oldQty, unitPrice, name);
      return;
    }

    try {
      await db.updateOrderItemQty(order.id, productId, oldQty, newQty, unitPrice);
      showToast(`Updated quantity of ${name} to ${newQty}.`);
      onRefresh();
    } catch (err) {
      showToast(err.message);
      setQtyInputs(prev => ({ ...prev, [productId]: String(oldQty) }));
    }
  }

  function handleQtyChangeWrapper(productId, oldQty, newQty, unitPrice, name) {
    if (newQty > 0) {
      setQtyInputs(prev => ({ ...prev, [productId]: String(newQty) }));
    }
    handleQtyChange(productId, oldQty, newQty, unitPrice, name);
  }

  function handleQtyInputSubmit(item, text) {
    const parsed = Number(text);
    if (text.trim() === "" || isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      showToast("Please enter a valid positive integer quantity.", "error");
      setQtyInputs(prev => ({ ...prev, [item.product_id]: String(item.quantity) }));
      return;
    }

    if (parsed === 0) {
      showToast("To remove an item, please use the delete button (✕) or reduce quantity to 0 using the minus button.", "warning");
      setQtyInputs(prev => ({ ...prev, [item.product_id]: String(item.quantity) }));
      return;
    }

    const product = products.find(p => p.id === item.product_id);
    const currentStock = product ? product.stock : 0;
    const availableStock = currentStock + item.quantity;
    if (parsed > availableStock) {
      showToast(`Insufficient stock. Only ${availableStock} items available (including ${item.quantity} in this order).`, "error");
      setQtyInputs(prev => ({ ...prev, [item.product_id]: String(item.quantity) }));
      return;
    }

    if (parsed === item.quantity) {
      setQtyInputs(prev => ({ ...prev, [item.product_id]: String(item.quantity) }));
      return;
    }

    handleQtyChangeWrapper(item.product_id, item.quantity, parsed, item.unit_price, item.name);
  }

  function handleRemoveItem(productId, qty, unitPrice, name) {
    setConfirmDialog({
      title: "Remove item from order?",
      message: `Delete ${name} from this order? This will restore ${qty} items back to stock.`,
      onConfirm: async () => {
        try {
          await db.removeOrderItem(order.id, productId, qty, unitPrice);
          showToast(`Removed ${name} from order.`);
          setConfirmDialog(null);
          onRefresh();
        } catch (err) {
          showToast("Failed to remove item: " + err.message);
          setConfirmDialog(null);
        }
      }
    });
  }

  function handleDeleteOrder() {
    setConfirmDialog({
      title: "Delete this order?",
      message: `Move ORD-${String(order.order_number).padStart(6, "0")} to the recycle bin? Product stock and customer outstanding balance will be automatically restored.`,
      onConfirm: async () => {
        try {
          await db.softDeleteOrder(order.id);
          showToast(`Order ORD-${String(order.order_number).padStart(6, "0")} moved to recycle bin.`);
          setConfirmDialog(null);
          await onRefresh();
          onBack();
        } catch (err) {
          showToast("Deletion failed: " + err.message);
          setConfirmDialog(null);
        }
      }
    });
  }

  return (
    <main style={S.main} className="animate-fade-in">
      <button style={S.backBtn} onClick={onBack}>← Back to history</button>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ ...S.sectionHead, margin: 0 }}>ORD-{String(order.order_number).padStart(6, "0")}</h2>
          <span style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
            Placed on {new Date(order.created_at).toLocaleString("en-LK")}
          </span>
        </div>
        <span style={{ ...S.statusBadge, ...S[`status_${order.status}`], fontSize: 11, padding: "5px 10px" }}>
          {order.status.toUpperCase()}
        </span>
      </div>

      <div style={S.invoiceSection}>
        <div style={S.invoiceLabel}>Packing / Fulfillment</div>
        <div style={{ ...S.invoiceValue, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <PackStatusBadge status={packStatus} />
          {packActions[packStatus] && <button style={{ ...S.primaryBtn, margin: 0, width: "auto", padding: "8px 12px" }} onClick={handleAdvancePackStatus}>{packActions[packStatus]}</button>}
          {packStatus === "received" && <span style={{ color: "var(--color-teal)", fontWeight: 600 }}>Final</span>}
        </div>
        {order.transport_name && <><div style={S.invoiceLabel}>Transport / Courier</div><div style={S.invoiceValue}>{order.transport_name}</div></>}
        {order.has_returns && <div style={{ ...S.statusBadge, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', alignSelf: 'flex-start' }}>RETURNED ITEMS</div>}
        <div style={S.invoiceLabel}>Customer Profile</div>
        <div style={S.invoiceValue}>{order.customerName}</div>
        <div style={S.invoiceLabel}>Billing Created By</div>
        <div style={S.invoiceValue}>{order.created_by_name || session.name || session.username}</div>
      </div>

      <h3 style={{ ...S.sectionHead, fontSize: 16, marginTop: 22, marginBottom: 12 }}>Line Items</h3>
      <div style={S.cartList}>
        {(order.items || []).map(item => (
          <div key={item.product_id} style={S.cartRow}>
            <div style={S.cartImage}>{item.name.slice(0, 1)}</div>
            <div style={{ flex: 1 }}>
              <div style={S.cartName}>{item.name}</div>
              <div style={S.cartUnitPrice}>{fmt(item.unit_price)} each</div>
              {Number(item.returned_quantity || 0) > 0 && <div style={{ ...S.cartUnitPrice, color: 'var(--color-danger)', fontWeight: 600 }}>Returned: {item.returned_quantity}</div>}
            </div>
            {!order.has_returns && <div style={S.qtyRow}>
              <button style={S.qtyBtnSm} onClick={() => handleQtyChangeWrapper(item.product_id, item.quantity, item.quantity - 1, item.unit_price, item.name)}>−</button>
              <input
                aria-label="Quantity"
                type="number"
                min="1"
                step="1"
                value={qtyInputs[item.product_id] !== undefined ? qtyInputs[item.product_id] : String(item.quantity)}
                onChange={e => setQtyInputs(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                onBlur={e => handleQtyInputSubmit(item, e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.target.blur();
                  }
                }}
                style={{ ...S.input, width: 60, height: 26, padding: 0, margin: "0 4px", textAlign: "center", fontWeight: 700, fontSize: 13, borderRadius: 6 }}
              />
              <button style={S.qtyBtnSm} onClick={() => handleQtyChangeWrapper(item.product_id, item.quantity, item.quantity + 1, item.unit_price, item.name)}>+</button>
            </div>}
            <div style={S.cartLineTotal}>{fmt(item.unit_price * item.quantity)}</div>
            {!order.has_returns && <button style={S.removeBtn} onClick={() => handleRemoveItem(item.product_id, item.quantity, item.unit_price, item.name)}>✕</button>}
          </div>
        ))}
        {(!order.items || order.items.length === 0) && <p style={S.emptyText}>No items remaining in this order.</p>}
      </div>

      <div style={{ ...S.invoiceSection, marginTop: 20 }}>
        <div style={S.invoiceRow}>
          <span>Order Total</span>
          <strong>{fmt(order.total)}</strong>
        </div>
        <div style={S.invoiceRow}>
          <span>Paid Amount</span>
          <span style={{ color: "var(--color-teal)", fontWeight: 600 }}>{fmt(order.paid_amount)}</span>
        </div>
        <div style={{ ...S.invoiceRow, borderTop: "1px solid var(--color-border)", paddingTop: 10, marginTop: 10 }}>
          <span>Outstanding Balance</span>
          <strong style={{ color: outstanding > 0 ? "var(--color-danger)" : "var(--color-ink)", fontSize: 17 }}>
            {fmt(outstanding)}
          </strong>
        </div>
        {(order.refunds || []).map(refund => <div key={refund.id} style={{ ...S.invoiceRow, color: "var(--color-danger)" }}><span>Refund ({refund.method})</span><strong>{fmt(refund.amount)}</strong></div>)}
        {Number(order.return_credit_amount || 0) > 0 && <div style={{ ...S.invoiceRow, color: "var(--color-teal)" }}><span>Added to customer credit</span><strong>{fmt(order.return_credit_amount)}</strong></div>}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button style={{ ...S.ghostBtn, margin: 0 }} onClick={handlePrintInvoice}>{packStatus === 'received' ? 'Download / Print invoice' : 'Print bill'}</button>
        <button style={{ ...S.ghostBtn, margin: 0, color: 'var(--color-danger)' }} onClick={handleReturn}>Return</button>
        <button style={{ ...S.ghostBtn, margin: 0 }} onClick={handleCopyOrder}>Copy to clipboard</button>
        <button style={S.dangerGhostBtn} onClick={handleDeleteOrder}>
          🗑️ Recycle Bin
        </button>
        {outstanding > 0 && (
          <button style={{ ...S.primaryBtn, margin: 0, flex: 1 }} onClick={() => setShowPaymentSheet(true)}>
            💵 Record Payment
          </button>
        )}
      </div>

      {showPaymentSheet && (
        <div style={S.sheetOverlay} onClick={() => setShowPaymentSheet(false)} className="animate-fade-in">
          <div style={S.sheet} onClick={e => e.stopPropagation()} className="animate-slide-up">
            <div style={S.sheetHandle} />
            <h3 style={S.sheetTitle}>Record Payment</h3>
            <p style={S.sheetDesc}>Enter amount paid by {order.customerName} for ORD-{String(order.order_number).padStart(6, "0")}.</p>
            
            <form onSubmit={handleRecordPayment} style={{ width: "100%", marginTop: 15 }}>
              <label style={S.label}>Payment Amount (LKR)</label>
              <input 
                style={S.input} 
                type="number"
                step="0.01"
                min="0.01"
                max={outstanding}
                value={paymentAmount} 
                onChange={e => setPaymentAmount(e.target.value)} 
                placeholder={`e.g. ${outstanding}`}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 13, color: "var(--color-ink-soft)" }}>
                <span>Outstanding: {fmt(outstanding)}</span>
                <span style={{ cursor: "pointer", color: "var(--color-teal)", fontWeight: 600 }} onClick={() => setPaymentAmount(String(outstanding))}>Pay Full</span>
              </div>
              <button type="submit" style={S.primaryBtn}>Confirm Payment</button>
              <button type="button" style={S.ghostBtn} onClick={() => setShowPaymentSheet(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function ReportsScreen({ orders, categories, products, customers, stockHistory, stockBatches, fmt, currency, onBack, showToast }) {
  const [reportType, setReportType] = useState("sales");
  const [periodType, setPeriodType] = useState("daily");
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [monthlyDate, setMonthlyDate] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedStockProductIds, setSelectedStockProductIds] = useState([]);
  const [expandedStockCategories, setExpandedStockCategories] = useState(() => categories.map(category => category.id));
  const [includeStockCost, setIncludeStockCost] = useState(false);
  const [includeStockValue, setIncludeStockValue] = useState(false);

  const selectedStockIds = new Set(selectedStockProductIds);
  const selectableStockProducts = products.filter(product => categories.some(category => category.id === product.category_id));
  const allStockSelected = selectableStockProducts.length > 0 && selectableStockProducts.every(product => selectedStockIds.has(product.id));
  const someStockSelected = selectedStockProductIds.length > 0;

  const setAllStockProducts = checked => setSelectedStockProductIds(checked ? selectableStockProducts.map(product => product.id) : []);
  const setCategoryStockProducts = (categoryId, checked) => {
    const categoryProductIds = products.filter(product => product.category_id === categoryId).map(product => product.id);
    setSelectedStockProductIds(current => checked
      ? [...new Set([...current, ...categoryProductIds])]
      : current.filter(id => !categoryProductIds.includes(id)));
  };
  const setStockProduct = (productId, checked) => setSelectedStockProductIds(current => checked ? [...new Set([...current, productId])] : current.filter(id => id !== productId));

  const selectedPeriod = periodType === "daily" ? dailyDate : monthlyDate;
  const periodLabel = periodType === "daily"
    ? new Date(`${dailyDate}T00:00:00`).toLocaleDateString("en-LK", { year: "numeric", month: "long", day: "numeric" })
    : new Date(`${monthlyDate}-01T00:00:00`).toLocaleDateString("en-LK", { year: "numeric", month: "long" });

  const periodOrders = orders.filter(order => {
    const created = new Date(order.created_at);
    if (Number.isNaN(created.getTime())) return false;
    const localDay = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
    return periodType === "daily" ? localDay === dailyDate : localDay.slice(0, 7) === monthlyDate;
  });

  const periodStockHistory = stockHistory.filter(entry => {
    const created = new Date(entry.created_at);
    if (Number.isNaN(created.getTime())) return false;
    const localDay = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
    return periodType === "daily" ? localDay === dailyDate : localDay.slice(0, 7) === monthlyDate;
  });

  const customerRows = customers.map(customer => {
    const customerOrders = periodOrders.filter(order => order.customer_id === customer.id);
    return {
      customer: customer.name,
      company: customer.company || "—",
      orders: customerOrders.length,
      sales: customerOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      paid: customerOrders.reduce((sum, order) => sum + Number(order.paid_amount || 0), 0),
      outstanding: customerOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0)), 0)
    };
  }).filter(row => row.orders > 0);

  const stockDetailEnabled = includeStockCost || includeStockValue;
  const stockColumns = ["Product", "SKU", "Barcode", "Current Qty", "Period Movement", ...(includeStockCost ? ["Cost Price"] : []), ...(includeStockValue ? ["Stock Value"] : []), "State"];
  const stockMoneyColumns = [
    ...(includeStockCost ? [5] : []),
    ...(includeStockValue ? [includeStockCost ? 6 : 5] : [])
  ];
  const makeStockRow = (values, rowType = 'data') => Object.assign(values, { rowType });
  const selectedStockProducts = products.filter(product => selectedStockIds.has(product.id));
  const productStockRows = new Map(selectedStockProducts.map(product => {
    const activeBatches = stockBatches.filter(batch => batch.product_id === product.id && Number(batch.quantity_remaining) > 0);
    const movement = periodStockHistory.filter(entry => entry.product_id === product.id).reduce((sum, entry) => sum + Number(entry.change_amount || 0), 0);
    const totalQuantity = activeBatches.reduce((sum, batch) => sum + Number(batch.quantity_remaining), 0);
    const totalValue = activeBatches.reduce((sum, batch) => sum + Number(batch.quantity_remaining) * Number(batch.cost_price || 0), 0);
    const weightedCost = totalQuantity ? totalValue / totalQuantity : 0;
    if (!stockDetailEnabled) return [product.id, [makeStockRow([product.name, product.sku, product.barcode || "—", totalQuantity, movement, totalQuantity <= 10 ? "Low stock" : "In stock"])]];
    const batchRows = activeBatches.map((batch, index) => makeStockRow([
      `${product.name} · Batch ${index + 1} (${batch.source.replaceAll('_', ' ')}, ${new Date(batch.received_at).toLocaleDateString('en-LK')})`,
      product.sku, product.barcode || "—", Number(batch.quantity_remaining), index === 0 ? movement : "—",
      ...(includeStockCost ? [Number(batch.cost_price || 0)] : []),
      ...(includeStockValue ? [Number(batch.quantity_remaining) * Number(batch.cost_price || 0)] : []),
      Number(batch.quantity_remaining) <= 10 ? "Low batch" : "Active batch"
    ]));
    if (!batchRows.length) batchRows.push(makeStockRow([product.name, product.sku, product.barcode || "—", 0, movement, ...(includeStockCost ? [0] : []), ...(includeStockValue ? [0] : []), "Out of stock"]));
    if (activeBatches.length > 1) {
      batchRows.push(makeStockRow([
        `${product.name} subtotal`, product.sku, "—", totalQuantity, movement,
        ...(includeStockCost ? [weightedCost] : []), ...(includeStockValue ? [totalValue] : []), "Product total"
      ], 'subtotal'));
    }
    return [product.id, batchRows];
  }));
  const stockRows = selectedStockProducts.flatMap(product => productStockRows.get(product.id) || []);
  const grandQuantity = selectedStockProducts.reduce((sum, product) => sum + stockBatches.filter(batch => batch.product_id === product.id && Number(batch.quantity_remaining) > 0).reduce((batchSum, batch) => batchSum + Number(batch.quantity_remaining), 0), 0);
  const grandValue = selectedStockProducts.reduce((sum, product) => sum + stockBatches.filter(batch => batch.product_id === product.id && Number(batch.quantity_remaining) > 0).reduce((batchSum, batch) => batchSum + Number(batch.quantity_remaining) * Number(batch.cost_price || 0), 0), 0);
  const grandWeightedCost = grandQuantity ? grandValue / grandQuantity : 0;
  const stockGrandTotalRow = stockDetailEnabled ? makeStockRow(["GRAND TOTAL", "—", "—", grandQuantity, "—", ...(includeStockCost ? [grandWeightedCost] : []), ...(includeStockValue ? [grandValue] : []), "Selected products"], 'grand') : null;

  const reportDefinitions = {
    sales: {
      title: "Sales Report",
      columns: ["Order", "Customer", "Date", "Status", "Total", "Paid", "Outstanding"],
      rows: periodOrders.map(order => [
        `ORD-${String(order.order_number).padStart(6, "0")}`,
        order.customerName || order.customer?.name || "Unknown",
        new Date(order.created_at).toLocaleString("en-LK"),
        order.status,
        Number(order.total || 0),
        Number(order.paid_amount || 0),
        Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0))
      ]),
      moneyColumns: [4, 5, 6]
    },
    profitability: {
      title: "FIFO Sales Cost & Profit Report",
      columns: ["Order", "Customer", "Revenue", "FIFO Cost", "Profit", "Margin"],
      rows: periodOrders.map(order => {
        const revenue = Number(order.total || 0);
        const cost = (order.items || []).reduce((sum, item) => sum + (item.batch_usage || []).reduce((usageSum, usage) => usageSum + (Number(usage.quantity) - Number(usage.returned_quantity || 0)) * Number(usage.cost_price_at_time || 0), 0), 0);
        const profit = revenue - cost;
        return [`ORD-${String(order.order_number).padStart(6, "0")}`, order.customerName || order.customer?.name || "Unknown", revenue, cost, profit, revenue ? `${((profit / revenue) * 100).toFixed(1)}%` : "0.0%"];
      }),
      moneyColumns: [2, 3, 4]
    },
    stock: {
      title: "Stock Report",
      columns: stockColumns,
      rows: stockRows,
      moneyColumns: stockMoneyColumns
    },
    customer: {
      title: "Customer Report",
      columns: ["Customer", "Company", "Orders", "Sales", "Paid", "Outstanding"],
      rows: customerRows.map(row => [row.customer, row.company, row.orders, row.sales, row.paid, row.outstanding]),
      moneyColumns: [3, 4, 5]
    },
    outstanding: {
      title: "Outstanding Report",
      columns: ["Customer", "Company", "Mobile", "Current Balance", "Period Orders", "Period Outstanding"],
      rows: customers
        .map(customer => {
          const periodCustomerOrders = periodOrders.filter(order => order.customer_id === customer.id);
          return [
            customer.name,
            customer.company || "—",
            customer.mobile || "—",
            Number(customer.balance || 0),
            periodCustomerOrders.length,
            periodCustomerOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0)), 0)
          ];
        })
        .filter(row => row[3] > 0 || row[5] > 0),
      moneyColumns: [3, 5]
    }
  };

  const report = reportDefinitions[reportType];
  const stockReportGroups = categories.map(category => ({
    category,
    rows: reportType === 'stock' ? products.filter(product => product.category_id === category.id && selectedStockIds.has(product.id)).flatMap(product => productStockRows.get(product.id) || []) : []
  })).filter(group => group.rows.length > 0);
  const summary = reportType === "stock"
    ? [
        ["Products", selectedStockProductIds.length],
        ["Net movement", selectedStockProducts.reduce((sum, product) => sum + periodStockHistory.filter(entry => entry.product_id === product.id).reduce((movement, entry) => movement + Number(entry.change_amount || 0), 0), 0)],
        [includeStockValue ? "Stock value" : "Total quantity", includeStockValue ? fmt(grandValue) : grandQuantity]
      ]
    : reportType === 'profitability' ? [
        ["Revenue", fmt(report.rows.reduce((sum, row) => sum + row[2], 0))],
        ["FIFO cost", fmt(report.rows.reduce((sum, row) => sum + row[3], 0))],
        ["Profit", fmt(report.rows.reduce((sum, row) => sum + row[4], 0))]
      ] : [
        ["Orders", periodOrders.length],
        ["Sales", fmt(periodOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))],
        ["Outstanding", fmt(periodOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0)), 0))]
      ];

  const displayCell = (value, columnIndex) => report.moneyColumns.includes(columnIndex) ? fmt(value) : value;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

  function exportExcel() {
    const header = report.columns.map(column => `<th>${escapeHtml(column)}</th>`).join("");
    const excelRow = row => `<tr${row.rowType === 'subtotal' ? ' style="font-weight:bold;background:#f3f5f1"' : row.rowType === 'grand' ? ' style="font-weight:bold;background:#dcefe7"' : ''}>${row.map((cell, index) => `<td>${escapeHtml(report.moneyColumns.includes(index) && typeof cell === 'number' ? fmt(cell) : cell)}</td>`).join("")}</tr>`;
    const body = reportType === 'stock'
      ? `${stockReportGroups.map(group => `<tr><th colspan="${report.columns.length}">${escapeHtml(group.category.name)}</th></tr>${group.rows.map(excelRow).join("")}`).join("")}${stockGrandTotalRow ? excelRow(stockGrandTotalRow) : ''}`
      : report.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    const workbook = `\ufeff<html><head><meta charset="UTF-8"></head><body><h2>${escapeHtml(report.title)}</h2><p>${escapeHtml(periodLabel)} · ${escapeHtml(currency)}</p><table border="1"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    const url = URL.createObjectURL(new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportType}_report_${selectedPeriod}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Excel report downloaded.");
  }

  function exportPdf() {
    const previousTitle = document.title;
    document.title = `${report.title} - ${selectedPeriod}`;
    window.print();
    document.title = previousTitle;
  }

  return (
    <main style={S.main} className="animate-fade-in">
      <div className="report-screen-controls">
        <button style={S.backBtn} onClick={onBack}>← Back to Home</button>
        <h2 style={S.sectionHead}>Reports</h2>

        <div style={{ ...S.profileCard, marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <label style={S.label}>Report</label>
              <select style={S.input} value={reportType} onChange={event => setReportType(event.target.value)}>
                <option value="sales">Sales</option>
                <option value="profitability">FIFO Cost &amp; Profit</option>
                <option value="stock">Stock</option>
                <option value="customer">Customer</option>
                <option value="outstanding">Outstanding</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Period</label>
              <select style={S.input} value={periodType} onChange={event => setPeriodType(event.target.value)}>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={S.label}>{periodType === "daily" ? "Date" : "Month"}</label>
              <input
                style={S.input}
                type={periodType === "daily" ? "date" : "month"}
                value={selectedPeriod}
                onChange={event => periodType === "daily" ? setDailyDate(event.target.value) : setMonthlyDate(event.target.value)}
              />
            </div>
          </div>
          {reportType === 'stock' && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><input type="checkbox" checked={includeStockCost} onChange={event => setIncludeStockCost(event.target.checked)} />Include cost price</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><input type="checkbox" checked={includeStockValue} onChange={event => setIncludeStockValue(event.target.checked)} />Include stock value</label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700, marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={allStockSelected}
                  ref={element => { if (element) element.indeterminate = someStockSelected && !allStockSelected; }}
                  onChange={event => setAllStockProducts(event.target.checked)}
                />
                Select all products
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                {categories.map(category => {
                  const categoryProducts = products.filter(product => product.category_id === category.id);
                  const selectedCount = categoryProducts.filter(product => selectedStockIds.has(product.id)).length;
                  const categorySelected = categoryProducts.length > 0 && selectedCount === categoryProducts.length;
                  const expanded = expandedStockCategories.includes(category.id);
                  return (
                    <div key={category.id} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "9px 11px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${category.name}`} onClick={() => setExpandedStockCategories(current => expanded ? current.filter(id => id !== category.id) : [...current, category.id])} style={{ width: 24, fontWeight: 700 }}>{expanded ? '−' : '+'}</button>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, fontWeight: 600 }}>
                          <input type="checkbox" disabled={!categoryProducts.length} checked={categorySelected} ref={element => { if (element) element.indeterminate = selectedCount > 0 && !categorySelected; }} onChange={event => setCategoryStockProducts(category.id, event.target.checked)} />
                          {category.name} <span style={{ color: "var(--color-ink-soft)", fontSize: 12 }}>({selectedCount}/{categoryProducts.length})</span>
                        </label>
                      </div>
                      {expanded && <div style={{ display: "grid", gap: 7, margin: "9px 0 2px 32px" }}>
                        {categoryProducts.map(product => <label key={product.id} style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={selectedStockIds.has(product.id)} onChange={event => setStockProduct(product.id, event.target.checked)} /><span>{product.name}</span><small style={{ color: "var(--color-ink-soft)" }}>{product.sku}</small></label>)}
                        {!categoryProducts.length && <span style={S.emptyText}>No products in this category.</span>}
                      </div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button style={{ ...S.primaryBtn, margin: 0, width: "auto" }} disabled={reportType === 'stock' && !someStockSelected} onClick={exportPdf}>Export PDF</button>
            <button style={{ ...S.ghostBtn, margin: 0, width: "auto" }} disabled={reportType === 'stock' && !someStockSelected} onClick={exportExcel}>Export Excel</button>
          </div>
        </div>
      </div>

      <section className="reports-print-area" style={S.profileCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ ...S.sectionHead, marginBottom: 4 }}>{report.title}</h2>
            <p style={S.profileDetail}>{periodLabel}</p>
          </div>
          <strong style={{ color: "var(--color-teal)" }}>{currency}</strong>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
          {summary.map(([label, value]) => (
            <div key={label} className={reportType === 'stock' && label === 'Net movement' ? 'stock-print-hide-movement' : undefined} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 12 }}>
              <div style={{ color: "var(--color-ink-soft)", fontSize: 12 }}>{label}</div>
              <strong style={{ fontSize: 16 }}>{value}</strong>
            </div>
          ))}
        </div>

        <div style={{ overflowX: "auto" }}>
          {reportType === 'stock' && !someStockSelected ? <p style={S.emptyText}>Select categories or products to view their stock report.</p> : <table className="report-table">
            <thead><tr>{report.columns.map(column => <th key={column} className={reportType === 'stock' && column === 'Period Movement' ? 'stock-print-hide-movement' : undefined}>{column}</th>)}</tr></thead>
            <tbody>
              {reportType === 'stock' ? <>{stockReportGroups.map(group => <Fragment key={group.category.id}><tr><th colSpan={report.columns.length} style={{ color: "var(--color-teal)", fontSize: 14 }}>{group.category.name}</th></tr>{group.rows.map((row, rowIndex) => <tr key={`${group.category.id}-${rowIndex}`} style={row.rowType === 'subtotal' ? { fontWeight: 700, background: "var(--color-bg)" } : undefined}>{row.map((cell, columnIndex) => <td key={columnIndex} className={columnIndex === 4 ? 'stock-print-hide-movement' : undefined}>{displayCell(cell, columnIndex)}</td>)}</tr>)}</Fragment>)}{stockGrandTotalRow && <tr style={{ fontWeight: 800, background: "var(--color-amber-bg)", borderTop: "2px solid var(--color-teal)" }}>{stockGrandTotalRow.map((cell, columnIndex) => <td key={columnIndex} className={columnIndex === 4 ? 'stock-print-hide-movement' : undefined}>{displayCell(cell, columnIndex)}</td>)}</tr>}</> : report.rows.map((row, rowIndex) => (
                <tr key={`${reportType}-${rowIndex}`}>
                  {row.map((cell, columnIndex) => <td key={columnIndex}>{displayCell(cell, columnIndex)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>}
          {reportType !== 'stock' && report.rows.length === 0 && <p style={S.emptyText}>No records found for this report.</p>}
        </div>
      </section>
    </main>
  );
}

function SettingsScreen({ session, onRegisterBiometric, onBack, theme, setTheme, currency, setCurrency, loadData, showToast, logout }) {
  const isBiometricAvailable = db.isWebAuthnSupported();

  const handleBackup = async () => {
    try {
      const data = await db.exportBackup();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `asmarketing_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded successfully.");
    } catch (err) {
      showToast("Backup failed: " + err.message);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const confirmation = await Swal.fire({ title: 'Restore database backup?', text: 'Current workspace data will be replaced by the selected backup. This cannot be undone.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Restore database', confirmButtonColor: '#993C1D', showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(), preConfirm: async () => { try { await db.restoreBackup(evt.target.result, session.id); } catch (error) { Swal.showValidationMessage(error.message); throw error; } } });
      if (!confirmation.isConfirmed) { e.target.value = ''; return; }
      try {
        showToast("Backup restored! Workspace synchronized.");
        await loadData();
      } catch (err) {
        showToast("Restore failed: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <main style={S.main} className="animate-fade-in">
      <button style={S.backBtn} onClick={onBack}>← Back to Home</button>
      <h2 style={S.sectionHead}>Settings &amp; Profile</h2>
      
      <div style={S.profileCard}>
        <div style={S.profileAvatar}>
          {session.name ? session.name.slice(0, 2).toUpperCase() : session.username.slice(0, 2).toUpperCase()}
        </div>
        <h3 style={S.profileName}>{session.name || "System User"}</h3>
        <p style={S.profileDetail}>Role: <strong>{session.role === 'superadmin' ? 'Super Admin' : 'Staff'}</strong></p>
        <p style={S.profileDetail}>Email: <strong>{session.email || 'N/A'}</strong></p>
        <p style={S.profileDetail}>Mobile: <strong>{session.mobile || 'N/A'}</strong></p>

        {/* Theming and Currency Configurations */}
        <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 20, paddingTop: 16 }}>
          <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Appearance &amp; Locale</h4>
          
          <label style={{ ...S.label, marginTop: 4 }}>Color Theme</label>
          <select 
            value={theme} 
            onChange={e => setTheme(e.target.value)} 
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
          >
            <option value="light">☀️ Light Theme</option>
            <option value="dark">🌙 Dark Theme</option>
          </select>

          <label style={{ ...S.label, marginTop: 14 }}>Base Currency</label>
          <select 
            value={currency} 
            onChange={e => setCurrency(e.target.value)} 
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
          >
            <option value="LKR">LKR (Rs. - Sri Lankan Rupee)</option>
            <option value="USD">USD ($ - US Dollar)</option>
            <option value="EUR">EUR (€ - Euro)</option>
          </select>
        </div>

        {/* Database backup & restore */}
        <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 20, paddingTop: 16 }}>
          <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Backup &amp; Restore</h4>
          <p style={{ color: "var(--color-ink-soft)", fontSize: 12.5, marginBottom: 12, lineHeight: 1.4 }}>
            Export the current tables as a JSON file, or restore data from an existing backup file.
          </p>
          <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
            <button style={{ ...S.primaryBtn, margin: 0, background: "var(--color-teal-dark)" }} onClick={handleBackup}>
              📥 Download Database Backup (.json)
            </button>
            <label style={{ ...S.primaryBtn, margin: 0, background: "transparent", border: "1.5px solid var(--color-border)", color: "var(--color-ink)", display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer" }}>
              📤 Restore Database Backup
              <input type="file" accept=".json" onChange={handleRestore} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        {/* Device Biometrics setting */}
        <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 20, paddingTop: 16 }}>
          <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Biometric authentication</h4>
          <p style={{ color: "var(--color-ink-soft)", fontSize: 12.5, marginBottom: 12, lineHeight: 1.4 }}>
            Register your fingerprint on this device to log in instantly without typing your password.
          </p>

          {isBiometricAvailable ? (
            <button style={{ ...S.primaryBtn, margin: 0 }} onClick={onRegisterBiometric}>
              🧬 Register Fingerprint on Device
            </button>
          ) : (
            <div style={{ color: "var(--color-danger)", background: "var(--color-danger-bg)", padding: 12, borderRadius: 8, fontSize: 13 }}>
              WebAuthn fingerprint login is unavailable on this device/connection. Ensure you are using HTTPS.
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 20, paddingTop: 16 }}>
          <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 8 }}>About</h4>
          <p style={{ color: "var(--color-ink-soft)", fontSize: 12.5, lineHeight: 1.5 }}>
            Stock &amp; Order Management App · Version 1.0.0
          </p>
          <p style={{ color: "var(--color-ink-soft)", fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>
            Inventory, order tracking, customer accounts, reporting, and sales ledger management.
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 20, paddingTop: 16 }}>
          <button style={{ ...S.ghostBtn, margin: 0, color: "var(--color-danger)", borderColor: "var(--color-danger)" }} onClick={logout}>
            Log out of this device
          </button>
        </div>
      </div>
    </main>
  );
}

function BarcodeScannerModal({ onClose, onScanSuccess }) {
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("scanner-container");
    const config = { 
      fps: 10, 
      qrbox: { width: 250, height: 150 },
      aspectRatio: 1.777778
    };

    html5QrCode.start(
      { facingMode: "environment" }, 
      config, 
      (decodedText) => {
        onScanSuccess(decodedText);
        html5QrCode.stop().then(() => {
          onClose();
        }).catch(err => {
          console.error("Failed to stop scanner:", err);
          onClose();
        });
      },
      () => {
        // Verbose scanning error logs ignored
      }
    ).catch(err => {
      console.error("Scanner initialization failed:", err);
      setScannerError("Camera permission denied or camera not found.");
    });

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Error stopping scanner during cleanup:", err));
      }
    };
  }, [onClose, onScanSuccess]);

  return (
    <div style={S.sheetOverlay} onClick={onClose} className="animate-fade-in">
      <div style={{ ...S.sheet, minHeight: 350 }} onClick={e => e.stopPropagation()} className="animate-slide-up">
        <div style={S.sheetHandle} />
        <h3 style={S.sheetTitle}>Scan Barcode</h3>
        <p style={S.sheetDesc}>Align the barcode inside the camera frame.</p>
        
        {scannerError ? (
          <p style={{ ...S.errorText, textAlign: "center", margin: "20px 0" }}>{scannerError}</p>
        ) : (
          <div id="scanner-container" style={{ width: "100%", maxWidth: 350, height: 200, background: "#000", borderRadius: 10, overflow: "hidden", margin: "12px 0" }} />
        )}
        
        <button style={S.ghostBtn} onClick={onClose}>Cancel Scan</button>
      </div>
    </div>
  );
}

function AccountScreen({ session, customers, orders, loadData, showToast, fmt, onBack, onOpenOrder }) {
  const [selectedLedgerCustomer, setSelectedLedgerCustomer] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [custSearch, setCustSearch] = useState("");

  const loadLedger = useCallback(async (customerId) => {
    setLoadingLedger(true);
    try {
      const data = await db.fetchCustomerLedger(customerId);
      setLedgerData(data);
    } catch (err) {
      showToast("Failed to load customer ledger: " + err.message);
    } finally {
      setLoadingLedger(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedLedgerCustomer) {
      loadLedger(selectedLedgerCustomer.id);
    }
  }, [selectedLedgerCustomer, loadLedger]);

  // Aggregate stats
  const totalOutstanding = customers.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  const totalCollected = orders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);

  const filteredCusts = customers.filter(c => 
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(custSearch.toLowerCase())) ||
    c.mobile.includes(custSearch)
  );

  const handlePrint = () => {
    window.print();
  };

  const handleRecordCustomerPayment = async (customer) => {
    const outstandingOrders = orders
      .filter(order => order.customer_id === customer.id && !order.is_deleted && Number(order.total) > Number(order.paid_amount || 0))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const outstanding = outstandingOrders.reduce((sum, order) => sum + Number(order.total) - Number(order.paid_amount || 0), 0);
    if (outstanding <= 0) {
      showToast('This customer has no outstanding orders.');
      return;
    }

    const amountResult = await Swal.fire({
      title: 'Record payment',
      html: `<p style="margin:0 0 8px"><strong>${String(customer.name).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char])}</strong></p><p style="margin:0">Current outstanding: <strong>${fmt(outstanding)}</strong></p>`,
      input: 'number',
      inputLabel: 'Payment amount',
      inputAttributes: { min: '0.01', step: '0.01' },
      showCancelButton: true,
      confirmButtonColor: '#0F6E56',
      inputValidator: value => !Number.isFinite(Number(value)) || Number(value) <= 0 ? 'Enter a valid payment amount.' : undefined
    });
    if (!amountResult.isConfirmed) return;

    const amount = Number(amountResult.value);
    const excess = Math.max(0, amount - outstanding);
    let resolution = null;
    let refundMethod = null;
    if (excess > 0) {
      const resolutionResult = await Swal.fire({
        title: 'Resolve excess payment',
        html: `The payment exceeds all outstanding orders by <strong>${fmt(excess)}</strong>.`,
        input: 'radio',
        inputOptions: { refund: 'Refund the excess', credit: "Add to customer's credit balance" },
        inputValidator: value => !value ? 'Choose how to handle the excess.' : undefined,
        showCancelButton: true,
        confirmButtonColor: '#0F6E56'
      });
      if (!resolutionResult.isConfirmed) return;
      resolution = resolutionResult.value;
      if (resolution === 'refund') {
        const methodResult = await Swal.fire({
          title: 'Refund method',
          input: 'select',
          inputOptions: { Cash: 'Cash', 'Bank transfer': 'Bank transfer', 'Card reversal': 'Card reversal', Other: 'Other' },
          showCancelButton: true,
          confirmButtonColor: '#0F6E56'
        });
        if (!methodResult.isConfirmed) return;
        refundMethod = methodResult.value;
      }
    }

    let remaining = Math.min(amount, outstanding);
    const proposed = [];
    for (const order of outstandingOrders) {
      if (remaining <= 0) break;
      const owed = Number(order.total) - Number(order.paid_amount || 0);
      const allocated = Math.min(remaining, owed);
      const left = owed - allocated;
      proposed.push({ order, allocated, left });
      remaining -= allocated;
    }
    const rows = proposed.map(({ order, allocated, left }) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #e5e7eb"><span>ORD-${String(order.order_number).padStart(6, '0')}</span><span style="text-align:right"><strong>${fmt(allocated)}</strong><br><small>${left <= 0 ? 'Paid in full' : `${fmt(left)} remaining`}</small></span></div>`).join('');
    const excessRow = excess > 0 ? `<p style="margin:12px 0 0"><strong>Excess ${fmt(excess)}</strong> — ${resolution === 'refund' ? `refund by ${refundMethod}` : 'customer credit'}</p>` : '';
    const confirmation = await Swal.fire({
      title: 'Confirm payment allocation',
      html: `<div style="text-align:left">${rows}${excessRow}</div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Record payment',
      confirmButtonColor: '#0F6E56',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        try {
          return await db.recordCustomerPayment(customer.id, amount, session.id, resolution, refundMethod);
        } catch (error) {
          Swal.showValidationMessage(error.message);
          return false;
        }
      }
    });
    if (!confirmation.isConfirmed) return;
    await loadData();
    if (selectedLedgerCustomer?.id === customer.id) {
      setSelectedLedgerCustomer(current => ({ ...current, balance: Math.max(0, Number(current.balance || 0) - Math.min(amount, outstanding)), credit_balance: Number(current.credit_balance || 0) + (resolution === 'credit' ? excess : 0) }));
      await loadLedger(customer.id);
    }
    showToast(`Payment of ${fmt(amount)} recorded across ${proposed.length} order${proposed.length === 1 ? '' : 's'}.`);
  };

  if (selectedLedgerCustomer) {
    let runningBalance = 0;
    const ledgerRows = ledgerData.map(entry => {
      runningBalance += (entry.debit - entry.credit);
      return { ...entry, runningBalance };
    });

    return (
      <main style={S.main} className="animate-fade-in no-print">
        <button style={S.backBtn} onClick={() => setSelectedLedgerCustomer(null)}>← Back to accounts</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ ...S.sectionHead, margin: 0 }}>Customer Ledger</h2>
          <button style={{ ...S.primaryBtn, margin: 0, padding: "8px 12px", width: "auto" }} onClick={handlePrint}>
            🖨️ Print Statement
          </button>
        </div>

        <div style={S.profileCard} className="print-area">
          <h3 style={S.profileName}>{selectedLedgerCustomer.name}</h3>
          {Number(selectedLedgerCustomer.balance || 0) > 0 && <button className="no-print" style={{ ...S.primaryBtn, margin: '0 0 12px', width: 'auto', padding: '8px 12px' }} onClick={() => handleRecordCustomerPayment(selectedLedgerCustomer)}>Record payment</button>}
          {selectedLedgerCustomer.company && <p style={S.profileDetail}>Company: <strong>{selectedLedgerCustomer.company}</strong></p>}
          <p style={S.profileDetail}>Mobile: <strong>{selectedLedgerCustomer.mobile}</strong></p>
          {Number(selectedLedgerCustomer.credit_balance || 0) > 0 && <p style={{ ...S.profileDetail, color: "var(--color-teal)" }}>Available customer credit: <strong>{fmt(selectedLedgerCustomer.credit_balance)}</strong></p>}
          {selectedLedgerCustomer.email && <p style={S.profileDetail}>Email: <strong>{selectedLedgerCustomer.email}</strong></p>}
          {selectedLedgerCustomer.nic && <p style={S.profileDetail}>NIC: <strong>{selectedLedgerCustomer.nic}</strong></p>}
          {selectedLedgerCustomer.address && <p style={S.profileDetail}>Address: <strong>{selectedLedgerCustomer.address}</strong></p>}
          
          <div style={{ borderTop: "1.5px solid var(--color-border)", marginTop: 16, paddingTop: 16 }}>
            <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Ledger Balance Sheet</h4>
            {loadingLedger ? (
              <p style={S.emptyText}>Loading transaction history...</p>
            ) : ledgerRows.length === 0 ? (
              <p style={S.emptyText}>No orders or payments registered for this customer yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--color-border)", color: "var(--color-ink-soft)" }}>
                      <th style={{ padding: "8px 4px" }}>Date</th>
                      <th style={{ padding: "8px 4px" }}>Ref / Type</th>
                      <th style={{ padding: "8px 4px", textAlign: "right" }}>Debit (+)</th>
                      <th style={{ padding: "8px 4px", textAlign: "right" }}>Credit (-)</th>
                      <th style={{ padding: "8px 4px", textAlign: "right" }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px 4px" }}>{new Date(row.date).toLocaleDateString("en-LK")}</td>
                        <td style={{ padding: "8px 4px" }}>
                          {row.type === 'order' ? (
                            <span 
                              style={{ color: "var(--color-teal)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
                              onClick={() => onOpenOrder(row.rawRecord)}
                            >
                              {row.ref}
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-ink-soft)" }}>{row.ref}</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "right", color: row.debit > 0 ? "var(--color-danger)" : "inherit" }}>
                          {row.debit > 0 ? fmt(row.debit) : "-"}
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "right", color: row.credit > 0 ? "var(--color-teal)" : "inherit" }}>
                          {row.credit > 0 ? fmt(row.credit) : "-"}
                        </td>
                        <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>
                          {fmt(row.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        {/* Print Styles inline */}
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body * {
              visibility: hidden;
            }
            .print-area, .print-area * {
              visibility: visible;
            }
            .print-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              background: transparent !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}} />
      </main>
    );
  }

  return (
    <main style={S.main} className="animate-fade-in">
      <button style={S.backBtn} onClick={onBack}>← Back to home</button>
      <h2 style={S.sectionHead}>Accounts &amp; Ledgers</h2>

      <div style={S.statsGrid}>
        <div style={S.statCard}>
          <div style={S.statLabel}>Total outstanding</div>
          <div style={{ ...S.statValue, color: "var(--color-danger)" }}>{fmt(totalOutstanding)}</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statLabel}>Total collected</div>
          <div style={{ ...S.statValue, color: "var(--color-teal)" }}>{fmt(totalCollected)}</div>
        </div>
      </div>

      <div style={S.toolRow}>
        <input 
          style={S.searchInput} 
          placeholder="Search customer account..." 
          value={custSearch} 
          onChange={e => setCustSearch(e.target.value)} 
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredCusts.map(c => (
          <div key={c.id} style={S.orderCard} onClick={() => setSelectedLedgerCustomer(c)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>{c.name}</span>
              <span style={{ fontWeight: 700, color: Number(c.balance) > 0 ? "var(--color-danger)" : "var(--color-teal)" }}>
                {fmt(c.balance)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 6 }}>
              <span>{c.company || "No company info"}</span>
              <span>{c.mobile}</span>
            </div>
            {Number(c.balance || 0) > 0 && <button style={{ ...S.primaryBtn, width: 'auto', margin: '10px 0 0', padding: '7px 11px' }} onClick={event => { event.stopPropagation(); handleRecordCustomerPayment(c); }}>Record payment</button>}
          </div>
        ))}
        {filteredCusts.length === 0 && <p style={S.emptyText}>No customer accounts match your search.</p>}
      </div>
    </main>
  );
}

function ManageScreen({ session, categories, products, customers, loadData, showToast, setConfirmDialog, fmt, onBack }) {
  const [subTab, setSubTab] = useState("products");

  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthError, setReauthError] = useState("");
  const [reauthSubmitting, setReauthSubmitting] = useState(false);
  
  const [showScanModal, setShowScanModal] = useState(null); // { mode: 'search' | 'form', callback: Function }

  const handleTabClick = (tabKey) => {
    if ((tabKey === "users" || tabKey === "logs") && !isAdminVerified) {
      setPendingTab(tabKey);
      setShowReauthModal(true);
      setReauthPassword("");
      setReauthError("");
    } else {
      setSubTab(tabKey);
    }
  };

  const handleReauthSubmit = async (e) => {
    e.preventDefault();
    if (!reauthPassword) {
      setReauthError("Password cannot be empty.");
      return;
    }
    setReauthSubmitting(true);
    setReauthError("");
    try {
      await db.reverifyPassword(session.email || session.username, reauthPassword);
      setIsAdminVerified(true);
      setShowReauthModal(false);
      setReauthPassword("");
      if (pendingTab) {
        setSubTab(pendingTab);
      }
    } catch (err) {
      setReauthError(err.message || "Re-authentication failed.");
    } finally {
      setReauthSubmitting(false);
    }
  };

  const handleScanSuccess = (decodedText) => {
    if (showScanModal?.mode === "search") {
      setProdSearch(decodedText);
      showToast(`Scanned product barcode: ${decodedText}`);
    } else if (showScanModal?.mode === "form" && showScanModal?.callback) {
      showScanModal.callback(decodedText);
      showToast(`Scanned barcode: ${decodedText}`);
    }
    setShowScanModal(null);
  };

  // Sub-states for overlays
  const [showCatSheet, setShowCatSheet] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  
  const [showProdSheet, setShowProdSheet] = useState(false);
  const [editingProd, setEditingProd] = useState(null);
  const [showRestockSheet, setShowRestockSheet] = useState(false);
  const [restockProd, setRestockProd] = useState(null);

  const [showCustSheet, setShowCustSheet] = useState(false);
  const [editingCust, setEditingCust] = useState(null);

  const [showStaffSheet, setShowStaffSheet] = useState(false);

  // Search filter states
  const [prodSearch, setProdSearch] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [custSearch, setCustSearch] = useState("");

  // Recycle bin state
  const [deletedData, setDeletedData] = useState({ orders: [], categories: [], products: [], customers: [] });
  const [deletedTab, setDeletedTab] = useState("orders");
  const [loadingDeleted, setLoadingDeleted] = useState(false);

  // Users state
  const [staffUsers, setStaffUsers] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadDeleted = useCallback(async () => {
    setLoadingDeleted(true);
    try {
      const data = await db.fetchDeletedRecords();
      setDeletedData(data);
    } catch (err) {
      showToast("Recycle Bin failed: " + err.message);
    } finally {
      setLoadingDeleted(false);
    }
  }, [showToast]);

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const data = await db.fetchStaffUsers();
      setStaffUsers(data);
    } catch (err) {
      showToast("Staff retrieval failed: " + err.message);
    } finally {
      setLoadingStaff(false);
    }
  }, [showToast]);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const data = await db.fetchAuditLogs();
      setAuditLogs(data);
    } catch (err) {
      showToast("Logs retrieval failed: " + err.message);
    } finally {
      setLoadingLogs(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (subTab === "recycle") loadDeleted();
    else if (subTab === "users") loadStaff();
    else if (subTab === "logs") loadLogs();
  }, [subTab, loadDeleted, loadStaff, loadLogs]);

  // Delete Handlers
  const handleDeleteCat = (cat) => {
    setConfirmDialog({
      title: "Delete Category?",
      message: `Are you sure you want to soft-delete the "${cat.name}" category? This does not delete its products, but the category won't display.`,
      onConfirm: async () => {
        try {
          await db.deleteCategory(cat.id, session.id);
          showToast(`Deleted category: ${cat.name}`);
          setConfirmDialog(null);
          await loadData();
        } catch (err) {
          showToast(err.message);
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleDeleteProd = (prod) => {
    setConfirmDialog({
      title: "Delete Product?",
      message: `Are you sure you want to soft-delete the product "${prod.name}"? This removes it from active catalogs.`,
      onConfirm: async () => {
        try {
          await db.deleteProduct(prod.id, session.id);
          showToast(`Deleted product: ${prod.name}`);
          setConfirmDialog(null);
          await loadData();
        } catch (err) {
          showToast(err.message);
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleDeleteCust = (cust) => {
    setConfirmDialog({
      title: "Delete Customer?",
      message: `Are you sure you want to soft-delete customer profile "${cust.name}"?`,
      onConfirm: async () => {
        try {
          await db.deleteCustomer(cust.id, session.id);
          showToast(`Deleted customer profile: ${cust.name}`);
          setConfirmDialog(null);
          await loadData();
        } catch (err) {
          showToast(err.message);
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleRestoreRecord = (type, id, name) => {
    setConfirmDialog({
      title: "Restore Record?",
      message: `Restore the deleted ${type} "${name}"? Database triggers will re-calculate stock values and account ledgers automatically.`,
      onConfirm: async () => {
        try {
          await db.restoreRecord(type, id, session.id);
          showToast(`Restored: ${name}`);
          setConfirmDialog(null);
          await loadDeleted();
          await loadData();
        } catch (err) {
          showToast("Failed to restore: " + err.message);
          setConfirmDialog(null);
        }
      }
    });
  };

  const handlePermanentDelete = (type, id, name) => {
    setConfirmDialog({
      title: "Permanently delete record?",
      message: `Permanently delete ${name}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await db.permanentDeleteRecord(type, id, session.id);
          setConfirmDialog(null);
          await loadDeleted();
          await loadData();
          showToast(`Permanently deleted: ${name}`);
        } catch (err) {
          setConfirmDialog(null);
          showToast(err.message);
        }
      }
    });
  };

  // Filtering lists
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.barcode && p.barcode.includes(prodSearch))
  );

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(catSearch.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(catSearch.toLowerCase()))
  );

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(custSearch.toLowerCase())) ||
    c.mobile.includes(custSearch)
  );

  // Tab rendering
  const manageTabs = [
    { key: "products", label: "Products" },
    { key: "bulk_stock", label: "Bulk Stock" },
    { key: "stock_entry", label: "Stock Entry" },
    { key: "categories", label: "Categories" },
    { key: "customers", label: "Customers" },
    { key: "suppliers", label: "Suppliers" },
    { key: "purchase_orders", label: "Purchase Orders" },
    { key: "recycle", label: "Recycle Bin" },
  ];
  if (session.role === 'superadmin') {
    manageTabs.push({ key: "users", label: "Staff Users" });
    manageTabs.push({ key: "logs", label: "Audit Logs" });
  }

  return (
    <main style={S.main} className="animate-fade-in">
      <button style={S.backBtn} onClick={onBack}>← Back to home</button>
      <h2 style={S.sectionHead}>Management Console</h2>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 18, scrollbarWidth: "none" }}>
        {manageTabs.map(t => (
          <button 
            key={t.key} 
            style={{ 
              ...S.pillFilter, 
              ...(subTab === t.key ? S.pillFilterActive : {}) 
            }} 
            onClick={() => handleTabClick(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* PRODUCTS TAB */}
      {subTab === "products" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button" style={{ ...S.ghostBtn, margin: 0, width: "auto" }} onClick={() => handleTabClick("bulk_stock")}>Bulk stock update</button>
            <button type="button" style={{ ...S.ghostBtn, margin: 0, width: "auto" }} onClick={() => handleTabClick("stock_entry")}>Stock entry</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input 
              style={S.searchInput} 
              placeholder="Search product (name, SKU, barcode)..." 
              value={prodSearch} 
              onChange={e => setProdSearch(e.target.value)} 
            />
            <button 
              style={{ ...S.ghostBtn, margin: 0, width: "auto", padding: "10px 14px", border: `1.5px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setShowScanModal({ mode: "search" })}
              title="Scan barcode to search"
            >
              📷 Scan
            </button>
            <button 
              style={{ ...S.primaryBtn, margin: 0, width: "auto", flexShrink: 0 }}
              onClick={() => { setEditingProd(null); setShowProdSheet(true); }}
            >
              ➕ Add Product
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredProducts.map(p => {
              const cat = categories.find(c => c.id === p.category_id);
              return (
                <div key={p.id} style={{ ...S.orderCard, cursor: "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h4 style={{ fontSize: 14.5, fontWeight: 700, color: "var(--color-ink)" }}>{p.name}</h4>
                      <p style={{ fontSize: 11.5, color: "var(--color-ink-soft)", marginTop: 2 }}>
                        SKU: {p.sku} {p.barcode && `· Barcode: ${p.barcode}`} · Cat: {cat ? cat.name : 'Unknown'}
                      </p>
                    </div>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--color-teal)" }}>
                      {fmt(p.selling_price)}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: p.stock <= 10 ? "var(--color-danger)" : "var(--color-ink-soft)" }}>
                      Stock: {p.stock}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button 
                        style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, border: "1px solid var(--color-teal)", color: "var(--color-teal)" }}
                        onClick={() => { setRestockProd(p); setShowRestockSheet(true); }}
                      >
                        ➕ Adjust Stock
                      </button>
                      <button 
                        style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12 }}
                        onClick={() => { setEditingProd(p); setShowProdSheet(true); }}
                      >
                        ✏️ Edit
                      </button>
                      <button 
                        style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, color: "var(--color-danger)", borderColor: "rgba(153, 60, 29, 0.2)" }}
                        onClick={() => handleDeleteProd(p)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && <p style={S.emptyText}>No products found.</p>}
          </div>
        </>
      )}

      {subTab === "bulk_stock" && <BulkStockScreen products={products} categories={categories} session={session} loadData={loadData} showToast={showToast} setConfirmDialog={setConfirmDialog} onBack={() => setSubTab("products")} />}
      {subTab === "stock_entry" && <StockEntryScreen products={products} session={session} loadData={loadData} showToast={showToast} onBack={() => setSubTab("products")} onScan={() => setShowScanModal({ mode: "form", callback: barcode => window.dispatchEvent(new CustomEvent('stock-entry-scan', { detail: barcode })) })} />}
      {subTab === "suppliers" && <SuppliersScreen session={session} showToast={showToast} />}
      {subTab === "purchase_orders" && <PurchaseOrdersScreen products={products} session={session} loadData={loadData} showToast={showToast} />}

      {/* CATEGORIES TAB */}
      {subTab === "categories" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <input 
              style={S.searchInput} 
              placeholder="Search category..." 
              value={catSearch} 
              onChange={e => setCatSearch(e.target.value)} 
            />
            <button 
              style={{ ...S.primaryBtn, margin: 0, width: "auto", flexShrink: 0 }}
              onClick={() => { setEditingCat(null); setShowCatSheet(true); }}
            >
              ➕ Add Category
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredCategories.map(cat => (
              <div key={cat.id} style={{ ...S.orderCard, cursor: "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h4 style={{ fontSize: 14.5, fontWeight: 700 }}>{cat.name}</h4>
                    <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 4 }}>{cat.description}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button 
                      style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12 }}
                      onClick={() => { setEditingCat(cat); setShowCatSheet(true); }}
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, color: "var(--color-danger)", borderColor: "rgba(153, 60, 29, 0.2)" }}
                      onClick={() => handleDeleteCat(cat)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filteredCategories.length === 0 && <p style={S.emptyText}>No categories found.</p>}
          </div>
        </>
      )}

      {/* CUSTOMERS TAB */}
      {subTab === "customers" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <input 
              style={S.searchInput} 
              placeholder="Search customer name, company, or mobile..." 
              value={custSearch} 
              onChange={e => setCustSearch(e.target.value)} 
            />
            <button 
              style={{ ...S.primaryBtn, margin: 0, width: "auto", flexShrink: 0 }}
              onClick={() => { setEditingCust(null); setShowCustSheet(true); }}
            >
              ➕ Add Customer
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredCustomers.map(cust => (
              <div key={cust.id} style={{ ...S.orderCard, cursor: "default" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <h4 style={{ fontSize: 14.5, fontWeight: 700 }}>{cust.name} {cust.company && `· ${cust.company}`}</h4>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-teal)" }}>Outstanding: {fmt(cust.balance)}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-ink-soft)", marginTop: 4 }}>
                    📞 {cust.mobile} {cust.email && `· ✉️ ${cust.email}`} {cust.nic && `· 🪪 NIC: ${cust.nic}`}
                  </p>
                  {cust.address && <p style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>📍 {cust.address}</p>}
                  {cust.notes && <p style={{ fontSize: 11.5, fontStyle: "italic", marginTop: 4, color: "var(--color-ink-soft)" }}>Notes: {cust.notes}</p>}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
                  <button 
                    style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12 }}
                    onClick={() => { setEditingCust(cust); setShowCustSheet(true); }}
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, color: "var(--color-danger)", borderColor: "rgba(153, 60, 29, 0.2)" }}
                    onClick={() => handleDeleteCust(cust)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
            {filteredCustomers.length === 0 && <p style={S.emptyText}>No customers found.</p>}
          </div>
        </>
      )}

      {/* RECYCLE BIN */}
      {subTab === "recycle" && (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 16, scrollbarWidth: "none" }}>
            {["orders", "products", "categories", "customers"].map(t => (
              <button 
                key={t}
                style={{
                  ...S.pillFilter,
                  fontSize: 11.5,
                  padding: "4px 10px",
                  ...(deletedTab === t ? S.pillFilterActive : {})
                }}
                onClick={() => setDeletedTab(t)}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {loadingDeleted ? (
            <p style={S.emptyText}>Loading soft-deleted records...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deletedTab === "orders" && (deletedData.orders || []).map(o => (
                <div key={o.id} style={{ ...S.orderCard, cursor: "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={S.orderNumber}>ORD-{String(o.order_number).padStart(6, "0")}</span>
                    <button 
                      style={{ ...S.primaryBtn, margin: 0, padding: "5px 10px", fontSize: 12, width: "auto" }}
                      onClick={() => handleRestoreRecord("order", o.id, `ORD-${String(o.order_number).padStart(6, "0")}`)}
                    >
                      ↩️ Restore Order
                    </button>
                    {session.role === "superadmin" && <button style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, color: "var(--color-danger)" }} onClick={() => handlePermanentDelete("order", o.id, `ORD-${String(o.order_number).padStart(6, "0")}`)}>Delete forever</button>}
                  </div>
                  <div style={S.orderCust}>{o.customerName}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-ink-soft)", marginTop: 6 }}>
                    <span>Deleted on: {o.deleted_at ? new Date(o.deleted_at).toLocaleDateString("en-LK") : 'N/A'}</span>
                    <strong>{fmt(o.total)}</strong>
                  </div>
                </div>
              ))}

              {deletedTab === "products" && (deletedData.products || []).map(p => (
                <div key={p.id} style={{ ...S.orderCard, cursor: "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</h4>
                      <span style={{ fontSize: 11, color: "var(--color-ink-soft)" }}>SKU: {p.sku}</span>
                    </div>
                    <button 
                      style={{ ...S.primaryBtn, margin: 0, padding: "5px 10px", fontSize: 12, width: "auto" }}
                      onClick={() => handleRestoreRecord("product", p.id, p.name)}
                    >
                      ↩️ Restore Product
                    </button>
                    {session.role === "superadmin" && <button style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, color: "var(--color-danger)" }} onClick={() => handlePermanentDelete("product", p.id, p.name)}>Delete forever</button>}
                  </div>
                </div>
              ))}

              {deletedTab === "categories" && (deletedData.categories || []).map(c => (
                <div key={c.id} style={{ ...S.orderCard, cursor: "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</h4>
                    </div>
                    <button 
                      style={{ ...S.primaryBtn, margin: 0, padding: "5px 10px", fontSize: 12, width: "auto" }}
                      onClick={() => handleRestoreRecord("category", c.id, c.name)}
                    >
                      ↩️ Restore Category
                    </button>
                    {session.role === "superadmin" && <button style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, color: "var(--color-danger)" }} onClick={() => handlePermanentDelete("category", c.id, c.name)}>Delete forever</button>}
                  </div>
                </div>
              ))}

              {deletedTab === "customers" && (deletedData.customers || []).map(c => (
                <div key={c.id} style={{ ...S.orderCard, cursor: "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700 }}>{c.name} {c.company && `(${c.company})`}</h4>
                      <span style={{ fontSize: 11, color: "var(--color-ink-soft)" }}>📞 {c.mobile}</span>
                    </div>
                    <button 
                      style={{ ...S.primaryBtn, margin: 0, padding: "5px 10px", fontSize: 12, width: "auto" }}
                      onClick={() => handleRestoreRecord("customer", c.id, c.name)}
                    >
                      ↩️ Restore Customer
                    </button>
                    {session.role === "superadmin" && <button style={{ ...S.ghostBtn, margin: 0, padding: "5px 10px", fontSize: 12, color: "var(--color-danger)" }} onClick={() => handlePermanentDelete("customer", c.id, c.name)}>Delete forever</button>}
                  </div>
                </div>
              ))}

              {deletedData[deletedTab]?.length === 0 && <p style={S.emptyText}>No deleted records in this category.</p>}
            </div>
          )}
        </>
      )}

      {/* STAFF USERS TAB */}
      {subTab === "users" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button 
              style={{ ...S.primaryBtn, margin: 0, width: "auto" }}
              onClick={() => setShowStaffSheet(true)}
            >
              ➕ Register New Staff
            </button>
          </div>

          {loadingStaff ? (
            <p style={S.emptyText}>Loading staff profiles...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {staffUsers.map(u => (
                <div key={u.id} style={{ ...S.orderCard, cursor: "default" }}>
                  <h4 style={{ fontSize: 14.5, fontWeight: 700 }}>{u.name || "Unnamed User"}</h4>
                  <p style={{ fontSize: 12, color: "var(--color-ink-soft)", marginTop: 2 }}>
                    Role: <strong>{u.role === 'superadmin' ? 'Super Admin' : 'Staff'}</strong> · Email: {u.email || 'N/A'} · Mobile: {u.mobile || 'N/A'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* AUDIT LOGS TAB */}
      {subTab === "logs" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-soft)" }}>Recorded Actions</span>
            <button style={{ ...S.linkBtn, color: "var(--color-teal)", fontWeight: 600 }} onClick={loadLogs}>🔄 Refresh Logs</button>
          </div>

          {loadingLogs ? (
            <p style={S.emptyText}>Loading logs...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
              {auditLogs.map(l => (
                <div key={l.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 8, fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-ink-soft)", fontSize: 11 }}>
                    <span>{new Date(l.created_at).toLocaleString("en-LK")}</span>
                    <strong>{l.userName}</strong>
                  </div>
                  <div style={{ marginTop: 2, color: "var(--color-ink)", fontWeight: 500 }}>
                    {l.action}
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && <p style={S.emptyText}>No activity logged in the workspace yet.</p>}
            </div>
          )}
        </>
      )}

      {/* RESTOCK SHEET */}
      {showRestockSheet && restockProd && (
        <RestockProductSheet 
          product={restockProd}
          session={session}
          onClose={() => { setRestockProd(null); setShowRestockSheet(false); }}
          onSaved={async () => {
            setRestockProd(null);
            setShowRestockSheet(false);
            await loadData();
          }}
          showToast={showToast}
        />
      )}

      {/* CATEGORY SHEET */}
      {showCatSheet && (
        <CategoryFormSheet 
          category={editingCat}
          session={session}
          onClose={() => { setEditingCat(null); setShowCatSheet(false); }}
          onSaved={async () => {
            setEditingCat(null);
            setShowCatSheet(false);
            await loadData();
          }}
          showToast={showToast}
        />
      )}

      {/* PRODUCT SHEET */}
      {showProdSheet && (
        <ProductFormSheet 
          product={editingProd}
          categories={categories}
          session={session}
          onClose={() => { setEditingProd(null); setShowProdSheet(false); }}
          onSaved={async () => {
            setEditingProd(null);
            setShowProdSheet(false);
            await loadData();
          }}
          showToast={showToast}
          onTriggerScan={(callback) => setShowScanModal({ mode: "form", callback })}
        />
      )}

      {/* CUSTOMER SHEET */}
      {showCustSheet && (
        <CustomerFormSheet 
          customer={editingCust}
          session={session}
          onClose={() => { setEditingCust(null); setShowCustSheet(false); }}
          onSaved={async () => {
            setEditingCust(null);
            setShowCustSheet(false);
            await loadData();
          }}
          showToast={showToast}
        />
      )}

      {/* STAFF REGISTRATION SHEET */}
      {showStaffSheet && (
        <StaffFormSheet 
          session={session}
          onClose={() => setShowStaffSheet(false)}
          onSaved={async () => {
            setShowStaffSheet(false);
            await loadStaff();
            await loadLogs();
          }}
          showToast={showToast}
        />
      )}

      {showReauthModal && (
        <div style={S.sheetOverlay} onClick={() => { setShowReauthModal(false); setPendingTab(null); }} className="animate-fade-in">
          <div style={S.sheet} onClick={e => e.stopPropagation()} className="animate-slide-up">
            <div style={S.sheetHandle} />
            <h3 style={S.sheetTitle}>Superadmin Verification</h3>
            <p style={S.sheetDesc}>
              Please verify your password to access staff settings and audit logs.
            </p>
            <form onSubmit={handleReauthSubmit} style={{ width: "100%", marginTop: 12 }}>
              <label style={S.label}>Enter Admin Password</label>
              <input 
                style={S.input} 
                type="password" 
                value={reauthPassword} 
                onChange={e => setReauthPassword(e.target.value)} 
                placeholder="••••••••" 
                autoFocus 
              />
              {reauthError && <p style={S.errorText}>{reauthError}</p>}
              <button type="submit" style={S.primaryBtn} disabled={reauthSubmitting}>
                {reauthSubmitting ? "Verifying..." : "Verify & Continue"}
              </button>
              <button type="button" style={S.ghostBtn} onClick={() => { setShowReauthModal(false); setPendingTab(null); }}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {showScanModal && (
        <BarcodeScannerModal 
          onClose={() => setShowScanModal(null)} 
          onScanSuccess={handleScanSuccess} 
        />
      )}
    </main>
  );
}

function BulkStockScreen({ products, categories = [], session, loadData, showToast, setConfirmDialog, onBack }) {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [values, setValues] = useState({});
  const [costs, setCosts] = useState(() => Object.fromEntries(products.map(product => [product.id, product.cost_price])));
  
  const filtered = products.filter(p => {
    const matchesCategory = !selectedCategoryId || p.category_id === selectedCategoryId;
    const matchesSearch = `${p.name} ${p.sku} ${p.barcode || ''}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const changes = products
    .filter(p => values[p.id] !== undefined && values[p.id] !== '' && Number(values[p.id]) !== 0)
    .map(p => ({ id: p.id, name: p.name, currentStock: Number(p.stock), quantityAdded: Number(values[p.id]), costPrice: Number(costs[p.id]), resultingStock: Number(p.stock) + Number(values[p.id]) }));

  const save = () => {
    if (changes.some(x => !Number.isInteger(x.quantityAdded) || x.quantityAdded <= 0 || !Number.isFinite(x.costPrice) || x.costPrice < 0)) return showToast('Enter positive whole quantities and a valid batch cost.');
    const summary = changes.map(x => `${x.name}: ${x.currentStock} → +${x.quantityAdded} @ ${x.costPrice} → ${x.resultingStock}`).join('\n');
    setConfirmDialog({ title: 'Add bulk stock?', message: `${changes.length} product${changes.length === 1 ? '' : 's'} will be updated:\n\n${summary}`, onConfirm: async () => { try { await db.bulkUpdateStock(changes, session.id); setConfirmDialog(null); await loadData(); showToast(`Stock added to ${changes.length} product${changes.length === 1 ? '' : 's'}.`); onBack(); } catch (err) { setConfirmDialog(null); showToast(err.message); } } });
  };

  return <section>
    <button style={S.backBtn} onClick={onBack}>← Products</button><h3 style={S.sectionHead}>Bulk stock update</h3>
    <p style={{ ...S.profileDetail, marginBottom: 12 }}>Each quantity creates a new FIFO batch at the entered cost; existing batches are not overwritten or averaged.</p>
    
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 12, scrollbarWidth: "none" }}>
      <button
        type="button"
        style={{ ...S.pillFilter, ...(!selectedCategoryId ? S.pillFilterActive : {}), flexShrink: 0 }}
        onClick={() => setSelectedCategoryId("")}
      >
        All Categories
      </button>
      {categories.map(category => (
        <button
          type="button"
          key={category.id}
          style={{ ...S.pillFilter, ...(selectedCategoryId === category.id ? S.pillFilterActive : {}), flexShrink: 0 }}
          onClick={() => setSelectedCategoryId(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>

    <input style={S.searchInput} placeholder="Search name, SKU, or barcode" value={search} onChange={e => setSearch(e.target.value)} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {filtered.map(p => <div key={p.id} style={{ ...S.orderCard, cursor: 'default', display: 'grid', gridTemplateColumns: '1fr 150px 150px', alignItems: 'center', gap: 12 }}><div><strong>{p.name}</strong><div style={S.profileDetail}>{p.sku} · Current stock: <strong>{p.stock}</strong>{Number(values[p.id]) > 0 ? ` · Result: ${Number(p.stock) + Number(values[p.id])}` : ''}</div></div><div><label style={S.label}>Quantity to add</label><input aria-label={`Quantity to add for ${p.name}`} placeholder="0" style={{ ...S.input, margin: 0 }} type="number" min="0" step="1" value={values[p.id] ?? ''} onChange={e => setValues(v => ({ ...v, [p.id]: e.target.value }))} /></div><div><label style={S.label}>New batch cost</label><input aria-label={`Batch cost for ${p.name}`} style={{ ...S.input, margin: 0 }} type="number" min="0" step="0.01" value={costs[p.id] ?? ''} onChange={e => setCosts(v => ({ ...v, [p.id]: e.target.value }))} /></div></div>)}
      {filtered.length === 0 && <p style={S.emptyText}>No products match the criteria.</p>}
    </div>
    <button style={{ ...S.primaryBtn, marginTop: 16 }} disabled={!changes.length} onClick={save}>Save all changes ({changes.length})</button>
  </section>;
}

function ProductLineBuilder({ products, lines, setLines, mode, onScan }) {
  const [productId, setProductId] = useState(''); const [quantity, setQuantity] = useState(''); const [cost, setCost] = useState('');
  useEffect(() => { const handler = e => { const p = products.find(x => x.barcode === e.detail); if (p) setProductId(p.id); }; window.addEventListener('stock-entry-scan', handler); return () => window.removeEventListener('stock-entry-scan', handler); }, [products]);
  const add = () => { const qty = Number(quantity); if (!productId || !Number.isInteger(qty) || qty <= 0 || lines.some(x => x.product_id === productId)) return; const p = products.find(x => x.id === productId); const effectiveCost = Number(cost === '' ? p.cost_price || 0 : cost); setLines([...lines, { id: `${productId}-${Date.now()}`, product_id: productId, name: p.name, ...(mode === 'po' ? { quantity_ordered: qty, unit_cost: effectiveCost } : { quantity: qty, cost_price: effectiveCost }) }]); setProductId(''); setQuantity(''); setCost(''); };
  return <><div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) 110px 130px auto', gap: 8, alignItems: 'end' }}><div><label style={S.label}>Product</label><select style={S.input} value={productId} onChange={e => setProductId(e.target.value)}><option value="">Search/select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></div><div><label style={S.label}>{mode === 'po' ? 'Ordered' : 'Received'}</label><input style={S.input} type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></div><div><label style={S.label}>Cost price</label><input style={S.input} type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} /></div><div style={{ display:'flex', gap:5 }}><button style={{ ...S.primaryBtn, margin: 0 }} onClick={add}>Add</button>{onScan && <button style={{ ...S.ghostBtn, margin:0 }} onClick={onScan}>📷</button>}</div></div><div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:12 }}>{lines.map(line => <div key={line.id} style={{ ...S.orderCard, cursor:'default', display:'flex', justifyContent:'space-between' }}><span><strong>{line.name}</strong> · Qty {line.quantity ?? line.quantity_ordered} · Cost {line.cost_price || line.unit_cost || 'unchanged'}</span><button style={{ color:'var(--color-danger)' }} onClick={() => setLines(lines.filter(x => x.id !== line.id))}>Remove</button></div>)}</div></>;
}

function StockEntryScreen({ products, session, loadData, showToast, onBack, onScan }) {
  const [lines, setLines] = useState([]); const [entries, setEntries] = useState([]); const [loadingEntries, setLoadingEntries] = useState(true); const [loadError, setLoadError] = useState(''); const [selectedEntry, setSelectedEntry] = useState(null); const [suppliers, setSuppliers] = useState([]); const [supplierSearch, setSupplierSearch] = useState(''); const [supplierId, setSupplierId] = useState('');
  const load = useCallback(async () => { setLoadingEntries(true); setLoadError(''); try { const data = await db.fetchStockEntries(); setEntries(Array.isArray(data) ? data : []); } catch (e) { setLoadError(e.message || 'Could not load past stock entries.'); showToast(e.message); } finally { setLoadingEntries(false); } }, [showToast]); useEffect(() => { load(); }, [load]);
  useEffect(() => { db.fetchSuppliers().then(setSuppliers).catch(e => showToast(e.message)); }, [showToast]);
  const submit = async () => { const result = await Swal.fire({ title:'Save stock entry?', text:`Add ${lines.reduce((sum,line)=>sum+Number(line.quantity||0),0)} units across ${lines.length} product line(s)?`, icon:'question', showCancelButton:true, confirmButtonColor:'#0F6E56', showLoaderOnConfirm:true, preConfirm:()=>db.createStockEntry(lines,session,supplierId||null), allowOutsideClick:()=>!Swal.isLoading() }); if (!result.isConfirmed) return; try { const entry=result.value; setLines([]); setSupplierId(''); setSupplierSearch(''); await loadData(); await load(); showToast(`STK-${String(entry.reference_number).padStart(6,'0')} saved.`); } catch (e) { showToast(e.message); } };
  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
  return <section style={{ minHeight: 320 }}><button type="button" style={S.backBtn} onClick={onBack}>← Products</button><h3 style={S.sectionHead}>Stock entry</h3><p style={{ ...S.profileDetail, marginBottom: 14 }}>Record a delivery containing one or more products. Quantities are added to existing stock.</p><div style={S.profileCard}><label style={S.label}>Supplier (optional)</label><input style={S.input} placeholder="Search suppliers" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} /><select style={S.input} value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">No supplier</option>{filteredSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{products.length ? <ProductLineBuilder products={products} lines={lines} setLines={setLines} mode="stock" onScan={onScan} /> : <p style={S.emptyText}>No products are available. Create a product first.</p>}<button type="button" style={S.primaryBtn} disabled={!lines.length} onClick={submit}>Submit stock entry</button></div><h3 style={{ ...S.sectionHead, marginTop:20 }}>Past entries</h3>{loadingEntries && <p style={S.emptyText}>Loading stock entries…</p>}{loadError && <div style={{ color:'var(--color-danger)', background:'var(--color-danger-bg)', padding:12, borderRadius:10 }}>{loadError}</div>}{!loadingEntries && !loadError && entries.length === 0 && <p style={S.emptyText}>No stock entries have been recorded yet.</p>}{entries.map(entry => <button key={entry.id} type="button" style={{ ...S.orderCard, display:'block', width:'100%', textAlign:'left', marginBottom:8 }} onClick={() => setSelectedEntry(entry)}><strong>STK-{String(entry.reference_number).padStart(6,'0')}</strong><div style={S.profileDetail}>{new Date(entry.created_at).toLocaleString('en-LK')} · {entry.items?.length || 0} items · {entry.created_by_name || 'User'}{entry.supplier_name ? ` · ${entry.supplier_name}` : ''}</div></button>)}{selectedEntry && <div style={S.sheetOverlay} onClick={() => setSelectedEntry(null)}><div style={{ ...S.sheet, maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}><div style={S.sheetHandle}/><h3 style={S.sheetTitle}>STK-{String(selectedEntry.reference_number).padStart(6,'0')}</h3><p style={S.profileDetail}>Date: {new Date(selectedEntry.created_at).toLocaleString('en-LK')}</p><p style={S.profileDetail}>Created by: {selectedEntry.created_by_name || 'User'}</p><p style={S.profileDetail}>Supplier: {selectedEntry.supplier_name || 'Not specified'}</p><h4 style={{ margin:'16px 0 8px' }}>Line items</h4>{(selectedEntry.items || []).map(item => <div key={item.id} style={{ ...S.orderCard, cursor:'default', marginBottom:8 }}><strong>{item.name || item.product?.name || 'Unknown product'}</strong><div style={S.profileDetail}>Quantity received: {item.quantity} · Cost price: {item.cost_price == null || item.cost_price === '' ? 'Not updated' : item.cost_price}</div></div>)}<button style={S.ghostBtn} onClick={() => setSelectedEntry(null)}>Close</button></div></div>}</section>;
}

function SuppliersScreen({ session, showToast }) {
  const empty = { name:'', contact_person:'', mobile:'', email:'', address:'', notes:'' };
  const [suppliers,setSuppliers]=useState([]); const [search,setSearch]=useState(''); const [form,setForm]=useState(empty); const [editing,setEditing]=useState(false); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [saving,setSaving]=useState(false);
  const load=useCallback(async()=>{setLoading(true);setError('');try{setSuppliers(await db.fetchSuppliers());}catch(e){setError(e.message);showToast(e.message);}finally{setLoading(false);}},[showToast]); useEffect(()=>{load();},[load]);
  const save=async e=>{e.preventDefault();setSaving(true);try{const saved=await db.saveSupplier(form,session.id);setForm(empty);setEditing(false);await load();showToast(`Supplier saved: ${saved.name}`);}catch(err){setError(err.message);showToast(err.message);}finally{setSaving(false);}};
  const filtered=suppliers.filter(x=>`${x.name} ${x.contact_person||''} ${x.mobile||''} ${x.email||''}`.toLowerCase().includes(search.toLowerCase()));
  return <section><div style={S.sectionHeadRow}><h3 style={S.sectionHead}>Suppliers</h3><button type="button" style={{...S.primaryBtn,margin:0,width:'auto'}} onClick={()=>{setForm(empty);setEditing(true)}}>Add supplier</button></div><input style={S.searchInput} placeholder="Search name, contact, mobile, or email" value={search} onChange={e=>setSearch(e.target.value)}/>{loading&&<p style={S.emptyText}>Loading suppliers…</p>}{error&&<div style={{color:'var(--color-danger)',background:'var(--color-danger-bg)',padding:12,borderRadius:10,marginTop:10}}>{error}<button type="button" style={{...S.linkBtn,marginLeft:8}} onClick={load}>Retry</button></div>}{!loading&&!error&&filtered.length===0&&<p style={S.emptyText}>No suppliers found.</p>}{filtered.map(supplier=><div key={supplier.id} style={{...S.orderCard,cursor:'default',marginTop:8,display:'flex',justifyContent:'space-between',gap:12}}><div><strong>{supplier.name}</strong><div style={S.profileDetail}>Contact: {supplier.contact_person||'Not specified'} · Mobile: {supplier.mobile||'Not specified'}</div>{supplier.email&&<div style={S.profileDetail}>Email: {supplier.email}</div>}{supplier.address&&<div style={S.profileDetail}>Address: {supplier.address}</div>}{supplier.notes&&<div style={S.profileDetail}>Notes: {supplier.notes}</div>}</div><button type="button" style={{...S.ghostBtn,width:'auto',margin:0}} onClick={()=>{setForm({...empty,...supplier});setEditing(true)}}>Edit</button></div>)}{editing&&<div style={S.sheetOverlay} onClick={()=>setEditing(false)}><form style={{...S.sheet,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()} onSubmit={save}><div style={S.sheetHandle}/><h3 style={S.sheetTitle}>{form.id?'Edit':'Add'} supplier</h3>{[['name','Name'],['contact_person','Contact person'],['mobile','Mobile'],['email','Email'],['address','Address'],['notes','Notes']].map(([key,label])=><div key={key}><label style={S.label}>{label}</label>{key==='notes'?<textarea style={S.input} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>:<input style={S.input} type={key==='email'?'email':'text'} required={key==='name'} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</div>)}<button style={S.primaryBtn} disabled={saving}>{saving?'Saving…':'Save supplier'}</button><button type="button" style={S.ghostBtn} onClick={()=>setEditing(false)}>Cancel</button></form></div>}</section>;
}

function PurchaseOrdersScreen({ products, session, loadData, showToast }) {
  const [suppliers,setSuppliers]=useState([]),[orders,setOrders]=useState([]),[showCreate,setShowCreate]=useState(false),[supplierId,setSupplierId]=useState(''),[lines,setLines]=useState([]),[status,setStatus]=useState('draft'),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[receiving,setReceiving]=useState(null),[receipts,setReceipts]=useState({});
  const load=useCallback(async()=>{try{setSuppliers(await db.fetchSuppliers());setOrders(await db.fetchPurchaseOrders());}catch(e){showToast(e.message)}},[showToast]);useEffect(()=>{load()},[load]);
  const create=async()=>{try{await db.createPurchaseOrder(supplierId,status,lines,session);setShowCreate(false);setLines([]);setSupplierId('');await load();showToast('Purchase order saved.')}catch(e){showToast(e.message)}};
  const receive=async()=>{try{if(!Object.values(receipts).some(x=>Number(x)>0))throw new Error('Enter at least one received quantity.');const result=await Swal.fire({title:'Receive purchase order stock?',text:`Confirm ${Object.values(receipts).reduce((sum,value)=>sum+Number(value||0),0)} received units.`,icon:'question',showCancelButton:true,confirmButtonColor:'#0F6E56',showLoaderOnConfirm:true,preConfirm:()=>db.receivePurchaseOrder(receiving.id,receipts,session.id),allowOutsideClick:()=>!Swal.isLoading()});if(!result.isConfirmed)return;setReceiving(null);setReceipts({});await load();await loadData();showToast('Purchase order receipt saved.')}catch(e){showToast(e.message)}};
  const shown=orders.filter(po=>(filter==='all'||po.status===filter)&&`${po.po_number} ${po.supplier_name||suppliers.find(s=>s.id===po.supplier_id)?.name||''}`.toLowerCase().includes(search.toLowerCase()));
  return <section><div style={S.sectionHeadRow}><h3 style={S.sectionHead}>Purchase orders</h3><button style={{...S.primaryBtn,margin:0,width:'auto'}} onClick={()=>setShowCreate(true)}>Create PO</button></div><div style={S.toolRow}><input style={S.searchInput} placeholder="Search PO or supplier" value={search} onChange={e=>setSearch(e.target.value)}/><select style={S.sortSelect} value={filter} onChange={e=>setFilter(e.target.value)}>{['all','draft','ordered','partial','received'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>{shown.map(po=><div key={po.id} style={{...S.orderCard,cursor:'default',marginTop:8,display:'flex',justifyContent:'space-between'}}><div><strong>PO-{String(po.po_number).padStart(6,'0')}</strong><div style={S.profileDetail}>{po.supplier_name||suppliers.find(s=>s.id===po.supplier_id)?.name} · {po.status} · {po.items?.length||0} items</div></div>{po.status!=='received'&&po.status!=='draft'&&<button style={S.primaryBtn} onClick={()=>setReceiving(po)}>Receive</button>}</div>)}
  {showCreate&&<div style={S.sheetOverlay}><div style={{...S.sheet,maxHeight:'90vh',overflowY:'auto'}}><h3 style={S.sheetTitle}>Create purchase order</h3><label style={S.label}>Supplier</label><select style={S.input} value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ProductLineBuilder products={products} lines={lines} setLines={setLines} mode="po"/><select style={S.input} value={status} onChange={e=>setStatus(e.target.value)}><option value="draft">Save as draft</option><option value="ordered">Mark as ordered</option></select><button style={S.primaryBtn} disabled={!supplierId||!lines.length} onClick={create}>Save purchase order</button><button style={S.ghostBtn} onClick={()=>setShowCreate(false)}>Cancel</button></div></div>}
  {receiving&&<div style={S.sheetOverlay}><div style={S.sheet}><h3 style={S.sheetTitle}>Receive PO-{String(receiving.po_number).padStart(6,'0')}</h3>{receiving.items.map(line=>{const remaining=Number(line.quantity_ordered)-Number(line.quantity_received);return <div key={line.id} style={{marginBottom:10}}><label style={S.label}>{line.product?.name||products.find(p=>p.id===line.product_id)?.name} · remaining {remaining} · batch cost {line.unit_cost}</label><input style={S.input} type="number" min="0" max={remaining} value={receipts[line.id]||''} onChange={e=>setReceipts({...receipts,[line.id]:e.target.value})}/></div>})}<button style={S.primaryBtn} onClick={receive}>Save receipt</button><button style={S.ghostBtn} onClick={()=>setReceiving(null)}>Cancel</button></div></div>}</section>;
}

function CategoryFormSheet({ category, session, onClose, onSaved, showToast }) {
  const [name, setName] = useState(category ? category.name : "");
  const [description, setDescription] = useState(category ? category.description : "");
  const [imageUrl, setImageUrl] = useState(category ? category.image_url : "");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      let compressedFile = file;
      if (isMock) {
        compressedFile = await new Promise((resolve) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxDim = 120;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              resolve(new File([blob], file.name, { type: "image/jpeg" }));
            }, "image/jpeg", 0.7);
          };
        });
      }
      const url = await db.uploadImage(compressedFile);
      setImageUrl(url);
      showToast("Category image uploaded successfully.");
    } catch (err) {
      showToast("Image upload failed: " + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name) {
      showToast("Category name cannot be empty.");
      return;
    }
    setSubmitting(true);
    try {
      if (category) {
        await db.updateCategory(category.id, name, description, imageUrl, session.id);
        showToast("Category updated successfully.");
      } else {
        await db.createCategory(name, description, imageUrl, session.id);
        showToast("Category created successfully.");
      }
      onSaved();
    } catch (err) {
      showToast("Failed to save: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.sheetOverlay} onClick={onClose} className="animate-fade-in">
      <div style={S.sheet} onClick={e => e.stopPropagation()} className="animate-slide-up">
        <div style={S.sheetHandle} />
        <h3 style={S.sheetTitle}>{category ? "Edit Category" : "Add New Category"}</h3>
        <form onSubmit={handleSubmit} style={{ width: "100%", marginTop: 10 }}>
          <label style={S.label}>Category Name</label>
          <input 
            style={S.input} 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="e.g. Confectionery" 
            autoFocus 
          />

          <label style={S.label}>Description</label>
          <textarea 
            style={{ ...S.input, minHeight: 70, resize: "none" }} 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Describe the items in this category" 
          />

          <label style={S.label}>Category Image</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageFileChange} 
                style={{ fontSize: 13, flex: 1 }} 
                disabled={uploadingImage}
              />
              {uploadingImage && <span style={{ fontSize: 12, color: "var(--color-teal)" }}>Uploading...</span>}
            </div>
            <input 
              style={S.input} 
              value={imageUrl} 
              onChange={e => setImageUrl(e.target.value)} 
              placeholder="Or enter image URL directly" 
              disabled={uploadingImage}
            />
            {imageUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <img 
                  src={imageUrl} 
                  alt="Preview" 
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1.5px solid var(--color-border)" }} 
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>Preview Active</span>
                <button 
                  type="button" 
                  style={{ ...S.linkBtn, color: "var(--color-danger)" }} 
                  onClick={() => setImageUrl("")}
                >
                  Remove Image
                </button>
              </div>
            )}
          </div>

          <button type="submit" style={{ ...S.primaryBtn, marginTop: 24 }} disabled={submitting || uploadingImage}>
            {submitting ? "Saving..." : "Save Category"}
          </button>
          <button type="button" style={S.ghostBtn} onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}

function ProductFormSheet({ product, categories, session, onClose, onSaved, showToast, onTriggerScan }) {
  const [name, setName] = useState(product ? product.name : "");
  const [categoryId, setCategoryId] = useState(product ? product.category_id : (categories[0]?.id || ""));
  const [sku, setSku] = useState(product ? product.sku : "");
  const [barcode, setBarcode] = useState(product ? product.barcode : "");
  const [costPrice, setCostPrice] = useState(product ? product.cost_price : "");
  const [sellingPrice, setSellingPrice] = useState(product ? product.selling_price : "");
  const [stock, setStock] = useState(product ? product.stock : "0");
  const [description, setDescription] = useState(product ? product.description : "");
  const [imageUrl, setImageUrl] = useState(product ? product.image_url : "");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      let compressedFile = file;
      if (isMock) {
        compressedFile = await new Promise((resolve) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxDim = 120;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              resolve(new File([blob], file.name, { type: "image/jpeg" }));
            }, "image/jpeg", 0.7);
          };
        });
      }
      const url = await db.uploadImage(compressedFile);
      setImageUrl(url);
      showToast("Product image uploaded successfully.");
    } catch (err) {
      showToast("Image upload failed: " + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !categoryId || !sku || !costPrice || !sellingPrice) {
      showToast("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      if (product) {
        await db.updateProduct(
          product.id,
          categoryId,
          name,
          sku,
          barcode,
          costPrice,
          sellingPrice,
          description,
          imageUrl,
          session.id
        );
        showToast("Product updated successfully.");
      } else {
        await db.createProduct(
          categoryId,
          name,
          sku,
          barcode,
          costPrice,
          sellingPrice,
          stock,
          description,
          imageUrl,
          session.id
        );
        showToast("Product created successfully.");
      }
      onSaved();
    } catch (err) {
      showToast("Failed to save: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.sheetOverlay} onClick={onClose} className="animate-fade-in">
      <div style={{ ...S.sheet, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()} className="animate-slide-up">
        <div style={S.sheetHandle} />
        <h3 style={S.sheetTitle}>{product ? "Edit Product" : "Add New Product"}</h3>
        <form onSubmit={handleSubmit} style={{ width: "100%", marginTop: 10 }}>
          <label style={S.label}>Product Name *</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fruit Jam 250g" required />

          <label style={S.label}>Category *</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid var(--color-border)", background: "#FFF" }} required>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label style={S.label}>SKU * (Stock Keeping Unit)</label>
          <input style={S.input} value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. SNK-003" required />

          <label style={S.label}>Barcode (Optional)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...S.input, flex: 1 }} value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Barcode text" />
            <button 
              type="button" 
              style={{ ...S.ghostBtn, margin: 0, width: "auto", padding: "10px 12px", border: `1.5px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => onTriggerScan((val) => setBarcode(val))}
            >
              📷 Scan
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={S.label}>Default cost for next manual/bulk batch * (LKR)</label>
              <input style={S.input} type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="180" required />
              <p style={{ ...S.profileDetail, fontSize: 11.5 }}>Changing this default does not rewrite existing FIFO batch costs. Stock entries and purchase orders use their own recorded line cost.</p>
            </div>
            <div>
              <label style={S.label}>Selling Price * (LKR)</label>
              <input style={S.input} type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} placeholder="240" required />
            </div>
          </div>

          {!product && (
            <div>
              <label style={S.label}>Initial Stock</label>
              <input style={S.input} type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} placeholder="0" />
            </div>
          )}

          <label style={S.label}>Description</label>
          <textarea style={{ ...S.input, minHeight: 60, resize: "none" }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Product specification details..." />

          <label style={S.label}>Product Image</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageFileChange} 
                style={{ fontSize: 13, flex: 1 }} 
                disabled={uploadingImage}
              />
              {uploadingImage && <span style={{ fontSize: 12, color: "var(--color-teal)" }}>Uploading...</span>}
            </div>
            <input 
              style={S.input} 
              value={imageUrl} 
              onChange={e => setImageUrl(e.target.value)} 
              placeholder="Or enter image URL directly" 
              disabled={uploadingImage}
            />
            {imageUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <img 
                  src={imageUrl} 
                  alt="Preview" 
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1.5px solid var(--color-border)" }} 
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>Preview Active</span>
                <button 
                  type="button" 
                  style={{ ...S.linkBtn, color: "var(--color-danger)" }} 
                  onClick={() => setImageUrl("")}
                >
                  Remove Image
                </button>
              </div>
            )}
          </div>

          <button type="submit" style={{ ...S.primaryBtn, marginTop: 24 }} disabled={submitting || uploadingImage}>
            {submitting ? "Saving..." : "Save Product"}
          </button>
          <button type="button" style={S.ghostBtn} onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}

function RestockProductSheet({ product, session, onClose, onSaved, showToast }) {
  const [qty, setQty] = useState("");
  const [batchCost, setBatchCost] = useState(String(product.cost_price ?? 0));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const adjust = Number(qty);
    if (isNaN(adjust) || adjust === 0) {
      showToast("Please enter a valid non-zero adjustment quantity.");
      return;
    }
    if (product.stock + adjust < 0) {
      showToast(`Cannot adjust below 0. Current stock is ${product.stock}.`);
      return;
    }
    if (adjust > 0 && (!Number.isFinite(Number(batchCost)) || Number(batchCost) < 0)) return showToast('Enter a valid cost price for the new batch.');
    const confirmation = await Swal.fire({ title: 'Confirm stock adjustment?', text: `${product.name}: ${product.stock} → ${product.stock + adjust}`, icon: adjust < 0 ? 'warning' : 'question', showCancelButton: true, confirmButtonColor: adjust < 0 ? '#993C1D' : '#0F6E56' });
    if (!confirmation.isConfirmed) return;
    setSubmitting(true);
    try {
      await db.restockProduct(product.id, adjust, session.id, adjust > 0 ? Number(batchCost) : null);
      showToast(`Stock adjusted successfully by ${adjust > 0 ? '+' : ''}${adjust}.`);
      onSaved();
    } catch (err) {
      showToast("Adjustment failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.sheetOverlay} onClick={onClose} className="animate-fade-in">
      <div style={S.sheet} onClick={e => e.stopPropagation()} className="animate-slide-up">
        <div style={S.sheetHandle} />
        <h3 style={S.sheetTitle}>Adjust Stock Level</h3>
        <p style={{ ...S.sheetDesc, marginTop: 4 }}>
          <strong>{product.name}</strong> · Current stock: <strong>{product.stock}</strong> units.
        </p>
        <form onSubmit={handleSubmit} style={{ width: "100%", marginTop: 12 }}>
          <label style={S.label}>Adjustment Count (use negative numbers to deduct)</label>
          <input 
            style={S.input} 
            type="number"
            value={qty} 
            onChange={e => setQty(e.target.value)} 
            placeholder="e.g. 50 (or -10)" 
            autoFocus 
          />
          {Number(qty) > 0 && <><label style={S.label}>New FIFO batch cost price</label><input style={S.input} type="number" min="0" step="0.01" value={batchCost} onChange={e => setBatchCost(e.target.value)} /><p style={{ ...S.profileDetail, fontSize: 12 }}>This cost applies only to the new batch. Existing batch costs are unchanged.</p></>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" style={{ ...S.ghostBtn, margin: 0, flex: 1 }} onClick={() => setQty("25")}>+25</button>
            <button type="button" style={{ ...S.ghostBtn, margin: 0, flex: 1 }} onClick={() => setQty("50")}>+50</button>
            <button type="button" style={{ ...S.ghostBtn, margin: 0, flex: 1 }} onClick={() => setQty("-10")}>-10</button>
          </div>

          <button type="submit" style={S.primaryBtn} disabled={submitting}>
            {submitting ? "Saving..." : "Confirm Stock Adjustment"}
          </button>
          <button type="button" style={S.ghostBtn} onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}

function CustomerFormSheet({ customer, session, onClose, onSaved, showToast }) {
  const [name, setName] = useState(customer ? customer.name : "");
  const [company, setCompany] = useState(customer ? customer.company : "");
  const [mobile, setMobile] = useState(customer ? customer.mobile : "");
  const [email, setEmail] = useState(customer ? customer.email : "");
  const [nic, setNic] = useState(customer ? customer.nic : "");
  const [address, setAddress] = useState(customer ? customer.address : "");
  
  const initialBank = customer?.bank_details || { bank: "", branch: "", account: "", payee: "" };
  const [bank, setBank] = useState(initialBank.bank || "");
  const [branch, setBranch] = useState(initialBank.branch || "");
  const [account, setAccount] = useState(initialBank.account || "");
  const [payee, setPayee] = useState(initialBank.payee || "");

  const [notes, setNotes] = useState(customer ? customer.notes : "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !mobile) {
      showToast("Customer name and mobile are required.");
      return;
    }
    setSubmitting(true);
    const bankDetails = { bank, branch, account, payee };
    try {
      if (customer) {
        await db.updateCustomer(
          customer.id,
          name,
          company,
          address,
          mobile,
          email,
          nic,
          bankDetails,
          notes,
          session.id
        );
        showToast("Customer profile updated successfully.");
      } else {
        await db.createCustomer(
          name,
          company,
          address,
          mobile,
          email,
          nic,
          bankDetails,
          notes,
          session.id
        );
        showToast("Customer registered successfully.");
      }
      onSaved();
    } catch (err) {
      showToast("Failed to save customer: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.sheetOverlay} onClick={onClose} className="animate-fade-in">
      <div style={{ ...S.sheet, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()} className="animate-slide-up">
        <div style={S.sheetHandle} />
        <h3 style={S.sheetTitle}>{customer ? "Edit Customer Profile" : "Register Customer"}</h3>
        <form onSubmit={handleSubmit} style={{ width: "100%", marginTop: 10 }}>
          <label style={S.label}>Customer Name *</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kamal Perera" required />

          <label style={S.label}>Company Name (Optional)</label>
          <input style={S.input} value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Perera Traders" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={S.label}>Mobile Number *</label>
              <input style={S.input} value={mobile} onChange={e => setMobile(e.target.value)} placeholder="e.g. 0771234567" required />
            </div>
            <div>
              <label style={S.label}>NIC Number</label>
              <input style={S.input} value={nic} onChange={e => setNic(e.target.value)} placeholder="e.g. 841234567V" />
            </div>
          </div>

          <label style={S.label}>Email Address</label>
          <input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="kamal@pereratraders.com" />

          <label style={S.label}>Delivery Address</label>
          <input style={S.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Galle Road, Colombo" />

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 12, marginTop: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-soft)" }}>Bank Accounts Details</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
              <div>
                <label style={{ ...S.label, marginTop: 4 }}>Bank</label>
                <input style={S.input} value={bank} onChange={e => setBank(e.target.value)} placeholder="BOC" />
              </div>
              <div>
                <label style={{ ...S.label, marginTop: 4 }}>Branch</label>
                <input style={S.input} value={branch} onChange={e => setBranch(e.target.value)} placeholder="Galle" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ ...S.label, marginTop: 8 }}>Account No</label>
                <input style={S.input} value={account} onChange={e => setAccount(e.target.value)} placeholder="1234567" />
              </div>
              <div>
                <label style={{ ...S.label, marginTop: 8 }}>Payee Name</label>
                <input style={S.input} value={payee} onChange={e => setPayee(e.target.value)} placeholder="Kamal Perera" />
              </div>
            </div>
          </div>

          <label style={S.label}>Ledger Notes / Remarks</label>
          <textarea style={{ ...S.input, minHeight: 50, resize: "none" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reliable wholesale customer, COD terms." />

          <button type="submit" style={S.primaryBtn} disabled={submitting}>
            {submitting ? "Saving Profile..." : "Save Customer"}
          </button>
          <button type="button" style={S.ghostBtn} onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}

function StaffFormSheet({ session, onClose, onSaved, showToast }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !mobile || !password) {
      showToast("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await db.createStaffUser(name, mobile, email, password, role, session.id);
      showToast(`Staff registered: ${name}`);
      onSaved();
    } catch (err) {
      showToast("Registration failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.sheetOverlay} onClick={onClose} className="animate-fade-in">
      <div style={S.sheet} onClick={e => e.stopPropagation()} className="animate-slide-up">
        <div style={S.sheetHandle} />
        <h3 style={S.sheetTitle}>Register Staff Profile</h3>
        <form onSubmit={handleSubmit} style={{ width: "100%", marginTop: 10 }}>
          <label style={S.label}>Staff Name</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Nadeesha Silva" required />

          <label style={S.label}>Email Address (will be username)</label>
          <input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nadeesha@stockorder.local" required />

          <label style={S.label}>Mobile Number</label>
          <input style={S.input} value={mobile} onChange={e => setMobile(e.target.value)} placeholder="e.g. 0779876543" required />

          <label style={S.label}>Temporary Password (min 8 chars)</label>
          <input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />

          <label style={S.label}>System Permissions Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid var(--color-border)", background: "#FFF" }}>
            <option value="user">User (Staff / Billing Only)</option>
            <option value="superadmin">Super Admin (Full CRUD and Ledger Management)</option>
          </select>

          <button type="submit" style={S.primaryBtn} disabled={submitting}>
            {submitting ? "Registering..." : "Register Staff User"}
          </button>
          <button type="button" style={S.ghostBtn} onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}

const COLORS = {
  bg: "var(--color-bg)",
  surface: "var(--color-surface)",
  border: "var(--color-border)",
  ink: "var(--color-ink)",
  inkSoft: "var(--color-ink-soft)",
  teal: "var(--color-teal)",
  tealDark: "var(--color-teal-dark)",
  amber: "var(--color-amber)",
  amberBg: "var(--color-amber-bg)",
  danger: "var(--color-danger)",
  dangerBg: "var(--color-danger-bg)",
};

const S = {
  app: { minHeight: "100vh", background: COLORS.bg, color: COLORS.ink },
  bootWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: COLORS.bg },
  bootSpinner: { width: 32, height: 32, borderRadius: "50%", border: `3.5px solid ${COLORS.border}`, borderTopColor: COLORS.teal, animation: "spin 0.8s linear infinite" },

  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: `linear-gradient(180deg, ${COLORS.tealDark}, ${COLORS.teal})` },
  loginCard: { width: "100%", maxWidth: 390, background: COLORS.surface, borderRadius: 20, padding: "2.5rem 2rem", display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" },
  loginBadge: { width: 56, height: 56, borderRadius: 14, background: COLORS.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, marginBottom: 16 },
  loginTitle: { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 25, margin: 0, color: COLORS.ink },
  loginSub: { color: COLORS.inkSoft, fontSize: 14, marginTop: 6, marginBottom: 20, textAlign: "center", lineHeight: 1.4 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 6, marginTop: 14 },
  input: { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 14, outline: "none", background: "#FBFCFA", transition: "all 0.2s" },
  errorText: { color: COLORS.danger, fontSize: 13, marginTop: 10, marginBottom: 0, fontWeight: 500 },
  primaryBtn: { width: "100%", marginTop: 20, padding: "13px 16px", borderRadius: 10, border: "none", background: COLORS.teal, color: "#fff", fontWeight: 600, fontSize: 15, boxShadow: "0 4px 12px rgba(15, 110, 86, 0.2)" },
  fingerprintBtn: { width: "100%", marginTop: 12, padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  demoNote: { fontSize: 12.5, color: COLORS.inkSoft, marginTop: 20, textAlign: "center" },
  mockBanner: { width: "100%", padding: "10px", background: COLORS.amberBg, color: COLORS.amber, borderRadius: 10, fontSize: 12.5, textAlign: "center", fontWeight: 500, border: `1px solid rgba(186, 117, 23, 0.2)` },

  header: { background: COLORS.tealDark, padding: "1.25rem 0 0", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" },
  headerInner: { width: "100%", maxWidth: "var(--app-content-max-width)", margin: "0 auto", padding: "0 1.25rem" },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  headerBrand: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  headerLogo: { width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 },
  headerTitle: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, color: "#fff" },
  headerUser: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  logoutBtn: { padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontSize: 12, fontWeight: 500 },
  headerNav: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, scrollbarWidth: "none" },
  navBtn: { flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500, position: "relative" },
  navBtnActive: { background: "#fff", color: COLORS.tealDark, boxShadow: "0 4px 10px rgba(0,0,0,0.08)" },
  navBadge: { position: "absolute", top: -4, right: -4, background: COLORS.amber, color: "#FFFFFF", fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" },
  mockIndicator: { padding: "4px 8px", background: COLORS.amberBg, color: COLORS.amber, borderRadius: 6, fontSize: 11, fontWeight: 600 },
  liveIndicator: { padding: "4px 8px", background: "rgba(255,255,255,0.15)", color: "#9ae8d6", borderRadius: 6, fontSize: 11, fontWeight: 600 },

  main: { width: "100%", maxWidth: "var(--app-content-max-width)", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 },
  statCard: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "14px 16px", boxShadow: "var(--shadow-sm)" },
  statCardWarn: { background: COLORS.dangerBg, border: `1px solid #F0997B` },
  statLabel: { fontSize: 12, color: COLORS.inkSoft, fontWeight: 500 },
  statValue: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19, marginTop: 4, color: COLORS.ink },

  sectionHeadRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sectionHead: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19, margin: "0 0 12px" },
  toolRow: { display: "flex", gap: 8, marginBottom: 16 },
  searchInput: { flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 14, background: COLORS.surface, boxShadow: "var(--shadow-sm)" },
  sortSelect: { padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 13, background: COLORS.surface, boxShadow: "var(--shadow-sm)" },

  catGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  catCard: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 14, cursor: "pointer", boxShadow: "var(--shadow-sm)", transition: "all 0.2s" },
  catImage: { width: 42, height: 42, borderRadius: 10, background: COLORS.amberBg, color: COLORS.amber, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, marginBottom: 10 },
  catName: { fontWeight: 600, fontSize: 14.5 },
  catDesc: { fontSize: 12.5, color: COLORS.inkSoft, marginTop: 2, lineHeight: 1.4 },
  catCount: { fontSize: 11.5, color: COLORS.teal, fontWeight: 600, marginTop: 8 },

  prodGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  prodCard: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 10, cursor: "pointer", boxShadow: "var(--shadow-sm)", transition: "all 0.2s" },
  prodImage: { width: "100%", aspectRatio: "1", borderRadius: 10, background: COLORS.amberBg, color: COLORS.amber, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, marginBottom: 8 },
  prodName: { fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 },
  prodPrice: { fontSize: 13, fontWeight: 600, color: COLORS.teal, marginTop: 4 },
  prodStock: { fontSize: 10.5, color: COLORS.inkSoft, marginTop: 3 },
  lowStock: { color: COLORS.danger, fontWeight: 600 },

  backBtn: { border: "none", background: "transparent", color: COLORS.teal, fontWeight: 600, fontSize: 13.5, padding: 0, marginBottom: 14 },

  sheetOverlay: { position: "fixed", inset: 0, background: "rgba(15,20,17,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  sheet: { width: "100%", maxWidth: 480, background: COLORS.surface, borderRadius: "20px 20px 0 0", padding: "10px 22px 26px", display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 -8px 30px rgba(0,0,0,0.15)" },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, background: COLORS.border, marginBottom: 16 },
  sheetImage: { width: 72, height: 72, borderRadius: 16, background: COLORS.amberBg, color: COLORS.amber, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, marginBottom: 12 },
  sheetTitle: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, margin: 0, textAlign: "center" },
  sheetDesc: { fontSize: 13, color: COLORS.inkSoft, textAlign: "center", marginTop: 6, lineHeight: 1.5 },
  sheetRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: 16 },
  sheetPrice: { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: COLORS.teal },

  qtyRow: { display: "flex", alignItems: "center", gap: 14, margin: "18px 0" },
  qtyBtn: { width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${COLORS.border}`, background: COLORS.surface, fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" },
  qtyValue: { fontSize: 17, fontWeight: 600, minWidth: 24, textAlign: "center" },
  qtyBtnSm: { width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${COLORS.border}`, background: COLORS.surface, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" },
  qtyValueSm: { fontSize: 13, fontWeight: 600, minWidth: 16, textAlign: "center" },

  ghostBtn: { width: "100%", marginTop: 10, padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, fontWeight: 500, fontSize: 14 },
  dangerGhostBtn: { flex: 1, padding: "12px 16px", borderRadius: 10, border: `1.5px solid #F0997B`, background: COLORS.dangerBg, color: COLORS.danger, fontWeight: 600, fontSize: 14 },

  confirmCard: { width: "100%", maxWidth: 385, background: COLORS.surface, borderRadius: 18, padding: "22px 22px 20px", margin: 20, boxShadow: "var(--shadow-lg)" },

  emptyState: { textAlign: "center", padding: "2.5rem 1rem" },
  emptyText: { color: COLORS.inkSoft, fontSize: 13.5, lineHeight: 1.6 },

  footer: { marginTop: 40, paddingTop: 20, borderTop: `1px solid ${COLORS.border}`, textAlign: "center" },
  footerTitle: { fontSize: 12, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 8 },
  footerNumbers: { display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center", fontSize: 13, fontWeight: 500, color: COLORS.ink },

  cartList: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 },
  cartRow: { display: "flex", alignItems: "center", gap: 10, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 10, boxShadow: "var(--shadow-sm)" },
  cartImage: { width: 40, height: 40, borderRadius: 10, background: COLORS.amberBg, color: COLORS.amber, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  cartName: { fontSize: 13, fontWeight: 600 },
  cartUnitPrice: { fontSize: 11, color: COLORS.inkSoft },
  cartLineTotal: { fontSize: 13, fontWeight: 600, minWidth: 70, textAlign: "right" },
  removeBtn: { border: "none", background: "transparent", color: COLORS.inkSoft, fontSize: 14, padding: 4 },

  customerBox: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, marginBottom: 16, boxShadow: "var(--shadow-sm)" },
  selectedCustomer: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 500 },
  linkBtn: { border: "none", background: "transparent", color: COLORS.teal, fontWeight: 600, fontSize: 12.5 },
  customerList: { marginTop: 10, maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 },
  customerOption: { display: "flex", justifyContent: "space-between", padding: "9px 10px", borderRadius: 8, fontSize: 13.5, cursor: "pointer", transition: "background 0.2s" },
  customerMobile: { color: COLORS.inkSoft, fontSize: 12 },

  totalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 4px", borderTop: `1.5px solid ${COLORS.border}`, marginBottom: 16 },
  totalValue: { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: COLORS.teal },
  cartActions: { display: "flex", gap: 10 },

  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: COLORS.ink, color: "#fff", padding: "10px 18px", borderRadius: 30, fontSize: 13, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 20px rgba(0,0,0,0.25)" },
  
  profileCard: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 24, boxShadow: "var(--shadow-sm)" },
  profileAvatar: { width: 64, height: 64, borderRadius: "50%", background: COLORS.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 16 },
  profileName: { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, margin: "0 0 6px" },
  profileDetail: { fontSize: 14, color: COLORS.inkSoft, marginBottom: 8 },

  orderCard: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, cursor: "pointer", boxShadow: "var(--shadow-sm)", transition: "transform 0.15s, box-shadow 0.15s" },
  orderNumber: { fontWeight: 700, fontFamily: "var(--font-display)", color: COLORS.teal, fontSize: 14.5 },
  orderCust: { fontSize: 14, fontWeight: 500, marginTop: 6 },
  statusBadge: { fontSize: 10.5, fontWeight: 700, padding: "3.5px 9px", borderRadius: 8, textTransform: "uppercase", letterSpacing: "0.2px" },
  status_paid: { background: "#D1E7DD", color: "#0F5132" },
  status_partial: { background: "#FFF3CD", color: "#664D03" },
  status_unpaid: { background: "#F8D7DA", color: "#842029" },
  pillFilter: { padding: "6px 14px", borderRadius: 20, background: "rgba(30, 42, 34, 0.05)", color: "var(--color-ink-soft)", fontSize: 12, fontWeight: 600, border: "1px solid transparent" },
  pillFilterActive: { background: COLORS.teal, color: "#fff", boxShadow: "0 4px 10px rgba(15, 110, 86, 0.15)" },

  invoiceSection: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 10 },
  invoiceLabel: { fontSize: 11, color: COLORS.inkSoft, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" },
  invoiceValue: { fontSize: 14, fontWeight: 500, marginTop: -4, marginBottom: 6 },
  invoiceRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }
};

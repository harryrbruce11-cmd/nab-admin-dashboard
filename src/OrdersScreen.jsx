import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import OrderPrintPreviewScreen from "./OrderPrintPreviewScreen";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
);

const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "£0.00";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function normaliseOrder(doc) {
  const data = doc.data() || {};

  const items = (Array.isArray(data.items) ? data.items : []).map((item, index) => {
    const qty = Number(item?.qty ?? item?.quantity ?? 0);
    const retailPrice = Number(
      item?.retailPrice ?? item?.price ?? item?.netPrice ?? item?.amount ?? 0
    );
    const netPrice = Number(item?.netPrice ?? item?.price ?? 0);
    const discountPrice = Number(item?.discountPrice ?? item?.discount ?? 0);

    return {
      id: item?.productId || item?.id || `line-${index}`,
      name: firstNonEmpty(item?.name, item?.title, "Unnamed Item"),
      sku: firstNonEmpty(item?.sku, item?.partNumber, item?.code, "-"),
      imageUrl: firstNonEmpty(item?.imageUrl, item?.image, ""),
      qty: Number.isFinite(qty) ? qty : 0,
      retailPrice: Number.isFinite(retailPrice) ? retailPrice : 0,
      netPrice: Number.isFinite(netPrice) ? netPrice : 0,
      discountPrice: Number.isFinite(discountPrice) ? discountPrice : 0,
      stockBefore: Number(item?.stockBefore ?? 0),
      stockAfter: Number(item?.stockAfter ?? item?.stock ?? 0),
    };
  });

  const totalQty = items.reduce((sum, item) => sum + Number(item?.qty || 0), 0);
  const totalValue = items.reduce((sum, item) => {
    const qty = Number(item?.qty || 0);
    const price = Number(
      item?.retailPrice ?? item?.price ?? item?.netPrice ?? item?.amount ?? 0
    );
    return sum + qty * price;
  }, 0);

  return {
    id: doc.id,
    orderRef: firstNonEmpty(data.orderRef, data.reference, data.ref, doc.id),
    customer: firstNonEmpty(
      data.customer,
      data.customerName,
      data.company,
      data.name,
      "Unknown Customer"
    ),
    user: firstNonEmpty(
      data.user,
      data.userName,
      data.createdBy,
      data.engineer,
      data.selectedUser,
      "-"
    ),
    fleet: firstNonEmpty(data.fleet, data.fleetNumber, data.registration, "-"),
    status: firstNonEmpty(data.processingStatus, data.status, data.orderStatus, "Open"),
    productStatus: firstNonEmpty(data.productStatus, data.status, data.orderStatus, "Open"),
    processingStatus: firstNonEmpty(data.processingStatus, "-"),
    deliveryStatus: firstNonEmpty(data.deliveryStatus, "-"),
    pdfUrl: firstNonEmpty(data.pdfUrl, ""),
    notes: firstNonEmpty(data.notes, data.comment, data.description, ""),
    createdAt: data.createdAt || data.created_at || data.date || null,
    updatedAt: data.updatedAt || data.updated_at || null,
    items,
    totalQty,
    totalValue,
  };
}

export default function OrdersScreen({ onBack }) {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [printPreviewOrder, setPrintPreviewOrder] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      setError("Firebase is not configured. Add your VITE_FIREBASE values to .env.local.");
      return;
    }

    setLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        const nextOrders = snapshot.docs
          .map(normaliseOrder)
          .sort((a, b) => {
            const aMs = Math.max(toMillis(a.updatedAt), toMillis(a.createdAt));
            const bMs = Math.max(toMillis(b.updatedAt), toMillis(b.createdAt));
            return bMs - aMs;
          });

        setOrders(nextOrders);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError?.message || "Failed to load orders.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const filteredOrders = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return orders;

    return orders.filter((order) => {
      return (
        String(order.orderRef || "").toLowerCase().includes(text) ||
        String(order.customer || "").toLowerCase().includes(text) ||
        String(order.user || "").toLowerCase().includes(text) ||
        String(order.fleet || "").toLowerCase().includes(text) ||
        String(order.status || "").toLowerCase().includes(text)
      );
    });
  }, [orders, search]);

  const openOrders = useMemo(
    () => orders.filter((order) => String(order.status).toLowerCase() === "open").length,
    [orders]
  );

  const processingOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = String(order.status).toLowerCase();
        return status.includes("processing") || status.includes("progress");
      }).length,
    [orders]
  );

  const completedOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = String(order.status).toLowerCase();
        return status.includes("complete") || status.includes("completed");
      }).length,
    [orders]
  );

  const todayOrders = useMemo(() => {
    const today = new Date();
    return orders.filter((order) => {
      const ms = toMillis(order.createdAt);
      if (!ms) return false;
      const date = new Date(ms);
      return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      );
    }).length;
  }, [orders]);

  const handleSaveOrderStatus = async (orderId, nextStatus) => {
    if (!db || !orderId || !nextStatus) return;

    try {
      setStatusSaving(true);
      await updateDoc(doc(db, "orders", orderId), {
        processingStatus: nextStatus,
        status: nextStatus,
      });

      setSelectedOrder((current) => {
        if (!current || current.id !== orderId) return current;
        return {
          ...current,
          status: nextStatus,
          processingStatus: nextStatus,
        };
      });
    } finally {
      setStatusSaving(false);
    }
  };

  if (printPreviewOrder) {
    return (
      <OrderPrintPreviewScreen
        order={printPreviewOrder}
        onBack={() => setPrintPreviewOrder(null)}
      />
    );
  }

  if (selectedOrder) {
    return (
      <OrderDetailScreen
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onSaveStatus={handleSaveOrderStatus}
        onOpenPrintPreview={() => setPrintPreviewOrder(selectedOrder)}
        statusSaving={statusSaving}
      />
    );
  }

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={backButtonStyle}>
            ← Back to Dashboard
          </button>
          <div>
            <p style={eyebrowStyle}>Orders</p>
            <h1 style={titleStyle}>Orders Dashboard</h1>
          </div>
        </div>
      </div>

      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Open Orders</span>
          <strong style={statValueStyle}>{openOrders}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Processing</span>
          <strong style={statValueStyle}>{processingOrders}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Completed</span>
          <strong style={statValueStyle}>{completedOrders}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Today</span>
          <strong style={statValueStyle}>{todayOrders}</strong>
        </div>
      </div>

      <div style={mainCardStyle}>
        <div style={mainCardHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Order List</p>
            <h2 style={sectionTitleStyle}>Recent Orders</h2>
          </div>
          <div style={searchWrapStyle}>
            <span style={{ color: "#64748b", fontSize: 18 }}>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search orders, customer, user, order ref..."
              style={searchInputStyle}
            />
          </div>
        </div>

        {error && <div style={errorStateStyle}>{error}</div>}

        {loading ? (
          <div style={emptyStateStyle}>Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div style={emptyStateStyle}>
            {orders.length === 0
              ? "No orders found in Firebase yet."
              : "No orders matched your search."}
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <div style={tableHeaderStyle}>
              <span>Order Ref</span>
              <span>Customer</span>
              <span>User</span>
              <span>Fleet</span>
              <span>Status</span>
              <span>Items</span>
              <span>Total</span>
              <span>Created</span>
            </div>

            {filteredOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                style={tableRowButtonStyle}
                onClick={() => setSelectedOrder(order)}
              >
                <div style={tableRowStyle}>
                  <strong>{order.orderRef}</strong>
                  <span>{order.customer}</span>
                  <span>{order.user}</span>
                  <span>{order.fleet}</span>
                  <span>
                    <span style={getStatusBadgeStyle(order.status)}>{order.status}</span>
                  </span>
                  <span>{order.totalQty}</span>
                  <span>{formatCurrency(order.totalValue)}</span>
                  <span>{formatDateTime(order.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderDetailScreen({ order, onBack, onSaveStatus, onOpenPrintPreview, statusSaving }) {
  const itemCount = Array.isArray(order?.items) ? order.items.length : 0;
  const [selectedStatus, setSelectedStatus] = useState(order?.status || "processing");

  useEffect(() => {
    setSelectedStatus(order?.status || "processing");
  }, [order]);

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={onBack} style={backButtonStyle}>
              ← Back to Orders
            </button>
            <div>
              <p style={eyebrowStyle}>Order Detail</p>
              <h1 style={titleStyle}>{order.orderRef}</h1>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={getStatusBadgeStyle(order.status)}>{order.status}</span>
            <div style={statusEditorWrapStyle}>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                style={statusSelectStyle}
                disabled={statusSaving}
              >
                <option value="processing">processing</option>
                <option value="printed">printed</option>
                <option value="complete">complete</option>
                <option value="completed">completed</option>
                <option value="open">open</option>
                <option value="error">error</option>
                <option value="delivery">delivery</option>
                <option value="received">received</option>
              </select>
              <button
                type="button"
                style={saveStatusButtonStyle}
                onClick={() => onSaveStatus?.(order.id, selectedStatus)}
                disabled={statusSaving || selectedStatus === order.status}
              >
                {statusSaving ? "Saving..." : "Save Status"}
              </button>
            </div>
            <button
              type="button"
              style={printPreviewButtonStyle}
              onClick={() => onOpenPrintPreview?.(order)}
            >
              Print Preview
            </button>
          </div>
        </div>
      </div>

      <div style={detailStatsGridStyle}>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Customer</span>
          <strong style={detailPrimaryValueStyle}>{order.customer}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>User</span>
          <strong style={detailPrimaryValueStyle}>{order.user}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Fleet</span>
          <strong style={detailPrimaryValueStyle}>{order.fleet}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Items</span>
          <strong style={detailPrimaryValueStyle}>{itemCount}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Total</span>
          <strong style={detailPrimaryValueStyle}>{formatCurrency(order.totalValue)}</strong>
        </div>
      </div>

      <div style={detailLayoutStyle}>
        <div style={detailCardStyle}>
          <div style={detailCardHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Overview</p>
              <h2 style={sectionTitleStyle}>Order Information</h2>
            </div>
          </div>

          <div style={detailInfoGridStyle}>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Order Ref</span>
              <strong style={detailInfoValueStyle}>{order.orderRef}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Customer</span>
              <strong style={detailInfoValueStyle}>{order.customer}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>User</span>
              <strong style={detailInfoValueStyle}>{order.user}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Fleet</span>
              <strong style={detailInfoValueStyle}>{order.fleet}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Created</span>
              <strong style={detailInfoValueStyle}>{formatDateTime(order.createdAt)}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Updated</span>
              <strong style={detailInfoValueStyle}>{formatDateTime(order.updatedAt)}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Delivery Status</span>
              <strong style={detailInfoValueStyle}>{order.deliveryStatus}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Product Status</span>
              <strong style={detailInfoValueStyle}>{order.productStatus}</strong>
            </div>
            <div style={detailInfoItemStyle}>
              <span style={detailInfoLabelStyle}>Status</span>
              <strong style={detailInfoValueStyle}>{order.processingStatus}</strong>
            </div>
          </div>

          <div style={notesCardStyle}>
            <span style={detailInfoLabelStyle}>Notes</span>
            <div style={notesValueStyle}>{order.notes || "No notes added."}</div>
          </div>
        </div>

        <div style={detailCardStyle}>
          <div style={detailCardHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Items</p>
              <h2 style={sectionTitleStyle}>Order Lines</h2>
            </div>
          </div>

          {itemCount === 0 ? (
            <div style={emptyStateStyle}>No items on this order.</div>
          ) : (
            <div style={lineItemsWrapStyle}>
              {order.items.map((item) => (
                <div key={item.id} style={lineItemCardStyle}>
                  <div style={lineItemTopStyle}>
                    <div style={lineItemImageWrapStyle}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} style={lineItemImageStyle} />
                      ) : (
                        <div style={lineItemImagePlaceholderStyle}>No Image</div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={lineItemTitleStyle}>{item.name}</h3>
                      <p style={lineItemMetaStyle}>SKU: {item.sku}</p>
                    </div>
                    <div style={lineQtyBadgeStyle}>x{item.qty}</div>
                  </div>

                  <div style={lineItemStatsGridStyle}>
                    <div style={lineStatBoxStyle}>
                      <span style={lineStatLabelStyle}>Retail</span>
                      <strong style={lineStatValueStyle}>{formatCurrency(item.retailPrice)}</strong>
                    </div>
                    <div style={lineStatBoxStyle}>
                      <span style={lineStatLabelStyle}>Net</span>
                      <strong style={lineStatValueStyle}>{formatCurrency(item.netPrice)}</strong>
                    </div>
                    <div style={lineStatBoxStyle}>
                      <span style={lineStatLabelStyle}>Discount</span>
                      <strong style={lineStatValueStyle}>{formatCurrency(item.discountPrice)}</strong>
                    </div>
                    <div style={lineStatBoxStyle}>
                      <span style={lineStatLabelStyle}>Line Total</span>
                      <strong style={lineStatValueStyle}>{formatCurrency(item.retailPrice * item.qty)}</strong>
                    </div>
                  </div>

                  <div style={stockTrailStyle}>
                    <span style={stockTrailPillStyle}>Before: {Number.isFinite(item.stockBefore) ? item.stockBefore : 0}</span>
                    <span style={stockTrailArrowStyle}>→</span>
                    <span style={stockTrailPillStyle}>After: {Number.isFinite(item.stockAfter) ? item.stockAfter : 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getStatusBadgeStyle(status) {
  const value = String(status || "").toLowerCase();

  if (value.includes("complete")) {
    return {
      ...statusBadgeStyle,
      background: "#dcfce7",
      color: "#166534",
    };
  }

  if (value.includes("processing") || value.includes("progress")) {
    return {
      ...statusBadgeStyle,
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  return {
    ...statusBadgeStyle,
    background: "#fef3c7",
    color: "#92400e",
  };
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f4f6f8",
  padding: 18,
  boxSizing: "border-box",
  display: "grid",
  gap: 18,
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
};

const topBarStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 16px 45px rgba(15,23,42,0.06)",
};

const backButtonStyle = {
  border: "1px solid #dbe3ef",
  background: "white",
  color: "#111827",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

const eyebrowStyle = {
  margin: 0,
  color: "#2563eb",
  fontWeight: 950,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  fontSize: 12,
};

const titleStyle = {
  margin: "6px 0 0",
  fontSize: 30,
  color: "#111827",
};

const sectionTitleStyle = {
  margin: "6px 0 0",
  fontSize: 24,
  color: "#111827",
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
  gap: 14,
};

const statCardStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 16px 45px rgba(15,23,42,0.06)",
};

const statLabelStyle = {
  display: "block",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const statValueStyle = {
  display: "block",
  marginTop: 8,
  fontSize: 30,
  letterSpacing: -0.9,
};

const mainCardStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 20,
  boxShadow: "0 18px 50px rgba(15,23,42,0.08)",
  overflow: "hidden",
};

const mainCardHeaderStyle = {
  padding: 18,
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const searchWrapStyle = {
  minWidth: 320,
  height: 52,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid #dfe7f2",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 16px",
};

const searchInputStyle = {
  width: "100%",
  border: 0,
  outline: 0,
  background: "transparent",
  fontSize: 15,
  fontWeight: 700,
  color: "#111827",
};

const tableWrapStyle = {
  display: "grid",
  overflowX: "auto",
};

const tableHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1.35fr 1.2fr 1fr 1fr 0.7fr 1fr 1.2fr",
  gap: 12,
  padding: "14px 18px",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  borderBottom: "1px solid #e5e7eb",
  minWidth: 1180,
};

const tableRowStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1.35fr 1.2fr 1fr 1fr 0.7fr 1fr 1.2fr",
  gap: 12,
  padding: "16px 18px",
  alignItems: "center",
  borderBottom: "1px solid #eef2f7",
  color: "#111827",
  fontSize: 14,
  minWidth: 1180,
};

const tableRowButtonStyle = {
  border: 0,
  padding: 0,
  margin: 0,
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
};

const detailStatsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(160px, 1fr))",
  gap: 14,
};

const detailPrimaryValueStyle = {
  display: "block",
  marginTop: 8,
  fontSize: 22,
  letterSpacing: -0.6,
  color: "#111827",
  wordBreak: "break-word",
};

const detailLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "0.95fr 1.05fr",
  gap: 18,
  alignItems: "start",
};

const detailCardStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 20,
  boxShadow: "0 18px 50px rgba(15,23,42,0.08)",
  overflow: "hidden",
  padding: 18,
  display: "grid",
  gap: 18,
};

const detailCardHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const detailInfoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const detailInfoItemStyle = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 6,
};

const detailInfoLabelStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.7,
};

const detailInfoValueStyle = {
  color: "#111827",
  fontSize: 15,
  fontWeight: 800,
  wordBreak: "break-word",
};

const notesCardStyle = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 10,
};

const notesValueStyle = {
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.6,
  fontWeight: 700,
  whiteSpace: "pre-wrap",
};

const lineItemsWrapStyle = {
  display: "grid",
  gap: 14,
};

const lineItemCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#ffffff",
  padding: 16,
  display: "grid",
  gap: 14,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const lineItemTopStyle = {
  display: "grid",
  gridTemplateColumns: "88px minmax(0, 1fr) auto",
  gap: 14,
  alignItems: "center",
};

const lineItemImageWrapStyle = {
  width: 88,
  height: 88,
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "grid",
  placeItems: "center",
};

const lineItemImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  background: "white",
};

const lineItemImagePlaceholderStyle = {
  color: "#94a3b8",
  fontWeight: 800,
  fontSize: 12,
};

const lineItemTitleStyle = {
  margin: 0,
  color: "#111827",
  fontSize: 18,
  fontWeight: 900,
};

const lineItemMetaStyle = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const lineQtyBadgeStyle = {
  minWidth: 56,
  height: 40,
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
  padding: "0 12px",
};

const lineItemStatsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const lineStatBoxStyle = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 4,
};

const lineStatLabelStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 850,
};

const lineStatValueStyle = {
  color: "#111827",
  fontSize: 15,
  fontWeight: 900,
};

const stockTrailStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const stockTrailPillStyle = {
  background: "#f1f5f9",
  border: "1px solid #dbe3ef",
  color: "#334155",
  borderRadius: 999,
  padding: "8px 12px",
  fontWeight: 850,
  fontSize: 12,
};

const stockTrailArrowStyle = {
  color: "#64748b",
  fontWeight: 900,
};

const printPreviewButtonStyle = {
  border: "1px solid #dbe3ef",
  background: "white",
  color: "#111827",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

const statusEditorWrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const statusSelectStyle = {
  height: 46,
  borderRadius: 14,
  border: "1px solid #dbe3ef",
  background: "white",
  color: "#111827",
  padding: "0 14px",
  fontWeight: 800,
  outline: 0,
};

const saveStatusButtonStyle = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "white",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

const statusBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const emptyStateStyle = {
  padding: 40,
  color: "#64748b",
  fontWeight: 800,
  textAlign: "center",
};

const errorStateStyle = {
  margin: 18,
  background: "#fee2e2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 14,
  padding: 14,
  fontWeight: 800,
};

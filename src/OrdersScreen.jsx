

import React, { useEffect, useState, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import OrderDrawer from "./components/orders/OrderDrawer";

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper to get order timestamp for sorting
function getOrderTimestamp(order) {
  if (!order) return 0;
  if (order.updatedAt?.seconds) return order.updatedAt.seconds;
  if (order.createdAt?.seconds) return order.createdAt.seconds;
  return 0;
}

// Status badge component
function StatusBadge({ status, type }) {
  let color =
    type === "status"
      ? status === "Completed"
        ? "#22c55e"
        : status === "Need to be Printed"
        ? "#facc15"
        : status === "Delivered"
        ? "#3b82f6"
        : "#f59e0b"
      : type === "delivery"
      ? status === "Delivered"
        ? "#22c55e"
        : "#f59e0b"
      : "#3b82f6";
  return (
    <span
      style={{
        background: color,
        color: "#0f172a",
        borderRadius: 8,
        padding: "2px 8px",
        fontWeight: 600,
        fontSize: 12,
        marginRight: 6,
      }}
    >
      {status || "—"}
    </span>
  );
}

// KPI Card
function KPI({ label, value, accent }) {
  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 12,
        padding: "18px 24px",
        minWidth: 140,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        boxShadow: "0 2px 8px #0002",
        marginRight: 16,
      }}
    >
      <span style={{ color: "#94a3b8", fontSize: 13 }}>{label}</span>
      <span
        style={{
          marginTop: 6,
          fontWeight: 700,
          fontSize: 28,
          color: accent || "#facc15",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// CRM Section
function CRMSection({ icon, title, orders, onSelectOrder, emptyMessage }) {
  return (
    <div style={{ marginTop: 38 }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: "#facc15", marginBottom: 10 }}>
        {icon} <span style={{ color: "#fff" }}>{title}</span>
      </div>
      {orders.length === 0 ? (
        <div
          style={{
            background: "#1e293b",
            color: "#64748b",
            borderRadius: 8,
            padding: "20px 14px",
            marginBottom: 10,
            fontSize: 15,
            fontStyle: "italic",
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 18,
          }}
        >
          {orders.map((order) => (
            <div
              key={order.id}
              onClick={() => onSelectOrder(order)}
              style={{
                background: "#1e293b",
                borderRadius: 12,
                padding: "18px 18px 14px 18px",
                minWidth: 280,
                maxWidth: 340,
                flex: "1 1 320px",
                cursor: "pointer",
                boxShadow: "0 2px 8px #0003",
                marginBottom: 10,
                transition: "transform 0.08s",
                border: "2px solid transparent",
              }}
              onMouseOver={e => (e.currentTarget.style.border = "2px solid #facc15")}
              onMouseOut={e => (e.currentTarget.style.border = "2px solid transparent")}
            >
              <div style={{ fontWeight: 700, color: "#facc15", fontSize: 15, marginBottom: 2 }}>
                Order Ref: <span style={{ color: "#fff" }}>{order.orderRef || order.id}</span>
              </div>
              <div style={{ color: "#fff", fontSize: 16, marginBottom: 2 }}>
                <span style={{ color: "#3b82f6" }}>{order.customer || "—"}</span>
                <span style={{ color: "#64748b", margin: "0 8px" }}>|</span>
                <span style={{ color: "#f59e0b" }}>{order.fleet || "—"}</span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 14, marginBottom: 5 }}>
                User: <b style={{ color: "#fff" }}>{order.user || "—"}</b>
              </div>
              <div style={{ color: "#fff", fontSize: 13, marginBottom: 5 }}>
                Reason: <span style={{ color: "#facc15" }}>{order.reason || "—"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
                <StatusBadge status={order.status} type="status" />
                <StatusBadge status={order.deliveryStatus} type="delivery" />
                <StatusBadge status={order.productStatus} type="product" />
              </div>
              <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 3 }}>
                Created:{" "}
                <span style={{ color: "#fff" }}>
                  {order.createdAt?.toDate
                    ? order.createdAt.toDate().toLocaleString()
                    : "—"}
                </span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 3 }}>
                Items: <span style={{ color: "#fff" }}>{order.items?.length || 0}</span>
              </div>
              <div style={{ color: "#3b82f6", fontWeight: 600, fontSize: 13 }}>
                {order.pdfUrl ? "PDF Available" : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersScreen({ onBack, user, version }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrder, setNewOrder] = useState({
    customer: "",
    fleet: "",
    user: user?.displayName || "",
    notes: "",
    reason: "",
  });
  // Load orders from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "orders"), (snap) => {
      setOrders(
        snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
      setLoading(false);
    });
    return unsub;
  }, []);

  // Queues
  const filteredOrders = useMemo(() => {
    if (!search) return orders;
    const s = search.toLowerCase();
    return orders.filter((o) =>
      [o.orderRef, o.customer, o.fleet, o.user, o.reason]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [orders, search]);

  const allOrders = useMemo(
    () =>
      [...filteredOrders].sort(
        (a, b) => getOrderTimestamp(b) - getOrderTimestamp(a)
      ),
    [filteredOrders]
  );
  const needPrintingOrders = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          (o.status === "Need to be Printed" ||
            o.processingStatus === "Need to be Printed") &&
          (o.status !== "Completed" && o.status !== "Delivered")
      ),
    [allOrders]
  );
  const activeOrders = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          !["Completed", "Delivered", "Need to be Printed"].includes(
            o.status
          ) &&
          !["Completed", "Delivered", "Need to be Printed"].includes(
            o.processingStatus
          )
      ),
    [allOrders]
  );
  const deliveredOrders = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          o.status === "Delivered" ||
          o.deliveryStatus === "Delivered"
      ),
    [allOrders]
  );
  const archiveOrders = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          o.status === "Completed" &&
          o.deliveryStatus === "Delivered"
      ),
    [allOrders]
  );

  // Create Order handler
  async function handleCreateOrder(e) {
    e.preventDefault();
    const data = {
      orderRef: Math.random().toString(36).substring(2, 10).toUpperCase(),
      customer: newOrder.customer,
      fleet: newOrder.fleet,
      user: newOrder.user,
      notes: newOrder.notes,
      reason: newOrder.reason,
      status: "Need to be Printed",
      processingStatus: "Need to be Printed",
      deliveryStatus: "",
      productStatus: "",
      items: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await addDoc(collection(db, "orders"), data);
    setShowCreateModal(false);
    setNewOrder({
      customer: "",
      fleet: "",
      user: user?.displayName || "",
      notes: "",
      reason: "",
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#fff",
        padding: 0,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "28px 44px 18px 44px",
          borderBottom: "2px solid #1e293b",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#0f172a",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#facc15",
            fontSize: 22,
            marginRight: 25,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          ←
        </button>
        <div style={{ fontWeight: 800, fontSize: 27, color: "#fff" }}>
          NAB Orders <span style={{ color: "#facc15" }}>CRM</span>
        </div>
        <span
          style={{
            marginLeft: 20,
            background: "#1e293b",
            color: "#facc15",
            borderRadius: 8,
            fontSize: 13,
            padding: "2px 10px",
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          v{version}
        </span>
        <div style={{ flex: 1 }} />
        <input
          type="text"
          placeholder="🔎 Search orders…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#1e293b",
            color: "#fff",
            border: "2px solid #334155",
            borderRadius: 8,
            padding: "8px 14px",
            marginRight: 16,
            fontSize: 15,
            outline: "none",
            width: 220,
          }}
        />
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            background: "#facc15",
            color: "#0f172a",
            border: "none",
            borderRadius: 8,
            padding: "9px 22px",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            boxShadow: "0 2px 8px #0002",
            marginLeft: 8,
          }}
        >
          + Create Order
        </button>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          margin: "28px 44px 12px 44px",
        }}
      >
        <KPI label="Total Orders" value={allOrders.length} accent="#facc15" />
        <KPI label="Need Printing" value={needPrintingOrders.length} accent="#f59e0b" />
        <KPI label="Active Orders" value={activeOrders.length} accent="#3b82f6" />
        <KPI label="Delivered" value={deliveredOrders.length} accent="#22c55e" />
        <KPI label="Archive" value={archiveOrders.length} accent="#64748b" />
      </div>

      {/* CRM Queues */}
      <div style={{ margin: "0 44px 60px 44px" }}>
        <CRMSection
          icon="📋"
          title="All Orders"
          orders={allOrders}
          onSelectOrder={setSelectedOrder}
          emptyMessage="No orders found."
        />
        <CRMSection
          icon="🖨"
          title="Need Printing"
          orders={needPrintingOrders}
          onSelectOrder={setSelectedOrder}
          emptyMessage="No orders need printing."
        />
        <CRMSection
          icon="📦"
          title="Active Orders"
          orders={activeOrders}
          onSelectOrder={setSelectedOrder}
          emptyMessage="No active orders."
        />
        <CRMSection
          icon="🚚"
          title="Delivered"
          orders={deliveredOrders}
          onSelectOrder={setSelectedOrder}
          emptyMessage="No delivered orders."
        />
        <CRMSection
          icon="📁"
          title="Archive"
          orders={archiveOrders}
          onSelectOrder={setSelectedOrder}
          emptyMessage="No archived orders."
        />
      </div>

      {/* Order Drawer */}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          db={db}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Create Order Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "#0f172ac0",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <form
            onSubmit={handleCreateOrder}
            style={{
              background: "#1e293b",
              borderRadius: 16,
              padding: "38px 36px 28px 36px",
              minWidth: 340,
              boxShadow: "0 6px 32px #0007",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ fontSize: 21, fontWeight: 700, color: "#facc15", marginBottom: 6 }}>
              Create New Order
            </div>
            <label>
              <div style={{ color: "#facc15", fontWeight: 600, marginBottom: 2 }}>Customer</div>
              <input
                type="text"
                required
                value={newOrder.customer}
                onChange={(e) =>
                  setNewOrder((o) => ({ ...o, customer: e.target.value }))
                }
                style={{
                  width: "100%",
                  background: "#0f172a",
                  color: "#fff",
                  border: "2px solid #334155",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 15,
                  marginBottom: 3,
                }}
              />
            </label>
            <label>
              <div style={{ color: "#facc15", fontWeight: 600, marginBottom: 2 }}>Fleet</div>
              <input
                type="text"
                required
                value={newOrder.fleet}
                onChange={(e) =>
                  setNewOrder((o) => ({ ...o, fleet: e.target.value }))
                }
                style={{
                  width: "100%",
                  background: "#0f172a",
                  color: "#fff",
                  border: "2px solid #334155",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 15,
                  marginBottom: 3,
                }}
              />
            </label>
            <label>
              <div style={{ color: "#facc15", fontWeight: 600, marginBottom: 2 }}>User</div>
              <input
                type="text"
                required
                value={newOrder.user}
                onChange={(e) =>
                  setNewOrder((o) => ({ ...o, user: e.target.value }))
                }
                style={{
                  width: "100%",
                  background: "#0f172a",
                  color: "#fff",
                  border: "2px solid #334155",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 15,
                  marginBottom: 3,
                }}
              />
            </label>
            <label>
              <div style={{ color: "#facc15", fontWeight: 600, marginBottom: 2 }}>Reason</div>
              <input
                type="text"
                required
                value={newOrder.reason}
                onChange={(e) =>
                  setNewOrder((o) => ({ ...o, reason: e.target.value }))
                }
                style={{
                  width: "100%",
                  background: "#0f172a",
                  color: "#fff",
                  border: "2px solid #334155",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 15,
                  marginBottom: 3,
                }}
              />
            </label>
            <label>
              <div style={{ color: "#facc15", fontWeight: 600, marginBottom: 2 }}>Notes</div>
              <textarea
                value={newOrder.notes}
                onChange={(e) =>
                  setNewOrder((o) => ({ ...o, notes: e.target.value }))
                }
                style={{
                  width: "100%",
                  background: "#0f172a",
                  color: "#fff",
                  border: "2px solid #334155",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 15,
                  minHeight: 50,
                  marginBottom: 3,
                  resize: "vertical",
                }}
              />
            </label>
            <div style={{ display: "flex", marginTop: 10, gap: 10 }}>
              <button
                type="submit"
                style={{
                  background: "#facc15",
                  color: "#0f172a",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 16,
                  padding: "10px 24px",
                  cursor: "pointer",
                  marginRight: 8,
                }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: "#334155",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 16,
                  padding: "10px 24px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
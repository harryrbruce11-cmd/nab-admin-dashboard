import React, { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { addDoc, collection, getFirestore, onSnapshot, serverTimestamp } from "firebase/firestore";
import OrderDrawer from "./components/orders/OrderDrawer";
import "./mobileAdmin.css";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = getApps()[0] || initializeApp(firebaseConfig);
const db = getFirestore(app);

const Icon = ({ name, size = 22 }) => {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    check: <path d="m6 12 4 4 8-9"/>,
    return: <><path d="m9 7-4 4 4 4"/><path d="M5 11h8a5 5 0 1 1 0 10"/></>,
    print: <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
    clipboard: <><path d="M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8 12h8M8 16h6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
};

function getDate(order) {
  const value = order.updatedAt || order.createdAt;
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  return date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "No date";
}

function getTimestamp(order) {
  return order.updatedAt?.seconds || order.createdAt?.seconds || 0;
}

function getQuantity(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);
}

function getDelivery(order) {
  return String(
    order.deliveryStatus ||
    order.delivery ||
    order.deliveryOption ||
    order.deliveryMethod ||
    order.deliveryType ||
    order.fulfilmentStatus ||
    order.fulfillmentStatus ||
    ""
  ).trim();
}

function kindOf(order) {
  const value = `${order.status || ""} ${order.processingStatus || ""} ${order.deliveryStatus || ""}`.toLowerCase();
  if (value.includes("return")) return "returns";

  const productStatus = String(order.productStatus || "")
    .trim()
    .toLowerCase();

  if (productStatus === "received") return "pick";
  if (productStatus === "completed") return "completed";

  return "pick";
}

function OrderRow({ order, onClick }) {
  const kind = kindOf(order);
  const completed = kind === "completed";
  const returned = kind === "returns";
  const status = returned
    ? "Returned"
    : completed
      ? "Completed"
      : "Needs printing";
  return (
    <button className="ma-order-row" onClick={onClick}>
      <span className={`ma-order-icon ${kind}`}>
        <Icon name={returned ? "return" : completed ? "check" : "box"} size={25}/>
      </span>
      <span className="ma-order-main">
        <strong>{order.orderRef || order.reference || order.id}</strong>
        <span>{order.customer || order.fleet || "NAB"}</span>
        {(getDelivery(order) || order.reason) && <small>{getDelivery(order) || order.reason}</small>}
        <small>{(order.items || []).length} lines · {getQuantity(order)} units</small>
      </span>
      <span className="ma-order-side">
        <em className={kind}>{status}</em>
        <small>{getDate(order)}</small>
      </span>
    </button>
  );
}

export default function OrdersScreen({ onBack, user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pick");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrder, setNewOrder] = useState({ customer: "", fleet: "", user: user?.displayName || "", reason: "", notes: "" });

  useEffect(() => onSnapshot(collection(db, "orders"), snap => {
    setOrders(snap.docs.map(item => ({ id: item.id, ...item.data() })));
    setLoading(false);
  }), []);

  const visible = useMemo(() => orders
    .filter(order => kindOf(order) === tab)
    .filter(order => `${order.orderRef} ${order.customer} ${order.fleet} ${order.user}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => getTimestamp(b) - getTimestamp(a)), [orders, search, tab]);

  async function createOrder(event) {
    event.preventDefault();
    await addDoc(collection(db, "orders"), {
      ...newOrder,
      orderRef: `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`,
      status: "To pick", processingStatus: "To pick", items: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    setShowCreate(false);
  }

  return <div className="ma-page ma-orders-page">
    <header className="ma-page-header">
      <button className="ma-back" onClick={onBack}>← <span>Products</span></button>
      <div>
        <span className="ma-eyebrow">Order management</span>
        <h1>Orders</h1>
        <p>Pick, track and review every workshop order.</p>
      </div>
      <button className="ma-primary ma-create" onClick={() => setShowCreate(true)}><Icon name="plus"/> New order</button>
    </header>

    <main className="ma-orders-shell">
      <div className="ma-orders-toolbar">
        <label className="ma-search"><Icon name="search"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order reference or customer"/></label>
        <nav className="ma-segments" aria-label="Order status">
          {[["pick", "Needs printing"], ["completed", "All completed"], ["returns", "Returns"]].map(([value, label]) =>
            <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
              {label}<span>{orders.filter(order => kindOf(order) === value).length}</span>
            </button>)}
        </nav>
      </div>
      <section className="ma-order-list">
        <div className="ma-list-heading"><div><h2>{tab === "pick" ? "Needs printing" : tab === "completed" ? "Completed orders" : "Returns"}</h2><p>{visible.length} order{visible.length === 1 ? "" : "s"}</p></div></div>
        {loading ? <div className="ma-empty">Loading orders…</div> :
          visible.length ? visible.map(order => <OrderRow key={order.id} order={order} onClick={() => setSelectedOrder(order)}/>) :
          <div className="ma-empty"><Icon name="clipboard" size={34}/><strong>No orders here</strong><span>Orders matching this view will appear here.</span></div>}
      </section>
    </main>

    {selectedOrder && <OrderDrawer order={selectedOrder} db={db} onClose={() => setSelectedOrder(null)}/>}
    {showCreate && <div className="ma-modal-backdrop" onMouseDown={() => setShowCreate(false)}>
      <form className="ma-modal" onSubmit={createOrder} onMouseDown={e => e.stopPropagation()}>
        <div><span className="ma-eyebrow">New order</span><h2>Create an order</h2></div>
        {[["customer", "Customer"], ["fleet", "Fleet"], ["user", "Ordered by"], ["reason", "Reason"]].map(([key, label]) =>
          <label className="ma-field" key={key}><span>{label}</span><input required value={newOrder[key]} onChange={e => setNewOrder({...newOrder, [key]: e.target.value})}/></label>)}
        <label className="ma-field"><span>Notes</span><textarea value={newOrder.notes} onChange={e => setNewOrder({...newOrder, notes: e.target.value})}/></label>
        <div className="ma-modal-actions"><button type="button" className="ma-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="ma-primary">Create order</button></div>
      </form>
    </div>}
  </div>;
}

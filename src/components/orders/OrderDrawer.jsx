
import PrintingWorkflow from "./PrintingWorkflow";

export default function OrderDrawer({
  order,
  db,
  onClose,
}) {
  if (!order) return null;

  const items = Array.isArray(order?.items)
    ? order.items
    : [];

  return (
    <div style={styles.overlay}>
      <div style={styles.drawer}>
        <button
          style={styles.closeButton}
          onClick={onClose}
        >
          ✕ Close
        </button>

        <h2 style={styles.title}>
          {order.orderRef ||
            order.reference ||
            order.id}
        </h2>

        <div style={styles.card}>
          <h3>Order Information</h3>

          <div style={styles.row}>
            <strong>Customer</strong>
            <span>{order.customer || "-"}</span>
          </div>

          <div style={styles.row}>
            <strong>User</strong>
            <span>{order.user || "-"}</span>
          </div>

          <div style={styles.row}>
            <strong>Fleet</strong>
            <span>{order.fleet || "-"}</span>
          </div>

          <div style={styles.row}>
            <strong>Reason</strong>
            <span>{order.reason || "-"}</span>
          </div>

          <div style={styles.row}>
            <strong>Status</strong>
            <span>
              {order.processingStatus ||
                order.status ||
                "-"}
            </span>
          </div>

          <div style={styles.row}>
            <strong>Delivery</strong>
            <span>
              {order.deliveryStatus || "-"}
            </span>
          </div>

          <div style={styles.row}>
            <strong>Product Status</strong>
            <span>
              {order.productStatus || "-"}
            </span>
          </div>

          <div style={styles.notes}>
            <strong>Notes</strong>
            <p>{order.notes || "No notes"}</p>
          </div>
        </div>

        <div style={styles.card}>
          <h3>Parts Summary</h3>

          {items.length === 0 ? (
            <p>No items.</p>
          ) : (
            items.map((item, index) => (
              <div
                key={index}
                style={styles.item}
              >
                <div>
                  <strong>
                    {item.name || "Unnamed"}
                  </strong>

                  <div style={styles.meta}>
                    SKU: {item.sku || "-"}
                  </div>
                </div>

                <div>
                  Qty:{" "}
                  {item.quantity ||
                    item.qty ||
                    1}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={styles.card}>
          <h3>Order Processing</h3>

          <div style={styles.row}>
            <strong>PDF Available</strong>
            <span>
              {order.pdfUrl ? "Yes" : "No"}
            </span>
          </div>

          <div style={styles.row}>
            <strong>PDF URL</strong>
            <span style={styles.url}>
              {order.pdfUrl || "-"}
            </span>
          </div>
        </div>

        <PrintingWorkflow
          order={order}
          db={db}
        />
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.7)",
    zIndex: 9999,
    display: "flex",
    justifyContent: "flex-end",
  },

  drawer: {
    width: 700,
    maxWidth: "100%",
    height: "100vh",
    overflowY: "auto",
    background: "#1e293b",
    color: "white",
    padding: 24,
  },

  closeButton: {
    background: "#ef4444",
    border: 0,
    color: "white",
    borderRadius: 12,
    padding: "10px 16px",
    cursor: "pointer",
    marginBottom: 16,
  },

  title: {
    color: "#facc15",
    marginBottom: 20,
  },

  card: {
    background: "#0f172a",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 0",
    borderBottom:
      "1px solid rgba(255,255,255,.06)",
  },

  notes: {
    marginTop: 12,
  },

  url: {
    maxWidth: 300,
    wordBreak: "break-all",
    color: "#60a5fa",
  },

  item: {
    display: "flex",
    justifyContent: "space-between",
    padding: 10,
    borderBottom:
      "1px solid rgba(255,255,255,.06)",
  },

  meta: {
    color: "#94a3b8",
    fontSize: 12,
  },
};


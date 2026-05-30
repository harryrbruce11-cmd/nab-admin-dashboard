const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

const GMAIL_EMAIL = defineSecret("GMAIL_EMAIL");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

exports.sendNewOrderAdminEmail = onDocumentCreated(
  {
    document: "orders/{orderId}",
    region: "europe-west2",
    secrets: [GMAIL_EMAIL, GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const order = snap.data() || {};
    const orderId = event.params.orderId;

    if (order.adminEmailSent === true) {
      logger.info("Admin email already sent", { orderId });
      return;
    }

    const senderEmail = String(GMAIL_EMAIL.value() || "").trim();
    const senderAppPassword = String(GMAIL_APP_PASSWORD.value() || "")
      .trim()
      .replace(/\s+/g, "");

    if (!senderEmail || !senderAppPassword) {
      const message = "Missing Gmail sender secrets. Check GMAIL_EMAIL and GMAIL_APP_PASSWORD.";

      logger.error(message, {
        orderId,
        senderEmailPresent: Boolean(senderEmail),
        appPasswordPresent: Boolean(senderAppPassword),
      });

      await snap.ref.set(
        {
          adminEmailSent: false,
          adminEmailError: message,
          adminEmailErrorAt: new Date(),
        },
        { merge: true }
      );

      return;
    }

    const orderRef = order.orderRef || orderId;
    const customer = order.customer || "-";
    const fleet = order.fleet || "-";
    const user = order.user || "-";
    const status = order.processingStatus || order.status || "processing";
    const deliveryStatus = order.deliveryStatus || "-";
    const notes = order.notes || "-";
    const items = Array.isArray(order.items) ? order.items : [];
    const recipientEmail = ["harryrbruce11@outlook.com", "paul@nabplant.com"];

    const itemLines = items.length
      ? items
          .map((item, index) => {
            const name = item?.name || item?.title || `Item ${index + 1}`;
            const qty = item?.quantity ?? item?.qty ?? 1;
            const sku = item?.sku || item?.partNumber || "-";
            return `• ${name} | Qty: ${qty} | SKU: ${sku}`;
          })
          .join("\n")
      : "No items listed";

    logger.info("Preparing admin email", {
      orderId,
      orderRef,
      senderEmail,
      recipientEmail,
    });

    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: senderEmail,
          pass: senderAppPassword,
        },
      });

      await transporter.verify();

      await transporter.sendMail({
        from: `NAB Orders <${senderEmail}>`,
        to: recipientEmail,
        replyTo: senderEmail,
        subject: `New Order Received - ${orderRef}`,
        text: [
          `A new order has been created.`,
          ``,
          `Order Ref: ${orderRef}`,
          `Customer: ${customer}`,
          `Fleet: ${fleet}`,
          `User: ${user}`,
          `Status: ${status}`,
          `Delivery Status: ${deliveryStatus}`,
          ``,
          `Items:`,
          itemLines,
          ``,
          `Notes:`,
          notes,
        ].join("\n"),
      });

      await snap.ref.set(
        {
          adminEmailSent: true,
          adminEmailSentAt: new Date(),
          adminEmailError: null,
        },
        { merge: true }
      );

      logger.info("Admin email sent", { orderId, orderRef, senderEmail, recipientEmail });
    } catch (error) {
      const errorMessage = String(error?.message || error);

      logger.error("Failed to send admin email", {
        orderId,
        orderRef,
        senderEmail,
        recipientEmail,
        error: errorMessage,
      });

      await snap.ref.set(
        {
          adminEmailSent: false,
          adminEmailError: errorMessage,
          adminEmailErrorAt: new Date(),
        },
        { merge: true }
      );

      throw error;
    }
  }
);
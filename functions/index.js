const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const { createHmac, randomBytes, randomUUID, timingSafeEqual } = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

const GMAIL_EMAIL = defineSecret("GMAIL_EMAIL");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const GOOGLE_MAPS_API_KEY = defineSecret("GOOGLE_MAPS_API_KEY");
const ADMIN_PASSWORD = defineSecret("ADMIN_PASSWORD");
const KIOSK_CONTROL_KEY = defineSecret("KIOSK_CONTROL_KEY");
const { DEVICE_ID: KIOSK_DEVICE_ID, isValidDeviceId, isValidAction, isValidValue } = require("./kioskControl");
const adminAttempts = new Map();

exports.activateKioskAdmin = onCall(
  { region: "europe-west2", enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const approvedUid = "hkWw4SksA8SU8gprMX636aARpcA2";
    const approvedEmail = "harryrbruce11@gmail.com";
    if (request.auth.uid !== approvedUid || String(request.auth.token.email || "").toLowerCase() !== approvedEmail) {
      throw new HttpsError("permission-denied", "This account is not approved for kiosk administration.");
    }
    const profile = (await getFirestore().collection("users").doc(approvedUid).get()).data() || {};
    if (profile.admin !== true || String(profile.role || "").toLowerCase() !== "admin") {
      throw new HttpsError("permission-denied", "The administrator profile is not enabled.");
    }
    const account = await getAuth().getUser(approvedUid);
    await getAuth().setCustomUserClaims(approvedUid, { ...(account.customClaims || {}), admin: true });
    logger.info("Kiosk administrator claim activated", { uid: approvedUid });
    return { ok: true, refreshToken: true };
  }
);

exports.sendKioskCommand = onCall(
  {
    region: "europe-west2",
    secrets: [KIOSK_CONTROL_KEY],
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before controlling the kiosk.");
    if (request.auth.token.admin !== true) throw new HttpsError("permission-denied", "An administrator claim is required.");

    const deviceId = String(request.data?.deviceId || "").trim();
    const action = String(request.data?.action || "").trim();
    const value = typeof request.data?.value === "string" ? request.data.value.trim() : "";
    if (!isValidDeviceId(deviceId)) throw new HttpsError("invalid-argument", `Only ${KIOSK_DEVICE_ID} can be controlled.`);
    if (!isValidAction(action)) throw new HttpsError("invalid-argument", "Unsupported kiosk command.");
    if (!isValidValue(action, value)) throw new HttpsError("invalid-argument", "The command value is missing or too long.");

    const kioskControlKey = String(KIOSK_CONTROL_KEY.value() || "").trim();
    if (!kioskControlKey) throw new HttpsError("failed-precondition", "Kiosk control is not configured.");
    const nonce = randomBytes(24).toString("hex");
    const issuedAtEpoch = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", kioskControlKey)
      .update(`${deviceId}|${action}|${value}|${nonce}|${issuedAtEpoch}`, "utf8")
      .digest("hex");
    const commandRef = getFirestore().collection("kiosks").doc(deviceId).collection("commands").doc();
    await commandRef.set({ action, value, nonce, issuedAtEpoch, signature, status: "pending", createdAt: require("firebase-admin/firestore").FieldValue.serverTimestamp(), requestedByUid: request.auth.uid, requestedByEmail: request.auth.token.email || "" });
    logger.info("Signed kiosk command created", { commandId: commandRef.id, deviceId, action, requestedByUid: request.auth.uid });
    return { commandId: commandRef.id, status: "pending" };
  }
);

exports.verifyAdminPassword = onCall(
  {
    region: "europe-west2",
    secrets: [ADMIN_PASSWORD],
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before opening Admin.");

    const uid = request.auth.uid;
    const now = Date.now();
    const attempt = adminAttempts.get(uid) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (now > attempt.resetAt) {
      attempt.count = 0;
      attempt.resetAt = now + 15 * 60 * 1000;
    }
    if (attempt.count >= 5) throw new HttpsError("resource-exhausted", "Too many attempts. Try again in 15 minutes.");

    const supplied = Buffer.from(String(request.data?.password || ""), "utf8");
    const expected = Buffer.from(String(ADMIN_PASSWORD.value() || ""), "utf8");
    const matches = supplied.length === expected.length && expected.length > 0 && timingSafeEqual(supplied, expected);

    if (!matches) {
      attempt.count += 1;
      adminAttempts.set(uid, attempt);
      throw new HttpsError("permission-denied", "Incorrect admin password.");
    }

    adminAttempts.delete(uid);
    logger.info("Admin area unlocked", { uid, email: request.auth.token.email || "" });
    return { ok: true };
  }
);

async function lookupGoogleCustomerAddress(customerName) {
  const apiKey = String(GOOGLE_MAPS_API_KEY.value() || "").trim();
  const queryText = String(customerName || "").trim();
  if (!apiKey || !queryText) return "";

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
      },
      body: JSON.stringify({
        textQuery: `${queryText}, United Kingdom`,
        regionCode: "GB",
        languageCode: "en-GB",
        pageSize: 1,
      }),
    });

    if (!response.ok) {
      logger.warn("Google Places address lookup failed", {
        customerName: queryText,
        status: response.status,
      });
      return "";
    }

    const result = await response.json();
    return String(result?.places?.[0]?.formattedAddress || "").trim();
  } catch (error) {
    logger.warn("Google Places address lookup error", {
      customerName: queryText,
      error: String(error?.message || error),
    });
    return "";
  }
}

function customerDocumentId(name) {
  return String(name || "customer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "customer";
}

function machineDocumentId(machine, customerName) {
  return [machine?.serialNumber, machine?.type, machine?.size, customerName]
    .filter((value) => value && value !== "..")
    .join("-")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `machine-${Date.now()}`;
}

function createInvoicePdf(invoice, invoiceId) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 42 });
    const chunks = [];
    const money = (value) => `£${Number(value || 0).toFixed(2)}`;
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];

    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    // NAB header supplied for the invoice design.
    document.rect(0, 0, 595.28, 92).fill("#25a9e0");
    document.font("Helvetica-BoldOblique").fontSize(39)
      .fillColor("#ed2435").strokeColor("#ffffff").lineWidth(1.2)
      .text("NA-B", 28, 12, { width: 126, fill: true, stroke: true });
    document.font("Helvetica").fontSize(13).fillColor("#ffffff")
      .text("Plant Engineering", 31, 61);
    document.font("Helvetica").fontSize(14).fillColor("#ffffff")
      .text("Delivering industrial plant engineering solutions since 1984", 155, 28, { width: 400 });

    document.fillColor("#161925").font("Helvetica-Bold").fontSize(26)
      .text("INVOICE", 42, 120);
    document.font("Helvetica").fontSize(10).fillColor("#6b7280")
      .text(`Invoice: ${invoice.invoiceRef || invoiceId}`, 360, 122, { align: "right", width: 193 })
      .text(`Order: ${invoice.orderRef || "-"}`, 360, 138, { align: "right", width: 193 })
      .text(`Date: ${new Date().toLocaleDateString("en-GB")}`, 360, 154, { align: "right", width: 193 });

    document.font("Helvetica-Bold").fontSize(9).fillColor("#25a9e0").text("BILL TO", 42, 187);
    document.font("Helvetica-Bold").fontSize(14).fillColor("#161925").text(invoice.customer || "Customer", 42, 202);
    document.font("Helvetica").fontSize(9).fillColor("#555b66")
      .text(invoice.customerAddress || "..", 42, 220, { width: 270, lineGap: 2 });
    if (invoice.machine) {
      document.font("Helvetica-Bold").fontSize(9).fillColor("#25a9e0").text("MACHINE", 330, 187);
      document.font("Helvetica").fontSize(9).fillColor("#555b66")
        .text(`Size: ${invoice.machine.size || ".."}`, 330, 204)
        .text(`Type: ${invoice.machine.type || ".."}`, 330, 219)
        .text(`S.N: ${invoice.machine.serialNumber || invoice.machine.sn || ".."}`, 330, 234);
    }

    let y = 285;
    document.rect(42, y, 511, 27).fill("#eef7fb");
    document.font("Helvetica-Bold").fontSize(9).fillColor("#334155")
      .text("DESCRIPTION", 51, y + 9)
      .text("QTY", 340, y + 9, { width: 40, align: "right" })
      .text("UNIT PRICE", 390, y + 9, { width: 72, align: "right" })
      .text("TOTAL", 472, y + 9, { width: 72, align: "right" });
    y += 27;

    lines.forEach((line) => {
      if (y > 680) {
        document.addPage();
        y = 50;
      }
      document.moveTo(42, y + 35).lineTo(553, y + 35).strokeColor("#e5e7eb").lineWidth(.5).stroke();
      document.font("Helvetica-Bold").fontSize(10).fillColor("#161925").text(line.name || "Item", 51, y + 9, { width: 275 });
      if (line.sku) document.font("Helvetica").fontSize(8).fillColor("#7b7d89").text(line.sku, 51, y + 22, { width: 275 });
      document.font("Helvetica").fontSize(10).fillColor("#161925")
        .text(String(line.quantity || 0), 340, y + 12, { width: 40, align: "right" })
        .text(money(line.unitPrice), 390, y + 12, { width: 72, align: "right" })
        .text(money(line.lineTotal), 472, y + 12, { width: 72, align: "right" });
      y += 36;
    });

    y += 18;
    const totalsX = 350;
    const totalRow = (label, value, bold = false) => {
      document.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 13 : 10).fillColor("#161925")
        .text(label, totalsX, y, { width: 90 })
        .text(value, 452, y, { width: 92, align: "right" });
      y += bold ? 25 : 19;
    };
    totalRow("Subtotal", money(invoice.subtotal));
    totalRow(`VAT (${Number(invoice.vatRate || 0)}%)`, money(invoice.vat));
    document.moveTo(totalsX, y - 3).lineTo(544, y - 3).strokeColor("#161925").lineWidth(1).stroke();
    totalRow("TOTAL", money(invoice.total), true);

    if (invoice.notes) {
      document.font("Helvetica-Bold").fontSize(9).fillColor("#25a9e0").text("NOTES", 42, y + 18);
      document.font("Helvetica").fontSize(9).fillColor("#555b66").text(invoice.notes, 42, y + 32, { width: 490 });
    }
    document.font("Helvetica").fontSize(8).fillColor("#8b8d95")
      .text("NAB Plant Engineering", 42, 795, { width: 511, align: "center" });
    document.end();
  });
}

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

exports.sendTestInvoiceEmail = onDocumentCreated(
  {
    document: "invoices/{invoiceId}",
    region: "europe-west2",
    secrets: [GMAIL_EMAIL, GMAIL_APP_PASSWORD, GOOGLE_MAPS_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const invoice = snap.data() || {};
    const invoiceId = event.params.invoiceId;
    const recipientEmail = "harry@nabplant.com";

    if (invoice.testEmailSent === true) {
      logger.info("Test invoice email already sent", { invoiceId });
      return;
    }

    const senderEmail = String(GMAIL_EMAIL.value() || "").trim();
    const senderAppPassword = String(GMAIL_APP_PASSWORD.value() || "")
      .trim()
      .replace(/\s+/g, "");

    if (!senderEmail || !senderAppPassword) {
      await snap.ref.set(
        {
          testEmailSent: false,
          testEmailError: "Missing Gmail sender secrets.",
          testEmailErrorAt: new Date(),
        },
        { merge: true }
      );
      return;
    }

    const money = (value) => `£${Number(value || 0).toFixed(2)}`;
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const lineText = lines.length
      ? lines.map((line) =>
          `${line.name || "Item"} | Qty: ${line.quantity || 0} | ` +
          `Unit: ${money(line.unitPrice)} | Total: ${money(line.lineTotal)}`
        ).join("\n")
      : "No invoice lines";

    try {
      const existingAddress = String(invoice.customerAddress || "").trim();
      const customerAddress = existingAddress && existingAddress !== ".."
        ? existingAddress
        : (await lookupGoogleCustomerAddress(invoice.customer)) || "..";
      const resolvedInvoice = { ...invoice, customerAddress };

      if (customerAddress !== ".." && invoice.customer) {
        await getFirestore()
          .collection("customers")
          .doc(customerDocumentId(invoice.customer))
          .set(
            {
              name: String(invoice.customer).trim(),
              customerName: String(invoice.customer).trim(),
              companyName: String(invoice.customer).trim(),
              address: customerAddress,
              billingAddress: customerAddress,
              addressSource:
                existingAddress && existingAddress !== ".."
                  ? "invoice"
                  : "google_places",
              updatedAt: new Date(),
            },
            { merge: true }
          );
      }


      if (invoice.machine && invoice.customer) {
        await getFirestore()
          .collection("machines")
          .doc(machineDocumentId(invoice.machine, invoice.customer))
          .set(
            {
              size: invoice.machine.size || "..",
              type: invoice.machine.type || "..",
              serialNumber: invoice.machine.serialNumber || invoice.machine.sn || "..",
              sn: invoice.machine.serialNumber || invoice.machine.sn || "..",
              customerName: String(invoice.customer).trim(),
              customerId: customerDocumentId(invoice.customer),
              updatedAt: new Date(),
            },
            { merge: true }
          );
      }

      const pdfBuffer = await createInvoicePdf(resolvedInvoice, invoiceId);
      const bucket = getStorage().bucket();
      const pdfPath = `invoices/${invoice.invoiceRef || invoiceId}.pdf`;
      const downloadToken = randomUUID();
      await bucket.file(pdfPath).save(pdfBuffer, {
        contentType: "application/pdf",
        metadata: {
          contentDisposition: `inline; filename="${invoice.invoiceRef || invoiceId}.pdf"`,
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });
      const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(pdfPath)}?alt=media&token=${downloadToken}`;

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: senderEmail, pass: senderAppPassword },
      });

      await transporter.sendMail({
        from: `NAB Invoices <${senderEmail}>`,
        to: recipientEmail,
        replyTo: senderEmail,
        subject: `TEST Invoice ${invoice.invoiceRef || invoiceId} - ${invoice.customer || "Customer"}`,
        text: [
          "TEST INVOICE - NOT A FINAL TAX INVOICE",
          "",
          `Invoice: ${invoice.invoiceRef || invoiceId}`,
          `Order: ${invoice.orderRef || "-"}`,
          `Customer: ${invoice.customer || "-"}`,
          `Customer address: ${customerAddress}`,
          invoice.machine
            ? `Machine: Size ${invoice.machine.size || ".."} | Type ${invoice.machine.type || ".."} | S.N ${invoice.machine.serialNumber || invoice.machine.sn || ".."}`
            : "Machine: -",
          "",
          "Items:",
          lineText,
          "",
          `Subtotal: ${money(invoice.subtotal)}`,
          `VAT (${Number(invoice.vatRate || 0)}%): ${money(invoice.vat)}`,
          `Total: ${money(invoice.total)}`,
          "",
          `Notes: ${invoice.notes || "-"}`,
        ].join("\n"),
        attachments: [
          {
            filename: `${invoice.invoiceRef || invoiceId}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      await snap.ref.set(
        {
          testEmailSent: true,
          testEmailRecipient: recipientEmail,
          testEmailSentAt: new Date(),
          testEmailError: null,
          pdfUrl,
          pdfPath,
          pdfCreatedAt: new Date(),
          customerAddress,
          customerAddressSource:
            existingAddress && existingAddress !== ".." ? "order" :
            customerAddress !== ".." ? "google_places" : "not_found",
        },
        { merge: true }
      );
      logger.info("Test invoice email sent", { invoiceId, recipientEmail });
    } catch (error) {
      const errorMessage = String(error?.message || error);
      await snap.ref.set(
        {
          testEmailSent: false,
          testEmailError: errorMessage,
          testEmailErrorAt: new Date(),
        },
        { merge: true }
      );
      logger.error("Failed to send test invoice email", {
        invoiceId,
        recipientEmail,
        error: errorMessage,
      });
      throw error;
    }
  }
);

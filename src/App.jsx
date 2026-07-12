import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import "./App.css";
import ProductEditScreen from "./ProductEditScreen";
import OrdersScreen from "./OrdersScreen";
import HolidayDashboard from "./holidays/HolidayDashboard";

import {
  mainAuth,
  mainDb,
  vehicleCheckDb,
} from "./firebase";

const auth = mainAuth;
const db = mainDb;

const DEFAULT_ALLOWANCE = 28;
const PRODUCT_BATCH_SIZE = 24;

function firstNonEmpty(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return "";
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();

  if (typeof value === "object") {
    if (value.seconds !== undefined) {
      return Number(value.seconds) * 1000;
    }

    if (value._seconds !== undefined) {
      return Number(value._seconds) * 1000;
    }
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const milliseconds = toMillis(value);
  return milliseconds ? new Date(milliseconds) : null;
}

function formatShortDate(value) {
  const date = parseDate(value);

  if (!date) return "Not set";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateRange(startValue, endValue) {
  const start = formatShortDate(startValue);
  const end = formatShortDate(endValue);

  if (start === "Not set" && end === "Not set") return "Dates not set";
  return `${start} – ${end}`;
}

function isRecent(value, days = 7) {
  const milliseconds = toMillis(value);
  if (!milliseconds) return false;

  return (
    Date.now() - milliseconds <=
    days * 24 * 60 * 60 * 1000
  );
}

function normaliseStatus(value) {
  return String(value || "Pending")
    .trim()
    .toLowerCase();
}

function formatNameFromEmail(email) {
  if (!email) return "";

  return String(email)
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function getInitials(value) {
  return (
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"
  );
}

function extractImageUrl(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) return "";

    if (
      trimmedValue.startsWith("http://") ||
      trimmedValue.startsWith("https://") ||
      trimmedValue.startsWith("data:") ||
      trimmedValue.startsWith("blob:") ||
      trimmedValue.startsWith("/")
    ) {
      return trimmedValue;
    }

    try {
      return extractImageUrl(JSON.parse(trimmedValue));
    } catch {
      return "";
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractImageUrl(item);

      if (url) return url;
    }

    return "";
  }

  if (typeof value === "object") {
    return (
      extractImageUrl(value.url) ||
      extractImageUrl(value.imageUrl) ||
      extractImageUrl(value.src) ||
      extractImageUrl(value.downloadURL) ||
      extractImageUrl(value.publicUrl) ||
      extractImageUrl(value.file) ||
      extractImageUrl(value.asset) ||
      extractImageUrl(value.images)
    );
  }

  return "";
}

function getProductImage(data) {
  return (
    extractImageUrl(data.imageUrl) ||
    extractImageUrl(data.image) ||
    extractImageUrl(data.images) ||
    extractImageUrl(data.photo) ||
    extractImageUrl(data.photos) ||
    extractImageUrl(data.thumbnail) ||
    ""
  );
}

function normaliseCategory(documentSnapshot) {
  const data = documentSnapshot.data();

  return {
    id: documentSnapshot.id,
    name: firstNonEmpty(
      data.name,
      data.title,
      data.category,
      documentSnapshot.id
    ),
    department: firstNonEmpty(
      data.department,
      data.group,
      data.section,
      "Unassigned"
    ),
  };
}

function normaliseProduct(documentSnapshot) {
  const data = documentSnapshot.data();

  const netPrice = firstNonEmpty(
    data?.pricing?.net,
    data?.pricing?.trade,
    data.netPrice,
    data.net,
    data.price,
    0
  );

  const retailPrice = firstNonEmpty(
    data?.pricing?.retail,
    data.retailPrice,
    data.retail,
    data.price,
    netPrice,
    0
  );

  const stockValue = firstNonEmpty(
    data?.stock?.inStock,
    typeof data.stock === "number" ? data.stock : undefined,
    data.qty,
    data.quantity,
    0
  );

  return {
    id: documentSnapshot.id,
    name: firstNonEmpty(
      data.name,
      data.title,
      "Untitled Product"
    ),
    sku: firstNonEmpty(
      data.sku,
      data.code,
      data.productCode,
      documentSnapshot.id
    ),
    barcode: firstNonEmpty(
      data.barcode,
      data.ean,
      data.upc,
      data.scanCode,
      data.barCode,
      ""
    ),
    categoryId: firstNonEmpty(
      data.categoryId,
      data.category_id,
      ""
    ),
    categoryName: firstNonEmpty(
      data.category,
      data.categoryName,
      data.category_name,
      ""
    ),
    netPrice: toNumber(netPrice, 0),
    retailPrice: toNumber(retailPrice, toNumber(netPrice, 0)),
    discountPercent: toNumber(
      firstNonEmpty(
        data?.pricing?.discountPercent,
        data.discountPercent,
        data.discountPercentage,
        0
      ),
      0
    ),
    discountPrice: toNumber(
      firstNonEmpty(
        data?.pricing?.discount,
        data.discountPrice,
        data.discount,
        0
      ),
      0
    ),
    stock: toNumber(stockValue, 0),
    image: getProductImage(data),
    description: firstNonEmpty(
      data.description,
      data.details,
      data.summary,
      ""
    ),
    createdAt: data.createdAt || data.created_at || null,
    updatedAt: data.updatedAt || data.updated_at || null,
  };
}

function normaliseHolidayRequest(documentSnapshot) {
  const data =
    typeof documentSnapshot?.data === "function"
      ? documentSnapshot.data()
      : documentSnapshot || {};

  const id = documentSnapshot?.id || data.id || "";

  const startDate =
    data.firstDayOff ??
    data.startDate ??
    data.firstDate ??
    null;

  const endDate =
    data.lastDayOff ??
    data.endDate ??
    data.lastDate ??
    null;

  const storedDays = Number(
    firstNonEmpty(
      data.totalWorkingDaysAbsent,
      data.workingDays,
      data.totalDays,
      0
    )
  );

  return {
    id,
    ...data,
    uid: firstNonEmpty(
      data.uid,
      data.userId,
      data.employeeUid,
      ""
    ),
    employeeName: firstNonEmpty(
      data.employeeName,
      data.userName,
      data.displayName,
      data.name,
      data.userEmail,
      "Employee"
    ),
    startDate,
    endDate,
    firstDayOff: startDate,
    lastDayOff: endDate,
    workingDays: Number.isFinite(storedDays)
      ? Math.max(storedDays, 0)
      : 0,
    status: data.status || "Pending",
    dateOfRequest:
      data.dateOfRequest ??
      data.requestDate ??
      data.createdAt ??
      null,
  };
}

function App() {
  const [activeView, setActiveView] = useState("products");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [holidayRequests, setHolidayRequests] = useState([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeDepartment, setActiveDepartment] = useState("All Departments");
  const [sortMode, setSortMode] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PRODUCT_BATCH_SIZE);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [toastMessage, setToastMessage] = useState("");

  const [appVersion, setAppVersion] = useState("DEV");
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);

  const version = appVersion;

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timeout = window.setTimeout(() => {
      setToastMessage("");
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setAuthLoading(false);
      },
      (error) => {
        console.error("Authentication listener failed:", error);
        setAuthLoading(false);
        setLoginError(
          error?.message || "Unable to check the Firebase session."
        );
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setUserProfile(null);
      return undefined;
    }

    const userReference = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      userReference,
      async (snapshot) => {
        if (snapshot.exists()) {
          setUserProfile({
            id: snapshot.id,
            ...snapshot.data(),
          });
          return;
        }

        const displayName =
          user.displayName ||
          formatNameFromEmail(user.email) ||
          "User";

        const profile = {
          uid: user.uid,
          displayName,
          name: displayName,
          email: user.email || "",
          annualAllowance: DEFAULT_ALLOWANCE,
          holidayAllowance: DEFAULT_ALLOWANCE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        try {
          await setDoc(userReference, profile, { merge: true });

          setUserProfile({
            id: user.uid,
            ...profile,
          });
        } catch (error) {
          console.error("Profile creation failed:", error);

          setUserProfile({
            id: user.uid,
            ...profile,
          });
        }
      },
      (error) => {
        console.error("Profile listener failed:", error);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!user) {
      setCategories([]);
      setProducts([]);
      setHolidayRequests([]);
      setDataLoading(false);
      return undefined;
    }

    setDataLoading(true);
    setDataError("");

    const unsubscribeCategories = onSnapshot(
      collection(db, "categories"),
      (snapshot) => {
        setCategories(snapshot.docs.map(normaliseCategory));
      },
      (error) => {
        console.error("Category listener failed:", error);
        setDataError(
          error?.message || "Categories could not be loaded."
        );
      }
    );

    const unsubscribeProducts = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        setProducts(snapshot.docs.map(normaliseProduct));
        setDataLoading(false);
      },
      (error) => {
        console.error("Product listener failed:", error);
        setDataError(
          error?.message || "Products could not be loaded."
        );
        setDataLoading(false);
      }
    );

    const unsubscribeHolidays = onSnapshot(
      collection(vehicleCheckDb, "holidayRequests"),
      (snapshot) => {
        setHolidayRequests(
          snapshot.docs.map(normaliseHolidayRequest)
        );
      },
      (error) => {
        console.error("Holiday listener failed:", error);
      }
    );

    return () => {
      unsubscribeCategories();
      unsubscribeProducts();
      unsubscribeHolidays();
    };
  }, [user]);

  useEffect(() => {
    async function loadVersion() {
      try {
        if (window.electronAPI?.getVersion) {
          const loadedVersion =
            await window.electronAPI.getVersion();

          if (loadedVersion) {
            setAppVersion(loadedVersion);
            return;
          }
        }

        if (window.electronAPI?.version) {
          setAppVersion(window.electronAPI.version);
        }
      } catch (error) {
        console.warn("Could not read app version:", error);
      }
    }

    loadVersion();
  }, []);

  useEffect(() => {
    if (!window.electronUpdater) return undefined;

    window.electronUpdater.onUpdateMessage?.((message) => {
      const safeMessage = String(message || "");
      const lowerMessage = safeMessage.toLowerCase();

      setUpdateMessage(safeMessage);

      if (
        lowerMessage.includes("checking") ||
        lowerMessage.includes("downloading")
      ) {
        setUpdateDownloading(true);
      }

      if (
        lowerMessage.includes("downloaded") ||
        lowerMessage.includes("ready to install") ||
        lowerMessage.includes("update ready")
      ) {
        setUpdateDownloading(false);
        setUpdateReady(true);
      }

      if (
        lowerMessage.includes("up to date") ||
        lowerMessage.includes("no update")
      ) {
        setUpdateDownloading(false);
      }
    });

    return undefined;
  }, []);

  const categoryMap = useMemo(() => {
    const map = new Map();

    categories.forEach((category) => {
      map.set(category.id, category);
      map.set(
        String(category.name || "").toLowerCase(),
        category
      );
    });

    return map;
  }, [categories]);

  const productsWithCategory = useMemo(() => {
    return products.map((product) => {
      const category =
        categoryMap.get(product.categoryId) ||
        categoryMap.get(
          String(product.categoryName || "").toLowerCase()
        );

      return {
        ...product,
        resolvedCategoryId: category?.id || "",
        resolvedCategoryName:
          category?.name ||
          product.categoryName ||
          "Uncategorised",
        resolvedDepartment:
          category?.department || "Unassigned",
      };
    });
  }, [products, categoryMap]);

  const departments = useMemo(() => {
    const values = new Set(
      categories
        .map((category) => category.department)
        .filter(Boolean)
    );

    return [
      "All Departments",
      ...Array.from(values).sort((first, second) =>
        String(first).localeCompare(String(second))
      ),
    ];
  }, [categories]);

  const categoryButtons = useMemo(() => {
    return categories
      .map((category) => ({
        ...category,
        count: productsWithCategory.filter(
          (product) =>
            product.resolvedCategoryId === category.id
        ).length,
      }))
      .sort((first, second) =>
        String(first.name).localeCompare(String(second.name))
      );
  }, [categories, productsWithCategory]);

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();

    const result = productsWithCategory.filter((product) => {
      const matchesDepartment =
        activeDepartment === "All Departments" ||
        product.resolvedDepartment === activeDepartment;

      const matchesCategory =
        activeCategory === "all" ||
        product.resolvedCategoryId === activeCategory;

      const matchesSearch =
        !search ||
        [
          product.name,
          product.sku,
          product.barcode,
          product.resolvedCategoryName,
          product.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

      return (
        matchesDepartment &&
        matchesCategory &&
        matchesSearch
      );
    });

    return result.sort((first, second) => {
      if (sortMode === "name") {
        return String(first.name).localeCompare(String(second.name));
      }

      if (sortMode === "price-low") {
        return first.retailPrice - second.retailPrice;
      }

      if (sortMode === "price-high") {
        return second.retailPrice - first.retailPrice;
      }

      if (sortMode === "stock-high") {
        return second.stock - first.stock;
      }

      return (
        Math.max(
          toMillis(second.updatedAt),
          toMillis(second.createdAt)
        ) -
        Math.max(
          toMillis(first.updatedAt),
          toMillis(first.createdAt)
        )
      );
    });
  }, [
    productsWithCategory,
    activeDepartment,
    activeCategory,
    productSearch,
    sortMode,
  ]);

  useEffect(() => {
    setVisibleCount(PRODUCT_BATCH_SIZE);
  }, [
    productSearch,
    activeCategory,
    activeDepartment,
    sortMode,
  ]);

  const displayedProducts = filteredProducts.slice(
    0,
    visibleCount
  );

  const currentUserHolidayRequests = useMemo(() => {
    if (!user?.uid) return [];

    return holidayRequests
      .filter(
        (request) =>
          String(request.uid || "") === String(user.uid)
      )
      .sort(
        (first, second) =>
          toMillis(second.dateOfRequest) -
          toMillis(first.dateOfRequest)
      );
  }, [holidayRequests, user?.uid]);

  const approvedUserRequests = useMemo(() => {
    return currentUserHolidayRequests.filter(
      (request) =>
        normaliseStatus(request.status) === "approved"
    );
  }, [currentUserHolidayRequests]);

  const pendingUserRequests = useMemo(() => {
    return currentUserHolidayRequests.filter(
      (request) =>
        normaliseStatus(request.status) === "pending"
    );
  }, [currentUserHolidayRequests]);

  const annualAllowance = toNumber(
    firstNonEmpty(
      userProfile?.annualAllowance,
      userProfile?.holidayAllowance,
      userProfile?.allowance,
      DEFAULT_ALLOWANCE
    ),
    DEFAULT_ALLOWANCE
  );

  const usedHolidayDays = approvedUserRequests.reduce(
    (total, request) => total + request.workingDays,
    0
  );

  const pendingHolidayDays = pendingUserRequests.reduce(
    (total, request) => total + request.workingDays,
    0
  );

  const remainingHolidayDays = Math.max(
    annualAllowance - usedHolidayDays,
    0
  );

  const latestHolidayRequest =
    currentUserHolidayRequests[0] || null;

  const displayName =
    userProfile?.displayName ||
    userProfile?.name ||
    user?.displayName ||
    formatNameFromEmail(user?.email) ||
    user?.email ||
    "Admin User";

  const stockValue = productsWithCategory.reduce(
    (total, product) =>
      total + product.stock * product.netPrice,
    0
  );

  const formattedStockValue = new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency: "GBP",
    }
  ).format(stockValue);

  const imageCount = productsWithCategory.filter(
    (product) => Boolean(product.image)
  ).length;

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");

    try {
      setLoginLoading(true);
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
    } catch (error) {
      setLoginError(
        error?.message || "Firebase login failed."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (error) {
      setToastMessage(
        error?.message || "Could not sign out."
      );
    }
  }

  function navigate(view) {
    setSidebarOpen(false);

    if (
      view === "reports" ||
      view === "analytics" ||
      view === "users" ||
      view === "settings" ||
      view === "vehicle"
    ) {
      setToastMessage(
        `${view.charAt(0).toUpperCase() + view.slice(1)} is not connected yet.`
      );
      return;
    }

    setActiveView(view);
  }

  function handleCheckForUpdates() {
    if (!window.electronUpdater?.checkForUpdates) {
      setToastMessage(
        "The updater is unavailable in browser development mode."
      );
      return;
    }

    setUpdateReady(false);
    setUpdateDownloading(true);
    setUpdateMessage("Checking for updates...");
    window.electronUpdater.checkForUpdates();
  }

  function handleInstallUpdate() {
    if (window.electronUpdater?.quitAndInstall) {
      window.electronUpdater.quitAndInstall();
      return;
    }

    if (window.electronUpdater?.installUpdate) {
      window.electronUpdater.installUpdate();
      return;
    }

    setToastMessage(
      "The update is ready, but the install method is unavailable."
    );
  }

  function openNewProductEditor() {
    setSelectedProduct({
      id: null,
      name: "",
      sku: "",
      barcode: "",
      image: "",
      stock: 0,
      netPrice: 0,
      retailPrice: 0,
      discountPrice: 0,
      discountPercent: 0,
      categoryId: "",
      categoryName: "",
      resolvedCategoryName: "",
    });

    setEditForm({
      name: "",
      sku: "",
      barcode: "",
      category: "",
      netPrice: "",
      retailPrice: "",
      discountPrice: "",
      discountPercent: "",
      stock: "0",
      image: "",
      description: "",
    });
  }

  function openProductEditor(product) {
    setSelectedProduct(product);

    setEditForm({
      name: product.name || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      category: product.resolvedCategoryName || "",
      netPrice: String(product.netPrice ?? ""),
      retailPrice: String(product.retailPrice ?? ""),
      discountPrice: String(product.discountPrice ?? ""),
      discountPercent: String(product.discountPercent ?? ""),
      stock: String(product.stock ?? ""),
      image: product.image || "",
      description: product.description || "",
    });
  }

  function closeProductEditor() {
    setSelectedProduct(null);
    setEditForm(null);
  }

  function updateEditField(field, value) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSaveProduct() {
    if (!editForm) return;

    const categoryName = String(editForm.category || "").trim();

    const matchedCategory = categories.find(
      (category) =>
        String(category.name || "").trim().toLowerCase() ===
        categoryName.toLowerCase()
    );

    const retailPrice = toNumber(editForm.retailPrice, 0);
    const discountPercent = Math.min(
      Math.max(toNumber(editForm.discountPercent, 0), 0),
      100
    );

    const calculatedDiscountPrice = Number(
      (
        retailPrice -
        retailPrice * (discountPercent / 100)
      ).toFixed(2)
    );

    const payload = {
      name: String(editForm.name || "").trim(),
      sku: String(editForm.sku || "").trim(),
      barcode: String(editForm.barcode || "").trim(),
      description: String(editForm.description || "").trim(),
      category: categoryName,
      categoryName,
      categoryId: matchedCategory?.id || "",
      netPrice: toNumber(editForm.netPrice, 0),
      retailPrice,
      discountPrice: calculatedDiscountPrice,
      discountPercent,
      price: retailPrice,
      pricing: {
        net: toNumber(editForm.netPrice, 0),
        retail: retailPrice,
        discount: calculatedDiscountPrice,
        discountPercent,
      },
      imageUrl: String(editForm.image || "").trim(),
      image: String(editForm.image || "").trim(),
      stock: {
        inStock: toNumber(editForm.stock, 0),
      },
      updatedAt: serverTimestamp(),
    };

    try {
      setSaveLoading(true);

      if (selectedProduct?.id) {
        await updateDoc(
          doc(db, "products", selectedProduct.id),
          payload
        );

        setToastMessage("Product updated successfully.");
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        setToastMessage("Product created successfully.");
      }

      closeProductEditor();
    } catch (error) {
      setToastMessage(
        error?.message || "The product could not be saved."
      );
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleAddCategory(name) {
    const cleanName = String(name || "")
      .trim()
      .replace(/\s+/g, " ");

    if (!cleanName) {
      throw new Error("Enter a category name.");
    }

    const existing = categories.find(
      (category) =>
        String(category.name || "").toLowerCase() ===
        cleanName.toLowerCase()
    );

    if (existing) {
      setEditForm((current) => ({
        ...current,
        category: existing.name,
      }));

      return existing;
    }

    const documentId =
      cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") ||
      `category-${Date.now()}`;

    await setDoc(
      doc(db, "categories", documentId),
      {
        name: cleanName,
        title: cleanName,
        department: "Unassigned",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.email || "Unknown",
      },
      { merge: true }
    );

    setEditForm((current) => ({
      ...current,
      category: cleanName,
    }));

    return {
      id: documentId,
      name: cleanName,
      department: "Unassigned",
    };
  }

  if (selectedProduct && editForm) {
    return (
      <ProductEditScreen
        product={selectedProduct}
        mode={selectedProduct.id ? "edit" : "create"}
        form={editForm}
        onChange={updateEditField}
        onBack={closeProductEditor}
        onSave={handleSaveProduct}
        onAddCategory={handleAddCategory}
        saveLoading={saveLoading}
        categories={categories}
        primaryButtonStyle={primaryButtonStyle}
        secondaryButtonStyle={secondaryButtonStyle}
        sectionEyebrowStyle={sectionEyebrowStyle}
        productCardStyle={productCardStyle}
        productImageWrapStyle={productImageWrapStyle}
        productImageStyle={productImageStyle}
        outOfStockBadgeStyle={outOfStockBadgeStyle}
        stockBadgeStyle={stockBadgeStyle}
        productCategoryStyle={productCategoryStyle}
        priceGridStyle={priceGridStyle}
        netPriceBoxStyle={netPriceBoxStyle}
        priceLabelStyle={priceLabelStyle}
        priceValueStyle={priceValueStyle}
        retailPriceBoxStyle={retailPriceBoxStyle}
      />
    );
  }

  if (activeView === "orders") {
    return (
      <OrdersScreen
        onBack={() => setActiveView("products")}
        user={user}
        version={version}
      />
    );
  }

  if (activeView === "holidays") {
    return (
      <HolidayDashboard
        onBack={() => setActiveView("products")}
      />
    );
  }

  if (authLoading) {
    return (
      <FullScreenMessage
        title="Loading NAB Admin"
        subtitle="Checking your secure Firebase session..."
      />
    );
  }

  if (!user) {
    return (
      <LoginScreen
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        loginError={loginError}
        loginLoading={loginLoading}
        onSubmit={handleLogin}
        version={version}
      />
    );
  }

  return (
    <div className="nab-app">
      <style>{appStyles}</style>

      <aside
        className={
          sidebarOpen
            ? "nab-sidebar open"
            : "nab-sidebar"
        }
      >
        <div className="nab-brand">
          <img
            src="/NAB.logo.png"
            alt="NAB Parts Store"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.nextElementSibling.style.display = "block";
            }}
          />

          <div className="nab-brand-fallback">
            <strong>NAB</strong>
            <span>PARTS STORE</span>
          </div>
        </div>

        <SidebarSection title="STORE">
          <SidebarButton
            active
            icon="⬡"
            label="Products"
            count={productsWithCategory.length}
            onClick={() => navigate("products")}
          />

          <SidebarButton
            icon="🛒"
            label="Orders"
            onClick={() => navigate("orders")}
          />

          <SidebarButton
            icon="▣"
            label="Holiday Dashboard"
            count={pendingUserRequests.length || null}
            onClick={() => navigate("holidays")}
          />

          <SidebarButton
            icon="◇"
            label="Daily Vehicle Check"
            onClick={() => navigate("vehicle")}
          />
        </SidebarSection>

        <SidebarSection title="MANAGEMENT">
          <SidebarButton
            icon="▥"
            label="Reports"
            onClick={() => navigate("reports")}
          />

          <SidebarButton
            icon="◔"
            label="Analytics"
            onClick={() => navigate("analytics")}
          />

          <SidebarButton
            icon="♙"
            label="User Management"
            onClick={() => navigate("users")}
          />

          <SidebarButton
            icon="⚙"
            label="Settings"
            onClick={() => navigate("settings")}
          />
        </SidebarSection>

        <div className="nab-sidebar-spacer" />

        <section className="nab-system-card">
          <div>
            <span className="nab-status-dot" />
            <strong>System Status</strong>
          </div>
          <p>All systems operational</p>
        </section>

        <section
          className={
            updateReady
              ? "nab-update-card ready"
              : "nab-update-card"
          }
        >
          <span>APP UPDATE</span>
          <strong>
            {updateReady
              ? "Update ready"
              : updateDownloading
              ? "Checking..."
              : `Version ${version}`}
          </strong>

          <p>
            {updateMessage ||
              "Check Firebase Hosting for the latest app release."}
          </p>

          <button
            type="button"
            onClick={
              updateReady
                ? handleInstallUpdate
                : handleCheckForUpdates
            }
          >
            {updateReady
              ? "Install Update"
              : "Check Updates"}
          </button>
        </section>

        <button
          type="button"
          className="nab-logout"
          onClick={handleLogout}
        >
          <span>⇥</span>
          Logout
        </button>
      </aside>

      <div
        className={
          sidebarOpen
            ? "nab-sidebar-backdrop visible"
            : "nab-sidebar-backdrop"
        }
        onClick={() => setSidebarOpen(false)}
      />

      <div className="nab-main">
        <header className="nab-header">
          <button
            type="button"
            className="nab-mobile-menu"
            onClick={() =>
              setSidebarOpen((current) => !current)
            }
          >
            ☰
          </button>

          <div className="nab-global-search">
            <span>⌕</span>

            <input
              type="search"
              value={productSearch}
              onChange={(event) =>
                setProductSearch(event.target.value)
              }
              placeholder="Search products, SKU, barcode or category..."
            />

            <kbd>Ctrl K</kbd>
          </div>

        </header>

        <div className="nab-header-actions-row">
          <div className="nab-header-actions">
            <button
              type="button"
              className="nab-header-pill"
              onClick={() => setProductSearch("")}
            >
              <span className="nab-status-dot" />
              Live Products
              <strong>{productsWithCategory.length}</strong>
            </button>

            <button
              type="button"
              className="nab-header-pill"
              onClick={() => navigate("holidays")}
            >
              ▣ Holiday Requests
              {pendingUserRequests.length > 0 && (
                <strong className="nab-warning-count">
                  {pendingUserRequests.length}
                </strong>
              )}
            </button>

            <button
              type="button"
              className="nab-header-pill"
              onClick={
                updateReady
                  ? handleInstallUpdate
                  : handleCheckForUpdates
              }
            >
              ◇{" "}
              {updateReady
                ? "Update Ready"
                : updateDownloading
                ? "Checking"
                : "Updates"}
            </button>

            <div className="nab-profile">
              <div className="nab-avatar">
                {getInitials(displayName)}
              </div>

              <div>
                <strong>{displayName}</strong>
                <span>{user.email}</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="nab-top-tabs">
          <button type="button" className="active">
            ⬡ Products
          </button>

          <button
            type="button"
            onClick={() => navigate("orders")}
          >
            🛒 Orders
          </button>

          <button
            type="button"
            onClick={() => navigate("holidays")}
          >
            ▣ Holiday Dashboard
          </button>

          <button
            type="button"
            onClick={() => navigate("vehicle")}
          >
            ◇ Daily Vehicle Check
          </button>
        </nav>

        {dataError && (
          <div className="nab-error-banner">
            {dataError}
          </div>
        )}

        <main className="nab-content">
          <section className="nab-content-main">
            <div className="nab-page-heading">
              <div>
                <span>LIVE FIREBASE CATALOGUE</span>
                <h1>Products Overview</h1>
                <p>
                  Manage your product catalogue, inventory,
                  categories and pricing.
                </p>
              </div>

              <button
                type="button"
                className="nab-primary-button"
                onClick={openNewProductEditor}
              >
                + New Product
              </button>
            </div>

            <section className="nab-stats-grid">
              <MetricCard
                icon="⬡"
                type="blue"
                label="Stock Value (Net)"
                value={formattedStockValue}
                detail={`${productsWithCategory.length} live products`}
              />

              <MetricCard
                icon="▱"
                type="purple"
                label="Categories"
                value={categories.length}
                detail={`${departments.length - 1} departments`}
              />

              <MetricCard
                icon="□"
                type="green"
                label="Live Products"
                value={productsWithCategory.length}
                detail={`${filteredProducts.length} in current view`}
              />

              <MetricCard
                icon="▧"
                type="orange"
                label="Images"
                value={imageCount}
                detail={`${Math.max(
                  productsWithCategory.length - imageCount,
                  0
                )} missing images`}
              />
            </section>

            <section className="nab-product-panel">
              <div className="nab-filter-row">
                <div className="nab-inline-search">
                  <span>⌕</span>
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(event) =>
                      setProductSearch(event.target.value)
                    }
                    placeholder="Search by product name, SKU or barcode..."
                  />
                </div>

                <select
                  value={activeDepartment}
                  onChange={(event) => {
                    setActiveDepartment(event.target.value);
                    setActiveCategory("all");
                  }}
                >
                  {departments.map((department) => (
                    <option
                      key={department}
                      value={department}
                    >
                      {department}
                    </option>
                  ))}
                </select>

                <select
                  value={sortMode}
                  onChange={(event) =>
                    setSortMode(event.target.value)
                  }
                >
                  <option value="newest">Newest First</option>
                  <option value="name">Product Name</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="stock-high">Stock: High to Low</option>
                </select>

                <button
                  type="button"
                  className="nab-secondary-button"
                  onClick={() => {
                    setProductSearch("");
                    setActiveCategory("all");
                    setActiveDepartment("All Departments");
                    setSortMode("newest");
                  }}
                >
                  Clear
                </button>
              </div>

              <div className="nab-category-row">
                <button
                  type="button"
                  className={
                    activeCategory === "all"
                      ? "active"
                      : ""
                  }
                  onClick={() => setActiveCategory("all")}
                >
                  All
                  <span>{productsWithCategory.length}</span>
                </button>

                {categoryButtons.slice(0, 14).map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={
                      activeCategory === category.id
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setActiveCategory(category.id);
                      setActiveDepartment(
                        category.department || "All Departments"
                      );
                    }}
                  >
                    {category.name}
                    <span>{category.count}</span>
                  </button>
                ))}
              </div>

              {dataLoading ? (
                <div className="nab-empty-state">
                  Loading products from Firebase...
                </div>
              ) : displayedProducts.length === 0 ? (
                <div className="nab-empty-state">
                  No products match the current search or filters.
                </div>
              ) : (
                <>
                  <div className="nab-product-grid">
                    {displayedProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onOpen={() => openProductEditor(product)}
                      />
                    ))}
                  </div>

                  {visibleCount < filteredProducts.length && (
                    <div className="nab-load-more">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleCount(
                            (current) =>
                              current + PRODUCT_BATCH_SIZE
                          )
                        }
                      >
                        Load More Products
                      </button>

                      <span>
                        Showing {displayedProducts.length} of{" "}
                        {filteredProducts.length}
                      </span>
                    </div>
                  )}
                </>
              )}
            </section>
          </section>

          <aside className="nab-right-column">
            <section className="nab-holiday-card">
              <header>
                <div>
                  <span>LIVE</span>
                  <h2>Your Holiday Summary</h2>
                </div>

                <span className="nab-live-badge">
                  <span className="nab-status-dot" />
                  Live
                </span>
              </header>

              <div className="nab-holiday-values">
                <HolidayValue
                  label="Allowance"
                  value={annualAllowance}
                  type="blue"
                />

                <HolidayValue
                  label="Used"
                  value={usedHolidayDays}
                  type="orange"
                />

                <HolidayValue
                  label="Remaining"
                  value={remainingHolidayDays}
                  type="green"
                />
              </div>

              <div className="nab-holiday-progress">
                <div
                  style={{
                    width: `${Math.min(
                      annualAllowance > 0
                        ? (usedHolidayDays / annualAllowance) * 100
                        : 0,
                      100
                    )}%`,
                  }}
                />
              </div>

              <div className="nab-latest-request">
                <div className="nab-latest-heading">
                  <span>Latest Request</span>

                  {latestHolidayRequest && (
                    <StatusBadge
                      status={latestHolidayRequest.status}
                    />
                  )}
                </div>

                {latestHolidayRequest ? (
                  <>
                    <strong>
                      {latestHolidayRequest.reason ||
                        "Holiday request"}
                    </strong>

                    <p>
                      {formatDateRange(
                        latestHolidayRequest.startDate,
                        latestHolidayRequest.endDate
                      )}{" "}
                      ({latestHolidayRequest.workingDays}{" "}
                      {latestHolidayRequest.workingDays === 1
                        ? "day"
                        : "days"})
                    </p>
                  </>
                ) : (
                  <p>No holiday requests have been submitted.</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => navigate("holidays")}
              >
                ▣ View Holiday Dashboard
              </button>
            </section>

            <section className="nab-recent-card">
              <header>
                <h2>Recent Holiday Requests</h2>

                <button
                  type="button"
                  onClick={() => navigate("holidays")}
                >
                  View All
                </button>
              </header>

              {currentUserHolidayRequests.length === 0 ? (
                <p className="nab-card-empty">
                  No requests found.
                </p>
              ) : (
                <div className="nab-request-list">
                  {currentUserHolidayRequests
                    .slice(0, 5)
                    .map((request) => (
                      <article key={request.id}>
                        <div className="nab-request-icon">▣</div>

                        <div>
                          <strong>
                            {request.reason ||
                              "Holiday request"}
                          </strong>

                          <span>
                            {formatDateRange(
                              request.startDate,
                              request.endDate
                            )}
                          </span>
                        </div>

                        <StatusBadge status={request.status} />
                      </article>
                    ))}
                </div>
              )}
            </section>

            <section className="nab-quick-card">
              <h2>Quick Actions</h2>

              <button
                type="button"
                onClick={openNewProductEditor}
              >
                <span>＋</span>
                Add New Product
              </button>

              <button
                type="button"
                onClick={() =>
                  setToastMessage(
                    "Product import is not connected yet."
                  )
                }
              >
                <span>⇧</span>
                Import Products
              </button>

              <button
                type="button"
                onClick={() =>
                  setToastMessage(
                    "Product export is not connected yet."
                  )
                }
              >
                <span>⇩</span>
                Export Products
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveCategory("all");
                  setActiveDepartment("All Departments");
                  setToastMessage(
                    "All categories are now visible."
                  );
                }}
              >
                <span>⌕</span>
                Manage Categories
              </button>
            </section>

            {pendingHolidayDays > 0 && (
              <section className="nab-pending-card">
                <span>PENDING HOLIDAY DAYS</span>
                <strong>{pendingHolidayDays}</strong>
                <p>
                  Pending days are not deducted until approved.
                </p>
              </section>
            )}
          </aside>
        </main>

        {toastMessage && (
          <div className="nab-toast">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarSection({ title, children }) {
  return (
    <section className="nab-sidebar-section">
      <span>{title}</span>
      <div>{children}</div>
    </section>
  );
}

function SidebarButton({
  active = false,
  icon,
  label,
  count,
  onClick,
}) {
  return (
    <button
      type="button"
      className={
        active
          ? "nab-sidebar-button active"
          : "nab-sidebar-button"
      }
      onClick={onClick}
    >
      <span className="nab-sidebar-icon">{icon}</span>
      <span>{label}</span>

      {count !== undefined &&
        count !== null &&
        count !== 0 && <strong>{count}</strong>}
    </button>
  );
}

function MetricCard({
  icon,
  type,
  label,
  value,
  detail,
}) {
  return (
    <article className="nab-metric-card">
      <div className={`nab-metric-icon ${type}`}>
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function ProductCard({ product, onOpen }) {
  const hasDiscount =
    product.discountPercent > 0 &&
    product.discountPrice > 0;

  return (
    <article
      className="nab-product-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="nab-product-image">
        <div className="nab-product-image-frame">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.display = "none";

                const placeholder =
                  event.currentTarget.parentElement?.querySelector(
                    ".nab-image-error"
                  );

                if (placeholder) {
                  placeholder.style.display = "grid";
                }
              }}
            />
          ) : null}

          <div
            className={
              product.image
                ? "nab-image-placeholder nab-image-error"
                : "nab-image-placeholder"
            }
          >
            <span>▧</span>
            {product.image
              ? "Image unavailable"
              : "No image"}
          </div>
        </div>

        {isRecent(product.createdAt) && (
          <span className="nab-new-badge">
            NEW
          </span>
        )}

        <span
          className={
            product.stock > 0
              ? "nab-stock-badge"
              : "nab-stock-badge out"
          }
        >
          {product.stock > 0
            ? `In Stock (${product.stock})`
            : "Out of Stock"}
        </span>
      </div>

      <div className="nab-product-body">
        <div className="nab-product-title-row">
          <div>
            <span className="nab-product-category">
              {product.resolvedCategoryName}
            </span>

            <h3 title={product.name}>
              {product.name}
            </h3>
          </div>

          <span className="nab-product-menu">
            ⋮
          </span>
        </div>

        <div className="nab-product-meta">
          <span title={product.sku}>
            SKU: {product.sku || "Not set"}
          </span>

          <span title={product.barcode}>
            Barcode: {product.barcode || "Not set"}
          </span>
        </div>

        {product.description && (
          <p className="nab-product-description">
            {product.description}
          </p>
        )}

        <div className="nab-product-pricing">
          <div>
            <span>Net</span>
            <strong>
              £{product.netPrice.toFixed(2)}
            </strong>
          </div>

          <div>
            <span>Retail</span>
            <strong>
              £{product.retailPrice.toFixed(2)}
            </strong>
          </div>
        </div>

        {hasDiscount && (
          <div className="nab-discount-row">
            <span>
              Discount {product.discountPercent}%
            </span>

            <strong>
              £{product.discountPrice.toFixed(2)}
            </strong>
          </div>
        )}

        <footer>
          <span>
            Added: {formatShortDate(product.createdAt)}
          </span>

          <span className="nab-favourite">
            ★
          </span>
        </footer>
      </div>
    </article>
  );
}

function HolidayValue({ label, value, type }) {
  return (
    <div className={`nab-holiday-value ${type}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>days</small>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalised = normaliseStatus(status);

  return (
    <span className={`nab-request-status ${normalised}`}>
      {status || "Pending"}
    </span>
  );
}

function LoginScreen({
  email,
  password,
  setEmail,
  setPassword,
  loginError,
  loginLoading,
  onSubmit,
  version,
}) {
  return (
    <div className="nab-login-page">
      <style>{loginStyles}</style>

      <form className="nab-login-card" onSubmit={onSubmit}>
        <div className="nab-login-logo">
          <img
            src="/NAB.logo.png"
            alt="NAB Parts Store"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.nextElementSibling.style.display = "block";
            }}
          />

          <div>
            <strong>NAB</strong>
            <span>PARTS STORE</span>
          </div>
        </div>

        <span>SECURE ADMIN LOGIN</span>
        <h1>Welcome back</h1>
        <p>
          Sign in with Firebase to open the product dashboard.
          Version {version}
        </p>

        <label>Email address</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@example.com"
          autoComplete="email"
          required
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
        />

        {loginError && (
          <div className="nab-login-error">
            {loginError}
          </div>
        )}

        <button
          type="submit"
          disabled={loginLoading}
        >
          {loginLoading
            ? "Signing in..."
            : "Sign In"}
        </button>
      </form>
    </div>
  );
}

function FullScreenMessage({ title, subtitle }) {
  return (
    <div className="nab-login-page">
      <style>{loginStyles}</style>

      <div className="nab-login-card">
        <div className="nab-login-logo">
          <div>
            <strong>NAB</strong>
            <span>PARTS STORE</span>
          </div>
        </div>

        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

const appStyles = `
  * {
    box-sizing: border-box;
  }

  :root {
    color-scheme: light;
  }

  body {
    margin: 0;
  }

  button,
  input,
  select {
    font: inherit;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  .nab-app {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 238px minmax(0, 1fr);
    color: #0f1f3d;
    background: #f4f7fb;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .nab-sidebar {
    position: sticky;
    top: 0;
    z-index: 300;
    height: 100vh;
    padding: 24px 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
    color: #ffffff;
    background:
      radial-gradient(
        circle at 12% 4%,
        rgba(17, 104, 224, .36),
        transparent 32%
      ),
      linear-gradient(
        180deg,
        #061b35 0%,
        #082e59 58%,
        #061b35 100%
      );
    box-shadow: 14px 0 35px rgba(3, 21, 43, .14);
  }

  .nab-brand {
    min-height: 90px;
    padding: 4px 10px 20px;
    border-bottom: 1px solid rgba(255,255,255,.13);
  }

  .nab-brand img {
    display: block;
    width: 100%;
    max-width: 165px;
    max-height: 72px;
    object-fit: contain;
    object-position: left center;
  }

  .nab-brand-fallback {
    display: none;
  }

  .nab-brand-fallback strong {
    display: block;
    color: #ffc400;
    font-size: 45px;
    line-height: .88;
    font-style: italic;
    font-weight: 1000;
    letter-spacing: -3px;
  }

  .nab-brand-fallback span {
    display: block;
    margin-top: 9px;
    font-size: 15px;
    font-weight: 950;
  }

  .nab-sidebar-section {
    display: grid;
    gap: 9px;
  }

  .nab-sidebar-section > span {
    padding: 0 12px;
    color: #87a6c9;
    font-size: 10px;
    font-weight: 950;
    letter-spacing: 1.25px;
  }

  .nab-sidebar-section > div {
    display: grid;
    gap: 6px;
  }

  .nab-sidebar-button {
    width: 100%;
    min-height: 49px;
    padding: 0 12px;
    display: grid;
    grid-template-columns: 27px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid transparent;
    border-radius: 13px;
    color: #dcecff;
    background: transparent;
    text-align: left;
    font-size: 13px;
    font-weight: 850;
    cursor: pointer;
    transition:
      transform .16s ease,
      border-color .16s ease,
      background .16s ease;
  }

  .nab-sidebar-button:hover {
    transform: translateX(2px);
    border-color: rgba(255,255,255,.12);
    background: rgba(255,255,255,.07);
  }

  .nab-sidebar-button.active {
    color: #ffffff;
    border-color: rgba(92,169,255,.45);
    background: linear-gradient(
      135deg,
      #087aff 0%,
      #075bd4 100%
    );
    box-shadow: 0 13px 28px rgba(0, 94, 225, .3);
  }

  .nab-sidebar-button > strong {
    min-width: 23px;
    height: 23px;
    padding: 0 6px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #ffffff;
    background: rgba(255,255,255,.14);
    font-size: 10px;
  }

  .nab-sidebar-icon {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    font-size: 17px;
  }

  .nab-sidebar-spacer {
    flex: 1 1 auto;
  }

  .nab-system-card,
  .nab-update-card {
    padding: 14px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 16px;
    background: rgba(255,255,255,.055);
  }

  .nab-system-card > div {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .nab-system-card p,
  .nab-update-card p {
    margin: 8px 0 0;
    color: #bdd1e7;
    font-size: 11px;
    line-height: 1.45;
  }

  .nab-status-dot {
    width: 9px;
    height: 9px;
    display: inline-block;
    border: 2px solid #ffffff;
    border-radius: 50%;
    background: #22c55e;
  }

  .nab-update-card {
    display: grid;
    gap: 8px;
    background:
      linear-gradient(
        145deg,
        rgba(12, 92, 193, .57),
        rgba(7, 50, 105, .46)
      );
  }

  .nab-update-card.ready {
    border-color: rgba(74,222,128,.4);
    background:
      linear-gradient(
        145deg,
        rgba(13, 116, 67, .62),
        rgba(7, 63, 42, .48)
      );
  }

  .nab-update-card > span {
    color: #9cc7fa;
    font-size: 9px;
    font-weight: 950;
    letter-spacing: .9px;
  }

  .nab-update-card > strong {
    font-size: 13px;
  }

  .nab-update-card button {
    min-height: 39px;
    border: 0;
    border-radius: 11px;
    color: #075bcf;
    background: #ffffff;
    font-size: 12px;
    font-weight: 950;
    cursor: pointer;
  }

  .nab-logout {
    min-height: 46px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 13px;
    color: #ffffff;
    background: transparent;
    font-weight: 900;
    cursor: pointer;
  }

  .nab-logout:hover {
    background: rgba(255,255,255,.08);
  }

  .nab-sidebar-backdrop {
    display: none;
  }

  .nab-main {
    min-width: 0;
    width: 100%;
  }

  .nab-header {
    min-height: 88px;
    padding: 15px 22px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 18px;
    border-bottom: 1px solid #e4eaf2;
    background: rgba(255,255,255,.97);
    box-shadow: 0 10px 28px rgba(15,23,42,.045);
  }

  .nab-mobile-menu {
    display: none;
    width: 44px;
    height: 44px;
    border: 1px solid #dce5f0;
    border-radius: 13px;
    color: #0d2b52;
    background: #ffffff;
    font-weight: 950;
    cursor: pointer;
  }

  .nab-global-search,
  .nab-inline-search {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 11px;
    border: 1px solid #dce5f0;
    background: #ffffff;
  }

  .nab-global-search {
    min-width: 0;
    width: 100%;
    min-height: 55px;
    padding: 0 16px;
    border-radius: 17px;
  }

  .nab-global-search > span,
  .nab-inline-search > span {
    color: #5f7593;
    font-size: 23px;
  }

  .nab-global-search input,
  .nab-inline-search input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    color: #0f1f3d;
    background: transparent;
    font-size: 14px;
    font-weight: 700;
  }

  .nab-global-search input::placeholder,
  .nab-inline-search input::placeholder {
    color: #91a1b7;
  }

  .nab-global-search kbd {
    padding: 5px 8px;
    border: 1px solid #dce5f0;
    border-radius: 8px;
    color: #667a95;
    background: #f8fafc;
    font-family: inherit;
    font-size: 10px;
    white-space: nowrap;
  }

  .nab-header-actions-row {
    padding: 10px 22px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    border-bottom: 1px solid #e4eaf2;
    background: #ffffff;
  }

  .nab-header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    flex-wrap: wrap;
  }

  .nab-header-pill {
    min-height: 42px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid #e1e8f1;
    border-radius: 999px;
    color: #183052;
    background: #ffffff;
    font-size: 11px;
    font-weight: 850;
    cursor: pointer;
    white-space: nowrap;
  }

  .nab-header-pill > strong {
    color: #0868e8;
    font-size: 11px;
  }

  .nab-warning-count {
    min-width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #ffffff !important;
    background: #f59e0b;
  }

  .nab-profile {
    min-width: 0;
    padding-left: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-left: 1px solid #e2e8f0;
  }

  .nab-avatar {
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #ffffff;
    background:
      linear-gradient(
        135deg,
        #0b74ef,
        #072f65
      );
    font-weight: 950;
  }

  .nab-profile > div:last-child {
    min-width: 0;
  }

  .nab-profile strong,
  .nab-profile span {
    max-width: 165px;
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .nab-profile strong {
    font-size: 12px;
  }

  .nab-profile span {
    margin-top: 3px;
    color: #71839b;
    font-size: 10px;
  }

  .nab-top-tabs {
    padding: 11px 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    border-bottom: 1px solid #e4eaf2;
    background: #ffffff;
  }

  .nab-top-tabs button {
    min-height: 41px;
    padding: 0 15px;
    border: 1px solid #e1e8f1;
    border-radius: 12px;
    color: #35506f;
    background: #ffffff;
    font-size: 12px;
    font-weight: 850;
    cursor: pointer;
    white-space: nowrap;
  }

  .nab-top-tabs button.active {
    color: #ffffff;
    border-color: #0671ee;
    background:
      linear-gradient(
        135deg,
        #087aff,
        #075bd4
      );
    box-shadow: 0 8px 18px rgba(0,107,233,.2);
  }

  .nab-error-banner {
    margin: 14px 18px 0;
    padding: 14px 16px;
    border: 1px solid #fecaca;
    border-radius: 14px;
    color: #991b1b;
    background: #fee2e2;
    font-size: 13px;
    font-weight: 800;
  }

  .nab-content {
    padding: 18px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 310px;
    align-items: start;
    gap: 18px;
  }

  .nab-content-main {
    min-width: 0;
  }

  .nab-page-heading {
    min-height: 70px;
    padding: 2px 2px 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .nab-page-heading > div > span {
    color: #0870ed;
    font-size: 10px;
    font-weight: 950;
    letter-spacing: .9px;
  }

  .nab-page-heading h1 {
    margin: 4px 0 3px;
    font-size: clamp(25px, 3vw, 34px);
    letter-spacing: -.8px;
  }

  .nab-page-heading p {
    margin: 0;
    color: #71839b;
    font-size: 12px;
    font-weight: 650;
  }

  .nab-primary-button,
  .nab-secondary-button {
    min-height: 44px;
    padding: 0 15px;
    border-radius: 13px;
    font-size: 12px;
    font-weight: 950;
    cursor: pointer;
  }

  .nab-primary-button {
    border: 0;
    color: #ffffff;
    background:
      linear-gradient(
        135deg,
        #087aff,
        #075bd4
      );
    box-shadow: 0 9px 20px rgba(0,104,230,.2);
  }

  .nab-secondary-button {
    border: 1px solid #dce5f0;
    color: #35506f;
    background: #ffffff;
  }

  .nab-stats-grid {
    display: grid;
    grid-template-columns:
      repeat(4, minmax(0, 1fr));
    gap: 13px;
  }

  .nab-metric-card {
    min-width: 0;
    min-height: 108px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 13px;
    border: 1px solid #e1e8f1;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 9px 24px rgba(15,23,42,.045);
  }

  .nab-metric-icon {
    flex: 0 0 auto;
    width: 45px;
    height: 45px;
    display: grid;
    place-items: center;
    border-radius: 15px;
    color: #ffffff;
    font-size: 20px;
    font-weight: 950;
  }

  .nab-metric-icon.blue {
    background: #0878f5;
  }

  .nab-metric-icon.purple {
    background: #7445e8;
  }

  .nab-metric-icon.green {
    background: #18ad56;
  }

  .nab-metric-icon.orange {
    background: #f5a100;
  }

  .nab-metric-card > div:last-child {
    min-width: 0;
  }

  .nab-metric-card span,
  .nab-metric-card strong,
  .nab-metric-card small {
    display: block;
  }

  .nab-metric-card span {
    color: #667a95;
    font-size: 10px;
    font-weight: 850;
  }

  .nab-metric-card strong {
    margin-top: 5px;
    overflow: hidden;
    color: #102647;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 20px;
    line-height: 1.15;
  }

  .nab-metric-card small {
    margin-top: 6px;
    overflow: hidden;
    color: #16a34a;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 9px;
    font-weight: 750;
  }

  .nab-product-panel {
    margin-top: 16px;
    overflow: hidden;
    border: 1px solid #e1e8f1;
    border-radius: 19px;
    background: #ffffff;
    box-shadow: 0 10px 28px rgba(15,23,42,.05);
  }

  .nab-filter-row {
    padding: 14px;
    display: grid;
    grid-template-columns:
      minmax(240px, 1fr)
      minmax(150px, 190px)
      minmax(150px, 190px)
      auto;
    gap: 10px;
    border-bottom: 1px solid #edf1f6;
  }

  .nab-inline-search {
    min-height: 45px;
    padding: 0 13px;
    border-radius: 13px;
    background: #f8fafc;
  }

  .nab-filter-row select {
    min-width: 0;
    min-height: 45px;
    padding: 0 12px;
    border: 1px solid #dce5f0;
    border-radius: 13px;
    outline: 0;
    color: #284564;
    background: #ffffff;
    font-size: 11px;
    font-weight: 800;
  }

  .nab-category-row {
    padding: 0 14px 13px;
    display: flex;
    gap: 7px;
    overflow-x: auto;
    border-bottom: 1px solid #edf1f6;
  }

  .nab-category-row button {
    min-height: 34px;
    padding: 0 11px;
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid #e1e8f1;
    border-radius: 10px;
    color: #48617e;
    background: #ffffff;
    font-size: 10px;
    font-weight: 850;
    cursor: pointer;
    white-space: nowrap;
  }

  .nab-category-row button span {
    min-width: 19px;
    height: 19px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #64748b;
    background: #eef3f8;
    font-size: 8px;
  }

  .nab-category-row button.active {
    color: #ffffff;
    border-color: #0874ee;
    background: #0874ee;
  }

  .nab-category-row button.active span {
    color: #0874ee;
    background: #ffffff;
  }

  .nab-product-grid {
    padding: 16px;
    display: grid;
    grid-template-columns:
      repeat(auto-fill, minmax(300px, 1fr));
    align-items: stretch;
    gap: 16px;
  }

  .nab-product-card {
    min-width: 0;
    min-height: 410px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid #e1e8f1;
    border-radius: 17px;
    outline: 0;
    background: #ffffff;
    box-shadow: 0 7px 19px rgba(15,23,42,.045);
    cursor: pointer;
    transition:
      transform .16s ease,
      border-color .16s ease,
      box-shadow .16s ease;
  }

  .nab-product-card:hover,
  .nab-product-card:focus-visible {
    transform: translateY(-3px);
    border-color: #a9cef9;
    box-shadow: 0 15px 32px rgba(15,23,42,.1);
  }

  .nab-product-image {
    position: relative;
    flex: 0 0 280px;
    height: 280px;
    padding: 12px;
    overflow: hidden;
    border-bottom: 1px solid #edf1f6;
    background:
      linear-gradient(
        180deg,
        #fbfdff,
        #f5f8fc
      );
  }

  .nab-product-image-frame {
    width: 100%;
    height: 100%;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid #e8edf4;
    border-radius: 13px;
    background: #ffffff;
  }

  .nab-product-image-frame img {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    display: block;
    object-fit: contain !important;
    object-position: center !important;
    background: #ffffff;
  }

  .nab-image-placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
    color: #94a3b8;
    text-align: center;
    font-size: 11px;
    font-weight: 800;
  }

  .nab-image-error {
    display: none;
  }

  .nab-image-placeholder span {
    font-size: 30px;
  }

  .nab-new-badge {
    position: absolute;
    top: 9px;
    left: 9px;
    padding: 5px 7px;
    border-radius: 7px;
    color: #ffffff;
    background: #0874ee;
    font-size: 8px;
    font-weight: 950;
  }

  .nab-stock-badge {
    position: absolute;
    right: 9px;
    bottom: 9px;
    max-width: calc(100% - 18px);
    padding: 5px 8px;
    overflow: hidden;
    border-radius: 999px;
    color: #168743;
    background: #dcf7e5;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 8px;
    font-weight: 900;
  }

  .nab-stock-badge.out {
    color: #b91c1c;
    background: #fee2e2;
  }

  .nab-product-body {
    min-width: 0;
    flex: 1 1 auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
  }

  .nab-product-title-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 9px;
  }

  .nab-product-title-row > div {
    min-width: 0;
  }

  .nab-product-category {
    max-width: 100%;
    display: block;
    overflow: hidden;
    color: #65809e;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 8px;
    line-height: 1.35;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .35px;
  }

  .nab-product-title-row h3 {
    min-height: 42px;
    margin: 5px 0 0;
    overflow: hidden;
    color: #0f2443;
    font-size: 14px;
    line-height: 1.45;
    font-weight: 900;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow-wrap: anywhere;
  }

  .nab-product-menu {
    flex: 0 0 auto;
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: #6a7d94;
    background: #f5f8fb;
    font-size: 18px;
    line-height: 1;
  }

  .nab-product-meta {
    min-width: 0;
    margin-top: 9px;
    display: grid;
    gap: 4px;
    color: #6c7f96;
    font-size: 9px;
    line-height: 1.35;
  }

  .nab-product-meta span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .nab-product-description {
    min-height: 34px;
    margin: 9px 0 0;
    overflow: hidden;
    color: #667a92;
    font-size: 10px;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .nab-product-pricing {
    margin-top: auto;
    padding-top: 12px;
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 9px;
    border-top: 1px solid #e8edf3;
  }

  .nab-product-pricing > div {
    min-width: 0;
    padding: 9px;
    border-radius: 11px;
    background: #f7f9fc;
  }

  .nab-product-pricing > div:last-child {
    background: #eef6ff;
  }

  .nab-product-pricing span {
    display: block;
    color: #70839a;
    font-size: 8px;
    font-weight: 850;
  }

  .nab-product-pricing strong {
    display: block;
    margin-top: 4px;
    overflow: hidden;
    color: #102647;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
  }

  .nab-discount-row {
    margin-top: 8px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-radius: 10px;
    color: #6d28d9;
    background: #f3e8ff;
    font-size: 9px;
    font-weight: 900;
  }

  .nab-product-body footer {
    min-width: 0;
    margin-top: 10px;
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    color: #71839a;
    font-size: 8px;
  }

  .nab-product-body footer > span:first-child {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .nab-favourite {
    color: #f5a100;
    font-size: 15px;
  }

  .nab-load-more {
    padding: 0 14px 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 13px;
  }

  .nab-load-more button {
    min-height: 40px;
    padding: 0 15px;
    border: 0;
    border-radius: 12px;
    color: #ffffff;
    background: #0874ee;
    font-size: 11px;
    font-weight: 950;
    cursor: pointer;
  }

  .nab-load-more span {
    color: #71839a;
    font-size: 10px;
  }

  .nab-empty-state {
    padding: 55px 22px;
    color: #71839a;
    text-align: center;
    font-size: 13px;
    font-weight: 800;
  }

  .nab-right-column {
    min-width: 0;
    display: grid;
    gap: 15px;
  }

  .nab-holiday-card,
  .nab-recent-card,
  .nab-quick-card,
  .nab-pending-card {
    padding: 17px;
    border: 1px solid #e1e8f1;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 9px 24px rgba(15,23,42,.045);
  }

  .nab-holiday-card > header,
  .nab-recent-card > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .nab-holiday-card > header > div > span {
    color: #0870ed;
    font-size: 8px;
    font-weight: 950;
    letter-spacing: .8px;
  }

  .nab-holiday-card h2,
  .nab-recent-card h2,
  .nab-quick-card h2 {
    margin: 4px 0 0;
    font-size: 15px;
  }

  .nab-live-badge {
    padding: 6px 9px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    color: #168743;
    background: #e2f8ea;
    font-size: 8px;
    font-weight: 950;
  }

  .nab-live-badge .nab-status-dot {
    width: 7px;
    height: 7px;
    border: 0;
  }

  .nab-holiday-values {
    margin-top: 14px;
    display: grid;
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
    border: 1px solid #e8edf3;
    border-radius: 13px;
    overflow: hidden;
  }

  .nab-holiday-value {
    min-width: 0;
    padding: 13px 8px;
    text-align: center;
  }

  .nab-holiday-value + .nab-holiday-value {
    border-left: 1px solid #e8edf3;
  }

  .nab-holiday-value span,
  .nab-holiday-value strong,
  .nab-holiday-value small {
    display: block;
  }

  .nab-holiday-value span {
    color: #71839a;
    font-size: 8px;
    font-weight: 850;
  }

  .nab-holiday-value strong {
    margin-top: 5px;
    font-size: 20px;
  }

  .nab-holiday-value small {
    margin-top: 2px;
    color: #71839a;
    font-size: 7px;
  }

  .nab-holiday-value.blue strong {
    color: #0874ee;
  }

  .nab-holiday-value.orange strong {
    color: #f59e0b;
  }

  .nab-holiday-value.green strong {
    color: #16a34a;
  }

  .nab-holiday-progress {
    height: 6px;
    margin-top: 12px;
    overflow: hidden;
    border-radius: 999px;
    background: #eaf0f6;
  }

  .nab-holiday-progress > div {
    height: 100%;
    border-radius: inherit;
    background:
      linear-gradient(
        90deg,
        #0874ee,
        #23b25c
      );
  }

  .nab-latest-request {
    margin-top: 14px;
    padding: 13px;
    border: 1px solid #e8edf3;
    border-radius: 13px;
    background: #fbfcfe;
  }

  .nab-latest-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .nab-latest-heading > span {
    color: #71839a;
    font-size: 8px;
    font-weight: 900;
  }

  .nab-latest-request > strong {
    display: block;
    margin-top: 9px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13px;
  }

  .nab-latest-request p {
    margin: 5px 0 0;
    color: #6f829a;
    font-size: 9px;
    line-height: 1.4;
  }

  .nab-holiday-card > button {
    width: 100%;
    min-height: 43px;
    margin-top: 13px;
    border: 0;
    border-radius: 11px;
    color: #ffffff;
    background: #0874ee;
    font-size: 10px;
    font-weight: 950;
    cursor: pointer;
  }

  .nab-recent-card > header button {
    border: 0;
    color: #0874ee;
    background: transparent;
    font-size: 9px;
    font-weight: 900;
    cursor: pointer;
  }

  .nab-request-list {
    margin-top: 12px;
    display: grid;
    gap: 8px;
  }

  .nab-request-list article {
    min-width: 0;
    padding: 10px;
    display: grid;
    grid-template-columns:
      30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    border: 1px solid #e8edf3;
    border-radius: 11px;
  }

  .nab-request-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: #0874ee;
    background: #eaf4ff;
    font-size: 13px;
  }

  .nab-request-list article > div:nth-child(2) {
    min-width: 0;
  }

  .nab-request-list strong,
  .nab-request-list span {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .nab-request-list strong {
    font-size: 10px;
  }

  .nab-request-list article > div:nth-child(2) > span {
    margin-top: 3px;
    color: #71839a;
    font-size: 8px;
  }

  .nab-request-status {
    padding: 5px 7px;
    border-radius: 999px;
    font-size: 7px;
    font-weight: 950;
  }

  .nab-request-status.pending {
    color: #a65c00;
    background: #fff1d6;
  }

  .nab-request-status.approved {
    color: #168743;
    background: #dcf7e5;
  }

  .nab-request-status.rejected {
    color: #b91c1c;
    background: #fee2e2;
  }

  .nab-card-empty {
    margin: 14px 0 0;
    color: #71839a;
    font-size: 10px;
  }

  .nab-quick-card {
    display: grid;
    gap: 8px;
  }

  .nab-quick-card h2 {
    margin-bottom: 4px;
  }

  .nab-quick-card button {
    min-height: 41px;
    padding: 0 11px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid #e1e8f1;
    border-radius: 11px;
    color: #31506f;
    background: #ffffff;
    text-align: left;
    font-size: 9px;
    font-weight: 850;
    cursor: pointer;
  }

  .nab-quick-card button span {
    color: #0874ee;
    font-size: 15px;
  }

  .nab-pending-card {
    color: #7c4a03;
    background: #fff8e8;
  }

  .nab-pending-card > span {
    font-size: 8px;
    font-weight: 950;
    letter-spacing: .7px;
  }

  .nab-pending-card > strong {
    display: block;
    margin-top: 6px;
    color: #f59e0b;
    font-size: 28px;
  }

  .nab-pending-card p {
    margin: 5px 0 0;
    font-size: 9px;
  }

  .nab-toast {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 1000;
    max-width: min(360px, calc(100vw - 36px));
    padding: 13px 16px;
    border-radius: 13px;
    color: #ffffff;
    background: #102647;
    box-shadow: 0 20px 55px rgba(15,23,42,.26);
    font-size: 11px;
    font-weight: 850;
  }

  @media (max-width: 1320px) {
    .nab-app {
      grid-template-columns: 92px minmax(0, 1fr);
    }

    .nab-sidebar {
      padding-left: 10px;
      padding-right: 10px;
    }

    .nab-brand {
      padding-left: 0;
      padding-right: 0;
    }

    .nab-brand img {
      max-width: 66px;
      margin: auto;
    }

    .nab-brand-fallback strong {
      font-size: 28px;
      text-align: center;
    }

    .nab-brand-fallback span,
    .nab-sidebar-section > span,
    .nab-sidebar-button > span:nth-child(2),
    .nab-sidebar-button > strong,
    .nab-system-card,
    .nab-update-card,
    .nab-logout > span:last-child {
      display: none;
    }

    .nab-sidebar-button {
      grid-template-columns: 1fr;
      justify-items: center;
      padding: 0;
    }

    .nab-sidebar-icon {
      font-size: 20px;
    }

    .nab-logout {
      justify-content: center;
    }

    .nab-content {
      grid-template-columns: minmax(0, 1fr) 285px;
    }

    .nab-header-pill:nth-child(3) {
      display: none;
    }
  }

  @media (max-width: 1080px) {
    .nab-header {
      grid-template-columns:
        auto minmax(260px, 1fr) auto;
    }

    .nab-header-pill {
      display: none;
    }

    .nab-stats-grid {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }

    .nab-content {
      grid-template-columns: 1fr;
    }

    .nab-right-column {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }

    .nab-holiday-card {
      grid-row: span 2;
    }
  }

  @media (max-width: 760px) {
    .nab-app {
      display: block;
    }

    .nab-sidebar {
      position: fixed;
      left: 0;
      top: 0;
      width: min(285px, 88vw);
      height: 100vh;
      transform: translateX(-105%);
      transition: transform .2s ease;
    }

    .nab-sidebar.open {
      transform: translateX(0);
    }

    .nab-brand img {
      max-width: 155px;
      margin: 0;
    }

    .nab-brand-fallback strong {
      font-size: 42px;
      text-align: left;
    }

    .nab-brand-fallback span,
    .nab-sidebar-section > span,
    .nab-sidebar-button > span:nth-child(2),
    .nab-system-card,
    .nab-update-card,
    .nab-logout > span:last-child {
      display: block;
    }

    .nab-sidebar-button {
      grid-template-columns:
        27px minmax(0, 1fr) auto;
      justify-items: stretch;
      padding: 0 12px;
    }

    .nab-sidebar-button > strong {
      display: grid;
    }

    .nab-logout {
      justify-content: flex-start;
    }

    .nab-sidebar-backdrop {
      position: fixed;
      inset: 0;
      z-index: 250;
      display: block;
      pointer-events: none;
      opacity: 0;
      background: rgba(4,17,34,.55);
      transition: opacity .2s ease;
    }

    .nab-sidebar-backdrop.visible {
      pointer-events: auto;
      opacity: 1;
    }

    .nab-header {
      min-height: 72px;
      padding: 11px 13px;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
    }

    .nab-header-actions-row {
      padding: 9px 13px;
      justify-content: flex-start;
      overflow-x: auto;
    }

    .nab-header-actions {
      flex-wrap: nowrap;
      justify-content: flex-start;
    }

    .nab-mobile-menu {
      display: block;
    }

    .nab-global-search {
      min-height: 47px;
    }

    .nab-global-search kbd {
      display: none;
    }

    .nab-profile > div:last-child {
      display: none;
    }

    .nab-profile {
      padding-left: 0;
      border-left: 0;
    }

    .nab-top-tabs {
      display: none;
    }

    .nab-content {
      padding: 13px;
    }

    .nab-page-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .nab-primary-button {
      width: 100%;
    }

    .nab-filter-row {
      grid-template-columns: 1fr;
    }

    .nab-product-grid {
      grid-template-columns:
        repeat(auto-fill, minmax(260px, 1fr));
      padding: 11px;
    }

    .nab-right-column {
      grid-template-columns: 1fr;
    }

    .nab-holiday-card {
      grid-row: auto;
    }
  }

  @media (max-width: 500px) {
    .nab-global-search input {
      font-size: 12px;
    }

    .nab-stats-grid {
      grid-template-columns: 1fr;
    }

    .nab-product-grid {
      grid-template-columns: 1fr;
    }

    .nab-product-card {
      min-height: 0;
    }

    .nab-product-image {
      flex-basis: 320px;
      height: 320px;
    }

    .nab-holiday-values {
      grid-template-columns: 1fr;
    }

    .nab-holiday-value + .nab-holiday-value {
      border-left: 0;
      border-top: 1px solid #e8edf3;
    }

    .nab-load-more {
      flex-direction: column;
    }
  }
`;

const loginStyles = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
  }

  .nab-login-page {
    min-height: 100vh;
    padding: 24px;
    display: grid;
    place-items: center;
    color: #102647;
    background:
      radial-gradient(
        circle at 10% 8%,
        rgba(8, 116, 238, .32),
        transparent 34%
      ),
      #061b35;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .nab-login-card {
    width: min(440px, 100%);
    padding: 30px;
    border: 1px solid rgba(255,255,255,.45);
    border-radius: 28px;
    background: #ffffff;
    box-shadow: 0 30px 90px rgba(0,0,0,.28);
  }

  .nab-login-logo {
    min-height: 75px;
    margin-bottom: 22px;
  }

  .nab-login-logo img {
    width: 180px;
    height: 75px;
    object-fit: contain;
    object-position: left center;
  }

  .nab-login-logo > div {
    display: none;
  }

  .nab-login-logo strong {
    display: block;
    color: #ffc400;
    font-size: 45px;
    line-height: .88;
    font-style: italic;
    font-weight: 1000;
    letter-spacing: -3px;
    text-shadow: 0 2px 0 #063c82;
  }

  .nab-login-logo div span {
    display: block;
    margin-top: 8px;
    color: #063c82;
    font-weight: 950;
  }

  .nab-login-card > span {
    color: #0874ee;
    font-size: 10px;
    font-weight: 950;
    letter-spacing: 1px;
  }

  .nab-login-card h1 {
    margin: 7px 0 6px;
    font-size: 34px;
    letter-spacing: -1px;
  }

  .nab-login-card p {
    margin: 0 0 22px;
    color: #71839a;
    line-height: 1.5;
    font-size: 13px;
    font-weight: 650;
  }

  .nab-login-card label {
    display: block;
    margin: 14px 0 7px;
    color: #35506f;
    font-size: 12px;
    font-weight: 900;
  }

  .nab-login-card input {
    width: 100%;
    min-height: 50px;
    padding: 0 14px;
    border: 1px solid #dce5f0;
    border-radius: 14px;
    outline: 0;
    color: #102647;
    background: #f8fafc;
    font-size: 14px;
    font-weight: 700;
  }

  .nab-login-card input:focus {
    border-color: #0874ee;
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(8,116,238,.12);
  }

  .nab-login-card > button {
    width: 100%;
    min-height: 50px;
    margin-top: 19px;
    border: 0;
    border-radius: 14px;
    color: #ffffff;
    background:
      linear-gradient(
        135deg,
        #087aff,
        #075bd4
      );
    font-weight: 950;
    cursor: pointer;
  }

  .nab-login-card > button:disabled {
    opacity: .6;
    cursor: not-allowed;
  }

  .nab-login-error {
    margin-top: 14px;
    padding: 12px;
    border: 1px solid #fecaca;
    border-radius: 12px;
    color: #991b1b;
    background: #fee2e2;
    font-size: 11px;
    font-weight: 800;
  }
`;

const primaryButtonStyle = {
  minHeight: 44,
  padding: "0 16px",
  border: 0,
  borderRadius: 13,
  color: "#ffffff",
  background:
    "linear-gradient(135deg, #087aff 0%, #075bd4 100%)",
  boxShadow: "0 9px 20px rgba(0,104,230,.2)",
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  minHeight: 44,
  padding: "0 16px",
  border: "1px solid #dce5f0",
  borderRadius: 13,
  color: "#35506f",
  background: "#ffffff",
  fontWeight: 950,
  cursor: "pointer",
};

const sectionEyebrowStyle = {
  margin: 0,
  color: "#0870ed",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: 1,
  textTransform: "uppercase",
};

const productCardStyle = {
  overflow: "hidden",
  border: "1px solid #e1e8f1",
  borderRadius: 18,
  background: "#ffffff",
  boxShadow: "0 9px 24px rgba(15,23,42,.05)",
};

const productImageWrapStyle = {
  position: "relative",
  height: 420,
  padding: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "#ffffff",
};

const productImageStyle = {
  width: "100%",
  height: "100%",
  maxWidth: "100%",
  maxHeight: "100%",
  display: "block",
  objectFit: "contain",
  objectPosition: "center",
  background: "#ffffff",
};

const stockBadgeStyle = {
  position: "absolute",
  top: 12,
  left: 12,
  padding: "7px 10px",
  borderRadius: 999,
  color: "#ffffff",
  background: "#16a34a",
  fontSize: 11,
  fontWeight: 950,
};

const outOfStockBadgeStyle = {
  ...stockBadgeStyle,
  background: "#dc2626",
};

const productCategoryStyle = {
  margin: 0,
  color: "#0870ed",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: .6,
  textTransform: "uppercase",
};

const priceGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const netPriceBoxStyle = {
  padding: 12,
  border: "1px solid #e1e8f1",
  borderRadius: 13,
  background: "#f8fafc",
};

const retailPriceBoxStyle = {
  padding: 12,
  border: "1px solid #bfdbfe",
  borderRadius: 13,
  background: "#eff6ff",
};

const priceLabelStyle = {
  color: "#71839a",
  fontSize: 11,
  fontWeight: 850,
};

const priceValueStyle = {
  display: "block",
  marginTop: 4,
  color: "#102647",
  fontSize: 16,
  fontWeight: 950,
};

export default App;
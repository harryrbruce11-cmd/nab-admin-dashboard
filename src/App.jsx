import { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import "./App.css";
import ProductEditScreen from "./ProductEditScreen";
import OrdersScreen from "./OrdersScreen";

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
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function calculateDiscountPrice(retailPrice, discountPercent, fallbackDiscountPrice = 0) {
  const retail = toNumber(retailPrice, 0);
  const percent = Math.min(Math.max(toNumber(discountPercent, 0), 0), 100);

  if (retail > 0 && percent > 0) {
    return Number((retail - retail * (percent / 100)).toFixed(2));
  }

  return toNumber(fallbackDiscountPrice, 0);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecent(value, days = 7) {
  const ms = toMillis(value);
  if (!ms) return false;
  return Date.now() - ms <= days * 24 * 60 * 60 * 1000;
}

function formatShortDate(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function getProductImage(data) {
  if (typeof data.imageUrl === "string" && data.imageUrl) return data.imageUrl;
  if (typeof data.image === "string" && data.image) return data.image;
  if (Array.isArray(data.images) && data.images.length > 0) {
    const first = data.images[0];
    if (typeof first === "string") return first;
    if (first?.url) return first.url;
  }
  return "https://images.unsplash.com/photo-1581092918484-8313b0f2c5ad?auto=format&fit=crop&w=900&q=80";
}

function normaliseCategory(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    name: firstNonEmpty(data.name, data.title, data.category, doc.id),
    subtitle: firstNonEmpty(
      data.subtitle,
      data.description,
      data.developerNotes,
      ""
    ),
    department: firstNonEmpty(
      data.department,
      data.group,
      data.section,
      "Unassigned"
    ),
    image: firstNonEmpty(
      data.imageUrl,
      data.image,
      Array.isArray(data.images) ? data.images[0]?.url || data.images[0] : "",
      ""
    ),
    products: 0,
  };
}

function normaliseProduct(doc) {
  const data = doc.data();

  const netPrice = firstNonEmpty(
    data?.pricing?.net,
    data?.pricing?.trade,
    data?.netPrice,
    data?.net,
    data?.price
  );

  const retailPrice = firstNonEmpty(
    data?.pricing?.retail,
    data?.retailPrice,
    data?.retail,
    data?.price
  );

  const stock = firstNonEmpty(
    data?.stock?.inStock,
    data?.stock,
    data?.qty,
    data?.quantity,
    0
  );

  return {
    id: doc.id,
    sku: firstNonEmpty(data.sku, data.code, data.productCode, doc.id),
    name: firstNonEmpty(data.name, data.title, "Untitled Product"),
    categoryId: firstNonEmpty(data.categoryId, data.category_id, ""),
    categoryName: firstNonEmpty(
      data.category,
      data.categoryName,
      data.category_name,
      ""
    ),
    netPrice: toNumber(netPrice, 0),
    retailPrice: toNumber(retailPrice, toNumber(netPrice, 0)),
    discountPrice: toNumber(
      firstNonEmpty(
        data?.pricing?.discount,
        data?.discountPrice,
        data?.discount,
        0
      ),
      0
    ),
    discountPercent: toNumber(
      firstNonEmpty(
        data?.pricing?.discountPercent,
        data?.discountPercent,
        data?.discount_percentage,
        data?.discountPercentage,
        0
      ),
      0
    ),
    stock: toNumber(stock, 0),
    image: getProductImage(data),
    barcode: firstNonEmpty(
      data.barcode,
      data.ean,
      data.upc,
      data.scanCode,
      data.barCode,
      ""
    ),
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

function App() {
  const [updateMessage, setUpdateMessage] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [activeDepartment, setActiveDepartment] = useState("All Departments");
  const [activeCategory, setActiveCategory] = useState("all");
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [categoryMenuSearch, setCategoryMenuSearch] = useState("");

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [visibleBatchCount, setVisibleBatchCount] = useState(0);
  const [imageLoadPercent, setImageLoadPercent] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [activeView, setActiveView] = useState("products");
  const [saveLoading, setSaveLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [appVersion, setAppVersion] = useState("DEV");
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [paulNote, setPaulNote] = useState("");
  const [paulNoteDraft, setPaulNoteDraft] = useState("");
  const [paulNoteSaving, setPaulNoteSaving] = useState(false);
  const [paulNoteUpdatedAt, setPaulNoteUpdatedAt] = useState(null);

  const version = appVersion;

  useEffect(() => {
    if (!toastMessage) return;

    const timeout = window.setTimeout(() => {
      setToastMessage("");
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.electronUpdater) return;

    window.electronUpdater.onUpdateMessage?.((msg) => {
      const safeMsg = String(msg || "");
      const lowerMsg = safeMsg.toLowerCase();

      setUpdateMessage(safeMsg);

      if (
        lowerMsg.includes("downloading") ||
        lowerMsg.includes("download") ||
        lowerMsg.includes("checking")
      ) {
        setUpdateDownloading(true);
      }

      if (
        lowerMsg.includes("downloaded") ||
        lowerMsg.includes("ready to install") ||
        lowerMsg.includes("update ready")
      ) {
        setUpdateDownloading(false);
        setUpdateReady(true);
      }

      if (
        lowerMsg.includes("up to date") ||
        lowerMsg.includes("no update") ||
        lowerMsg.includes("latest version")
      ) {
        setUpdateDownloading(false);
      }
    });
  }, []);

  useEffect(() => {
    async function loadRealVersion() {
      try {
        if (window.electronAPI?.getVersion) {
          const realVersion = await window.electronAPI.getVersion();
          if (realVersion) {
            setAppVersion(realVersion);
            return;
          }
        }

        if (window.electronAPI?.version) {
          setAppVersion(window.electronAPI.version);
        }
      } catch {
        if (window.electronAPI?.version) {
          setAppVersion(window.electronAPI.version);
        }
      }
    }

    loadRealVersion();
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setCategories([]);
      setProducts([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    setDataError("");

    const unsubCategories = onSnapshot(
      collection(db, "categories"),
      (snapshot) => {
        const items = snapshot.docs.map(normaliseCategory);
        setCategories(items);
      },
      (error) => {
        setDataError(error.message || "Failed to load categories.");
      }
    );

    const unsubProducts = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const items = snapshot.docs.map(normaliseProduct);
        setProducts(items);
        setDataLoading(false);
      },
      (error) => {
        setDataError(error.message || "Failed to load products.");
        setDataLoading(false);
      }
    );

    return () => {
      unsubCategories();
      unsubProducts();
    };
  }, [user]);

  useEffect(() => {
    if (!db || !user) {
      setPaulNote("");
      setPaulNoteDraft("");
      setPaulNoteUpdatedAt(null);
      return;
    }

    const noteRef = doc(db, "adminNotes", "paul");

    const unsubscribe = onSnapshot(
      noteRef,
      (snapshot) => {
        const data = snapshot.data() || {};
        const note = String(data.note || "");
        setPaulNote(note);
        setPaulNoteDraft(note);
        setPaulNoteUpdatedAt(data.updatedAt || null);
      },
      (error) => {
        setToastMessage(error?.message || "Failed to load note for Paul.");
      }
    );

    return unsubscribe;
  }, [user]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");

    if (!auth) {
      setLoginError(
        "Firebase is not configured yet. Add your VITE_FIREBASE values to .env.local."
      );
      return;
    }

    try {
      setLoginLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setLoginError(error.message || "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  const handleCheckForUpdates = () => {
    if (!window.electronUpdater?.checkForUpdates) {
      setToastMessage("Updater is not available in browser-only dev mode.");
      return;
    }

    setUpdateReady(false);
    setUpdateDownloading(true);
    setUpdateMessage("Checking Firebase for updates...");
    window.electronUpdater.checkForUpdates();
  };

  const handleInstallUpdate = () => {
    setToastMessage("Installing update...");

    if (window.electronUpdater?.quitAndInstall) {
      window.electronUpdater.quitAndInstall();
      return;
    }

    if (window.electronUpdater?.installUpdate) {
      window.electronUpdater.installUpdate();
      return;
    }

    setToastMessage("Update is ready, but install action is not available in preload yet.");
  };

  const handleSavePaulNote = async () => {
    if (!db || !user) {
      setToastMessage("Unable to save note.");
      return;
    }

    try {
      setPaulNoteSaving(true);
      const note = String(paulNoteDraft || "").trim();

      await setDoc(
        doc(db, "adminNotes", "paul"),
        {
          note,
          updatedAt: serverTimestamp(),
          updatedBy: user.email || "Unknown",
        },
        { merge: true }
      );

      setPaulNote(note);
      setToastMessage("Note for Paul saved.");
    } catch (error) {
      setToastMessage(error?.message || "Failed to save note for Paul.");
    } finally {
      setPaulNoteSaving(false);
    }
  };

  const openNewProductEditor = () => {
    setActiveView("products");
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
  };

  const openProductEditor = (product) => {
    setActiveView("products");
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
  };

  const closeProductEditor = () => {
    setSelectedProduct(null);
    setEditForm(null);
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveProduct = async () => {
    if (!db || !editForm) {
      setToastMessage("Unable to save product.");
      return;
    }

    try {
      setSaveLoading(true);

      const categoryName = String(editForm.category || "").trim();
      const matchedCategory = categories.find(
        (category) =>
          String(category?.name || "").trim().toLowerCase() ===
          categoryName.toLowerCase()
      );

      const stockValue = toNumber(editForm.stock, 0);
      const imageValue = String(editForm.image || "").trim();
      const netValue = toNumber(editForm.netPrice, 0);
      const retailValue = toNumber(editForm.retailPrice, 0);
      const discountPercentValue = Math.min(
        Math.max(toNumber(editForm.discountPercent, 0), 0),
        100
      );
      const discountValue = calculateDiscountPrice(
        retailValue,
        discountPercentValue,
        editForm.discountPrice
      );
      const descriptionValue = String(editForm.description || "").trim();

      const payload = {
        name: String(editForm.name || "").trim(),
        sku: String(editForm.sku || "").trim(),
        barcode: String(editForm.barcode || "").trim(),
        description: descriptionValue,
        category: categoryName,
        categoryName,
        categoryId: matchedCategory?.id || "",
        netPrice: netValue,
        retailPrice: retailValue,
        discountPrice: discountValue,
        discountPercent: discountPercentValue,
        discount: discountValue,
        price: retailValue,
        pricing: {
          net: netValue,
          retail: retailValue,
          discount: discountValue,
          discountPercent: discountPercentValue,
        },
        imageUrl: imageValue,
        image: imageValue,
        stock: {
          inStock: stockValue,
        },
        updatedAt: serverTimestamp(),
      };

      if (selectedProduct?.id) {
        await updateDoc(doc(db, "products", selectedProduct.id), payload);
        setToastMessage("Product saved successfully.");
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setToastMessage("New product created successfully.");
      }

      closeProductEditor();
    } catch (error) {
      setToastMessage(error?.message || "Failed to save product.");
    } finally {
      setSaveLoading(false);
    }
  };

  const categoryMap = useMemo(() => {
    const map = new Map();

    categories.forEach((category) => {
      map.set(category.id, category);
      map.set(String(category.name || "").toLowerCase(), category);
    });

    return map;
  }, [categories]);

  const productsWithResolvedCategory = useMemo(() => {
    return products.map((product) => {
      const category =
        categoryMap.get(product.categoryId) ||
        categoryMap.get((product.categoryName || "").toLowerCase());

      return {
        ...product,
        resolvedCategoryId: category?.id || "",
        resolvedCategoryName:
          category?.name || product.categoryName || "Uncategorised",
        resolvedDepartment: category?.department || "Unassigned",
      };
    });
  }, [products, categoryMap]);

  const departments = useMemo(() => {
    const set = new Set(categories.map((item) => item.department).filter(Boolean));
    return ["All Departments", ...Array.from(set).sort((a, b) => String(a).localeCompare(String(b)))];
  }, [categories]);

  useEffect(() => {
    if (!departments.includes(activeDepartment)) {
      setActiveDepartment("All Departments");
    }
  }, [departments, activeDepartment]);

  const selectedDepartmentProducts = useMemo(() => {
    if (activeDepartment === "All Departments") {
      return productsWithResolvedCategory;
    }

    return productsWithResolvedCategory.filter(
      (product) => product.resolvedDepartment === activeDepartment
    );
  }, [productsWithResolvedCategory, activeDepartment]);

  const categoryMenuCategories = useMemo(() => {
    const text = categoryMenuSearch.trim().toLowerCase();

    return categories
      .map((category) => {
        const count = productsWithResolvedCategory.filter(
          (product) => product.resolvedCategoryId === category.id
        ).length;

        return { ...category, count };
      })
      .filter((category) => {
        if (!text) return true;
        return (
          String(category.name || "").toLowerCase().includes(text) ||
          String(category.department || "").toLowerCase().includes(text)
        );
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [categories, productsWithResolvedCategory, categoryMenuSearch]);

  const filteredProducts = useMemo(() => {
    const text = productSearch.trim().toLowerCase();

    const filtered = selectedDepartmentProducts.filter((product) => {
      const matchesCategory =
        activeCategory === "all" ||
        product.resolvedCategoryId === activeCategory;

      const matchesSearch =
        !text ||
        String(product.name || "").toLowerCase().includes(text) ||
        String(product.sku || "").toLowerCase().includes(text) ||
        String(product.barcode || "").toLowerCase().includes(text) ||
        String(product.id || "").toLowerCase().includes(text) ||
        String(product.resolvedCategoryName || "").toLowerCase().includes(text);

      return matchesCategory && matchesSearch;
    });

    return filtered.sort((a, b) => {
      const aCreated = toMillis(a.createdAt);
      const bCreated = toMillis(b.createdAt);
      const aUpdated = toMillis(a.updatedAt);
      const bUpdated = toMillis(b.updatedAt);

      const aIsNew = isRecent(a.createdAt) ? 1 : 0;
      const bIsNew = isRecent(b.createdAt) ? 1 : 0;
      if (bIsNew !== aIsNew) return bIsNew - aIsNew;

      const aIsUpdated = !isRecent(a.createdAt) && isRecent(a.updatedAt) ? 1 : 0;
      const bIsUpdated = !isRecent(b.createdAt) && isRecent(b.updatedAt) ? 1 : 0;
      if (bIsUpdated !== aIsUpdated) return bIsUpdated - aIsUpdated;

      return Math.max(bUpdated, bCreated) - Math.max(aUpdated, aCreated);
    });
  }, [selectedDepartmentProducts, activeCategory, productSearch]);

  useEffect(() => {
    let cancelled = false;

    async function preloadInBatches() {
      const total = filteredProducts.length;

      setVisibleBatchCount(0);
      setImageLoadPercent(total === 0 ? 100 : 0);

      if (total === 0) return;

      let loadedCount = 0;

      for (let index = 0; index < filteredProducts.length; index += 4) {
        const batch = filteredProducts.slice(index, index + 4);

        await Promise.all(
          batch.map(
            (product) =>
              new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = product.image;
              })
          )
        );

        if (cancelled) return;

        loadedCount += batch.length;
        setVisibleBatchCount(Math.ceil(loadedCount / 4));
        setImageLoadPercent(Math.round((loadedCount / total) * 100));
      }
    }

    preloadInBatches();

    return () => {
      cancelled = true;
    };
  }, [filteredProducts]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleBatchCount * 4);
  }, [filteredProducts, visibleBatchCount]);

  const imageCount = productsWithResolvedCategory.filter((item) => item.image).length;

  const stockValue = productsWithResolvedCategory.reduce((total, product) => {
    const stock = Number(product.stock || 0);
    const netPrice = Number(product.netPrice || 0);
    return total + stock * netPrice;
  }, 0);

  const formattedStockValue = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(stockValue);

  const handleAddCategory = async (name) => {
    if (!db || !user) {
      throw new Error("Firebase not ready.");
    }

    const cleanName = String(name || "")
      .trim()
      .replace(/\s+/g, " ");

    if (!cleanName) {
      throw new Error("Category name is empty.");
    }

    const existingCategory = categories.find(
      (category) =>
        String(category?.name || "")
          .trim()
          .toLowerCase() === cleanName.toLowerCase()
    );

    if (existingCategory) {
      setEditForm((current) => ({
        ...current,
        category: existingCategory.name,
      }));
      setToastMessage("Category already exists and is selected.");
      return existingCategory;
    }

    const docId =
      cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || `category-${Date.now()}`;

    const newCategory = {
      id: docId,
      name: cleanName,
      title: cleanName,
      subtitle: "",
      department: "Unassigned",
      image: "",
      products: 0,
    };

    await setDoc(
      doc(db, "categories", docId),
      {
        name: cleanName,
        title: cleanName,
        department: "Unassigned",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.email || "Unknown",
      },
      { merge: true }
    );

    setCategories((current) => {
      const alreadyInList = current.some(
        (category) =>
          String(category?.name || "")
            .trim()
            .toLowerCase() === cleanName.toLowerCase()
      );

      if (alreadyInList) return current;

      return [...current, newCategory].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
    });

    setEditForm((current) => ({
      ...current,
      category: cleanName,
    }));

    setActiveCategory(docId);
    setActiveDepartment("Unassigned");
    setToastMessage(`Category added: ${cleanName}`);

    return newCategory;
  };

  if (selectedProduct && editForm) {
    return (
      <ProductEditScreen
        product={selectedProduct}
        mode={selectedProduct?.id ? "edit" : "create"}
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

  if (authLoading) {
    return (
      <FullScreenMessage
        title="Loading NAB Admin"
        subtitle="Checking secure Firebase session..."
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
        hasFirebaseConfig={hasFirebaseConfig}
        onSubmit={handleLogin}
        version={version}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100%",
        background: "#f4f6f8",
        color: "#111827",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
        boxSizing: "border-box",
        overflowX: "hidden",
        margin: 0,
        padding: 0,
      }}
    >
      <div style={topUtilityBarStyle}>
        <div style={topUtilityLeftStyle}>
          <button onClick={() => setActiveView("products")} style={topUtilityMenuButtonStyle}>Dashboard</button>
          <button onClick={() => setActiveView("products")} style={topUtilityMenuButtonStyle}>Daily Vehicle Check</button>
          <button onClick={() => setActiveView("products")} style={topUtilityMenuButtonStyle}>Fuel History</button>
        </div>

        <div style={topUtilityCenterStyle}>
          <button onClick={() => setActiveView("orders")} style={topUtilityOrdersButtonStyle}>Orders</button>
        </div>

        <div style={topUtilityRightStyle}>
          <div style={profilePillStyle}>
            <div style={profileAvatarStyle}>
              {(user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <span style={profileLabelStyle}>My Account</span>
              <span style={profileEmailStyle}>{user.email}</span>
            </div>
          </div>
          <span style={versionBadgeStyle}>v{version}</span>
        </div>
      </div>

      <header style={storeHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={brandLogoStyle}>NAB</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 25, letterSpacing: -0.7 }}>
              NAB Parts Store
            </h1>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontWeight: 800 }}>
              Admin ecommerce catalogue
            </p>
          </div>
        </div>

        <div style={headerCenterStackStyle}>
          <div style={compactPaulNoteStyle}>
            <div style={compactPaulNoteTopStyle}>
              <span style={compactPaulNoteLabelStyle}>Note for Paul</span>
              <span style={compactPaulNoteMetaStyle}>
                {paulNoteUpdatedAt
                  ? `Updated ${formatShortDate(paulNoteUpdatedAt)}`
                  : "Firestore note"}
              </span>
            </div>

            <div style={compactPaulNoteRowStyle}>
              <textarea
                value={paulNoteDraft}
                onChange={(event) => setPaulNoteDraft(event.target.value)}
                placeholder="Write a quick note for Paul..."
                style={compactPaulNoteInputStyle}
              />
              <button
                onClick={handleSavePaulNote}
                disabled={paulNoteSaving}
                style={
                  paulNoteSaving
                    ? compactNoteSaveButtonDisabledStyle
                    : compactNoteSaveButtonStyle
                }
              >
                {paulNoteSaving ? "Saving" : "Save"}
              </button>
            </div>
          </div>

          <div style={searchShellStyle}>
            <span style={{ color: "#64748b", fontSize: 24 }}>⌕</span>
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search products, SKU, barcode, category..."
              style={searchInputStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button onClick={openNewProductEditor} style={primaryButtonStyle}>
            + New Product
          </button>

          {updateReady ? (
            <button onClick={handleInstallUpdate} style={installUpdateButtonStyle}>
              Update Ready — Install
            </button>
          ) : (
            <button onClick={handleCheckForUpdates} style={secondaryButtonStyle}>
              {updateDownloading ? "Checking / Downloading..." : "Check Updates"}
            </button>
          )}

          <button onClick={handleLogout} style={dangerButtonStyle}>
            Logout
          </button>
        </div>
      </header>

      <nav style={ecomNavStyle}>
        <button
          onClick={() => {
            setActiveDepartment("All Departments");
            setActiveCategory("all");
            setShowCategoryMenu(false);
          }}
          style={activeDepartment === "All Departments" && activeCategory === "all" ? activeEcomNavButtonStyle : ecomNavButtonStyle}
        >
          All Products
        </button>

        {departments
          .filter((department) => department !== "All Departments")
          .slice(0, 7)
          .map((department) => {
            const active = department === activeDepartment && activeCategory === "all";
            return (
              <button
                key={department}
                onClick={() => {
                  setActiveDepartment(department);
                  setActiveCategory("all");
                  setShowCategoryMenu(false);
                }}
                style={active ? activeEcomNavButtonStyle : ecomNavButtonStyle}
              >
                {department}
              </button>
            );
          })}

        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button
            onClick={() => setShowCategoryMenu((current) => !current)}
            style={showCategoryMenu ? activeEcomCategoryMenuButtonStyle : ecomCategoryMenuButtonStyle}
          >
            ☰ Categories
          </button>

          {showCategoryMenu && (
            <div style={categoryMenuPanelStyle}>
              <div style={categoryMenuHeaderStyle}>
                <div>
                  <p style={sectionEyebrowStyle}>Shop by category</p>
                  <h3 style={{ margin: "5px 0 0", fontSize: 20 }}>All Categories</h3>
                </div>
                <button onClick={() => setShowCategoryMenu(false)} style={categoryMenuCloseButtonStyle}>×</button>
              </div>

              <div style={categoryMenuSearchWrapStyle}>
                <span style={{ color: "#64748b", fontSize: 18 }}>⌕</span>
                <input
                  value={categoryMenuSearch}
                  onChange={(event) => setCategoryMenuSearch(event.target.value)}
                  placeholder="Search categories..."
                  style={categoryMenuSearchInputStyle}
                />
              </div>

              <div style={categoryMenuGridStyle}>
                <button
                  onClick={() => {
                    setActiveCategory("all");
                    setActiveDepartment("All Departments");
                    setShowCategoryMenu(false);
                  }}
                  style={categoryMenuItemStyle}
                >
                  <strong>All Categories</strong>
                  <span>{productsWithResolvedCategory.length} products</span>
                </button>

                {categoryMenuCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setActiveCategory(category.id);
                      setActiveDepartment(category.department || "All Departments");
                      setShowCategoryMenu(false);
                    }}
                    style={activeCategory === category.id ? activeCategoryMenuItemStyle : categoryMenuItemStyle}
                  >
                    <strong>{category.name}</strong>
                    <span>{category.department || "Unassigned"} · {category.count} products</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {updateMessage && (
        <div
          style={{
            margin: "14px 18px 0",
            background: updateReady ? "#16a34a" : "#2563eb",
            color: "white",
            borderRadius: 16,
            padding: 15,
            fontWeight: 850,
            boxShadow: updateReady
              ? "0 20px 60px rgba(22,163,74,0.24)"
              : "0 20px 60px rgba(37,99,235,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>
            {updateMessage}
            {updateReady ? " Install the downloaded Firebase update when ready." : ""}
          </span>
          {updateReady && (
            <button onClick={handleInstallUpdate} style={installUpdateButtonStyleLight}>
              Install Now
            </button>
          )}
        </div>
      )}

      {updateMessage && (
        <div style={updaterHelpTextStyle}>
          Auto update is driven by the Electron main/preload process and your Firebase Hosting update feed.
        </div>
      )}

      {dataError && (
        <div
          style={{
            margin: "14px 18px 0",
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            borderRadius: 16,
            padding: 15,
            fontWeight: 800,
          }}
        >
          {dataError}
        </div>
      )}

      {toastMessage && <div style={toastStyle}>{toastMessage}</div>}

      <main
        style={{
          display: "block",
          padding: "14px 0 28px 0",
          boxSizing: "border-box",
          width: "100%",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <section
          style={{
            minWidth: 0,
            width: "100%",
            overflowX: "auto",
            padding: "0 18px",
          }}
        >
          <div style={statsGridStyle}>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Stock Value</span>
              <strong style={statValueStyle}>{formattedStockValue}</strong>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Categories</span>
              <strong style={statValueStyle}>{categories.length}</strong>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Products</span>
              <strong style={statValueStyle}>{selectedDepartmentProducts.length}</strong>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Images</span>
              <strong style={statValueStyle}>{imageCount}</strong>
            </div>
          </div>

          <div style={productPanelStyle}>
            <div style={productPanelHeaderStyle}>
              <button onClick={openNewProductEditor} style={primaryButtonStyle}>
                + New Product
              </button>
            </div>

            <div style={imageLoadingBarWrapStyle}>
              <div>
                <p style={sectionEyebrowStyle}>Image Loading</p>
                <h3 style={{ margin: "6px 0 0", fontSize: 20 }}>
                  {imageLoadPercent}% loaded
                </h3>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
                  Loading product images 4 at a time.
                </p>
              </div>

              <div style={imageLoadingProgressOuterStyle}>
                <div
                  style={{
                    ...imageLoadingProgressInnerStyle,
                    width: `${imageLoadPercent}%`,
                  }}
                />
              </div>
            </div>

            {dataLoading ? (
              <div style={emptyStateStyle}>Loading products and categories...</div>
            ) : (
              <div style={productGridStyle}>
                {displayedProducts.map((product) => (
                  <article
                    key={product.id}
                    style={{ ...productCardStyle, cursor: "pointer" }}
                    onClick={() => openProductEditor(product)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProductEditor(product);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div style={productImageWrapStyle}>
                      <img
                        src={product.image}
                        alt={product.name}
                        style={productImageStyle}
                      />
                      <span
                        style={
                          product.stock === 0
                            ? outOfStockBadgeStyle
                            : stockBadgeStyle
                        }
                      >
                        {product.stock === 0
                          ? "Out of stock"
                          : `${product.stock} in stock`}
                      </span>
                    </div>

                    <div style={{ padding: 16, display: "grid", gap: 12 }}>
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <p style={productCategoryStyle}>
                            {product.resolvedCategoryName}
                          </p>

                          {isRecent(product.createdAt) && (
                            <span style={newBadgeStyle}>NEW</span>
                          )}

                          {!isRecent(product.createdAt) &&
                            isRecent(product.updatedAt) && (
                              <span style={updatedBadgeStyle}>UPDATED</span>
                            )}
                        </div>

                        <h3 style={{ margin: "6px 0 0", fontSize: 18 }}>
                          {product.name}
                        </h3>

                        <div
                          style={{
                            margin: "5px 0 0",
                            color: "#64748b",
                            fontSize: 13,
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <span>SKU: {product.sku || "-"}</span>
                          <span>Barcode: {product.barcode || "-"}</span>
                        </div>

                        <p style={productDescriptionStyle}>
                          {product.description || "No product description yet."}
                        </p>

                        <div
                          style={{
                            display: "grid",
                            gap: 4,
                            marginTop: 10,
                          }}
                        >
                          <span style={metaTextStyle}>
                            Created: {formatShortDate(product.createdAt)}
                          </span>
                          <span style={metaTextStyle}>
                            Updated: {formatShortDate(product.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <div style={priceGridStyle}>
                        <div style={netPriceBoxStyle}>
                          <span style={priceLabelStyle}>Net</span>
                          <strong style={priceValueStyle}>
                            £{product.netPrice.toFixed(2)}
                          </strong>
                        </div>

                        <div style={retailPriceBoxStyle}>
                          <span style={{ ...priceLabelStyle, color: "#2563eb" }}>
                            Retail
                          </span>
                          <strong
                            style={{ ...priceValueStyle, color: "#1d4ed8" }}
                          >
                            £{product.retailPrice.toFixed(2)}
                          </strong>
                        </div>
                      </div>

                      {Number(product.discountPercent || 0) > 0 && (
                        <div style={discountSummaryBoxStyle}>
                          <span style={discountSummaryLabelStyle}>
                            Auto Discount {Number(product.discountPercent || 0)}%
                          </span>
                          <strong style={discountSummaryValueStyle}>
                            £{Number(product.discountPrice || 0).toFixed(2)}
                          </strong>
                        </div>
                      )}

                      <div style={editProductHintStyle}>
                        Tap anywhere on the product to edit
                      </div>
                    </div>
                  </article>
                ))}

                {displayedProducts.length === 0 && filteredProducts.length === 0 && (
                  <div style={emptyStateStyle}>
                    No products found for this department/category/search.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function LoginScreen({
  email,
  password,
  setEmail,
  setPassword,
  loginError,
  loginLoading,
  hasFirebaseConfig,
  onSubmit,
  version,
}) {
  return (
    <div style={loginPageStyle}>
      <form onSubmit={onSubmit} style={loginCardStyle}>
        <div style={loginLogoStyle}>NAB</div>
        <p style={sectionEyebrowStyle}>Secure Admin Login</p>
        <h1
          style={{
            margin: "8px 0 8px",
            fontSize: 34,
            color: "#111827",
            fontWeight: 950,
            letterSpacing: -0.8,
          }}
        >
          Parts Admin
        </h1>
        <p style={{ margin: "0 0 22px", color: "#64748b", fontWeight: 700 }}>
          Sign in with Firebase to access the admin dashboard. Version {version}
        </p>

        {!hasFirebaseConfig && (
          <div style={loginWarningStyle}>
            Firebase config missing. Add your VITE_FIREBASE values to `.env.local`.
          </div>
        )}

        <label style={loginLabelStyle}>Email</label>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="admin@example.com"
          style={loginInputStyle}
        />

        <label style={loginLabelStyle}>Password</label>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="Password"
          style={loginInputStyle}
        />

        {loginError && <div style={loginErrorStyle}>{loginError}</div>}

        <button disabled={loginLoading} type="submit" style={loginButtonStyle}>
          {loginLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

function FullScreenMessage({ title, subtitle }) {
  return (
    <div style={loginPageStyle}>
      <div style={loginCardStyle}>
        <div style={loginLogoStyle}>NAB</div>
        <h1
          style={{
            margin: "14px 0 8px",
            fontSize: 30,
            color: "#111827",
            fontWeight: 950,
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

const searchInputStyle = {
  width: "100%",
  border: 0,
  outline: 0,
  background: "transparent",
  fontSize: 16,
  fontWeight: 750,
  color: "#111827",
};

const primaryButtonStyle = {
  border: 0,
  background: "#111827",
  color: "white",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  border: "1px solid #dbe3ef",
  background: "white",
  color: "#111827",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

const dangerButtonStyle = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

const installUpdateButtonStyle = {
  border: "1px solid #16a34a",
  background: "#16a34a",
  color: "white",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(22,163,74,0.22)",
};

const installUpdateButtonStyleLight = {
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.18)",
  color: "white",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 950,
  cursor: "pointer",
  backdropFilter: "blur(6px)",
};

const updaterHelpTextStyle = {
  margin: "10px 18px 0",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
};

const topUtilityBarStyle = {
  background: "#111827",
  color: "white",
  padding: "10px 18px",
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 16,
};

const topUtilityLeftStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  justifyContent: "flex-start",
  flexWrap: "wrap",
};

const topUtilityCenterStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const topUtilityRightStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 12,
  minWidth: 0,
};

const topUtilityMenuButtonStyle = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const topUtilityOrdersButtonStyle = {
  border: "1px solid #facc15",
  background: "#facc15",
  color: "#111827",
  borderRadius: 999,
  padding: "10px 20px",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
  boxShadow: "0 10px 24px rgba(250,204,21,0.22)",
};

const profilePillStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 999,
  padding: "6px 12px 6px 6px",
  minWidth: 0,
};

const profileAvatarStyle = {
  width: 34,
  height: 34,
  borderRadius: 999,
  background: "linear-gradient(135deg, #2563eb 0%, #facc15 100%)",
  color: "#111827",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  fontSize: 14,
  flexShrink: 0,
};

const profileLabelStyle = {
  color: "#cbd5e1",
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1,
  textTransform: "uppercase",
  letterSpacing: 0.7,
};

const profileEmailStyle = {
  color: "white",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 220,
};

const versionBadgeStyle = {
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const storeHeaderStyle = {
  background: "white",
  borderBottom: "1px solid #e5e7eb",
  padding: "18px",
  display: "grid",
  gridTemplateColumns: "250px minmax(0, 1fr) 420px",
  gap: 20,
  alignItems: "center",
};

const brandLogoStyle = {
  width: 64,
  height: 64,
  borderRadius: 18,
  background: "linear-gradient(135deg, #111827 0%, #2563eb 55%, #facc15 100%)",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 950,
};

const headerCenterStackStyle = {
  display: "grid",
  gap: 10,
  minWidth: 0,
};

const compactPaulNoteStyle = {
  background: "#f8fafc",
  border: "1px solid #dfe7f2",
  borderRadius: 16,
  padding: 10,
  display: "grid",
  gap: 8,
};

const compactPaulNoteTopStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const compactPaulNoteLabelStyle = {
  color: "#2563eb",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.7,
};

const compactPaulNoteMetaStyle = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const compactPaulNoteRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center",
};

const compactPaulNoteInputStyle = {
  width: "100%",
  height: 42,
  minHeight: 42,
  border: "1px solid #dbe3ef",
  borderRadius: 12,
  background: "white",
  color: "#111827",
  padding: "10px 12px",
  resize: "none",
  outline: 0,
  fontSize: 13,
  fontWeight: 750,
  lineHeight: 1.25,
  boxSizing: "border-box",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
};

const compactNoteSaveButtonStyle = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "white",
  borderRadius: 12,
  padding: "11px 14px",
  fontWeight: 950,
  cursor: "pointer",
};

const compactNoteSaveButtonDisabledStyle = {
  ...compactNoteSaveButtonStyle,
  opacity: 0.65,
  cursor: "not-allowed",
};

const searchShellStyle = {
  height: 58,
  borderRadius: 18,
  background: "#f8fafc",
  border: "1px solid #dfe7f2",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 18px",
};

const ecomNavStyle = {
  background: "#ffffff",
  color: "#111827",
  padding: "0 18px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  borderBottom: "1px solid #e5e7eb",
  boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
  overflow: "visible",
  position: "relative",
  zIndex: 50,
};

const ecomNavButtonStyle = {
  border: 0,
  background: "transparent",
  color: "#334155",
  padding: "16px 14px",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 14,
  whiteSpace: "nowrap",
  borderBottom: "4px solid transparent",
};

const activeEcomNavButtonStyle = {
  ...ecomNavButtonStyle,
  color: "#111827",
  background: "#f8fafc",
  borderBottom: "4px solid #facc15",
};

const ecomCategoryMenuButtonStyle = {
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  borderRadius: 14,
  padding: "11px 16px",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 14,
  whiteSpace: "nowrap",
  boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
};

const activeEcomCategoryMenuButtonStyle = {
  ...ecomCategoryMenuButtonStyle,
  background: "#facc15",
  color: "#111827",
  border: "1px solid #facc15",
};

const categoryMenuPanelStyle = {
  position: "absolute",
  top: "calc(100% + 10px)",
  right: 0,
  width: 540,
  maxHeight: "70vh",
  overflowY: "auto",
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 22,
  boxShadow: "0 28px 80px rgba(15,23,42,0.22)",
  padding: 16,
  zIndex: 100,
};

const categoryMenuHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const categoryMenuCloseButtonStyle = {
  width: 36,
  height: 36,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  borderRadius: 999,
  fontSize: 22,
  fontWeight: 900,
  cursor: "pointer",
};

const categoryMenuSearchWrapStyle = {
  height: 48,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid #dfe7f2",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px",
  marginBottom: 14,
};

const categoryMenuSearchInputStyle = {
  width: "100%",
  border: 0,
  outline: 0,
  background: "transparent",
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
};

const categoryMenuGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const categoryMenuItemStyle = {
  border: "1px solid #e5e7eb",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  color: "#111827",
  borderRadius: 16,
  padding: 14,
  textAlign: "left",
  cursor: "pointer",
  display: "grid",
  gap: 6,
  fontWeight: 900,
};

const activeCategoryMenuItemStyle = {
  ...categoryMenuItemStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const imageLoadingBarWrapStyle = {
  padding: "16px 18px",
  borderBottom: "1px solid #e5e7eb",
  display: "grid",
  gap: 12,
  background: "#f8fafc",
};

const imageLoadingProgressOuterStyle = {
  width: "100%",
  height: 10,
  background: "#e5e7eb",
  borderRadius: 999,
  overflow: "hidden",
};

const imageLoadingProgressInnerStyle = {
  height: "100%",
  background: "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)",
  borderRadius: 999,
  transition: "width 0.25s ease",
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
  gap: 14,
  marginBottom: 18,
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

const productPanelStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 14,
  boxShadow: "0 18px 50px rgba(15,23,42,0.08)",
  overflow: "hidden",
  width: "100%",
};

const productPanelHeaderStyle = {
  padding: "12px 18px",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  alignItems: "center",
};

const sectionEyebrowStyle = {
  margin: 0,
  color: "#2563eb",
  fontWeight: 950,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  fontSize: 12,
};

const productGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  padding: 14,
};

const productCardStyle = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  overflow: "hidden",
  boxShadow: "0 12px 34px rgba(15,23,42,0.07)",
  display: "flex",
  flexDirection: "column",
};

const productImageWrapStyle = {
  height: 220,
  background: "#f8fafc",
  overflow: "hidden",
  position: "relative",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  boxSizing: "border-box",
};

const productImageStyle = {
  width: "100%",
  height: "100%",
  maxWidth: "100%",
  maxHeight: "100%",
  objectFit: "contain",
  objectPosition: "center",
  display: "block",
  background: "#ffffff",
  borderRadius: 12,
};

const stockBadgeStyle = {
  position: "absolute",
  top: 12,
  left: 12,
  borderRadius: 999,
  padding: "7px 10px",
  background: "#16a34a",
  color: "white",
  fontWeight: 950,
  fontSize: 12,
};

const outOfStockBadgeStyle = {
  ...stockBadgeStyle,
  background: "#dc2626",
};

const productCategoryStyle = {
  margin: 0,
  color: "#2563eb",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.7,
};

const priceGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const netPriceBoxStyle = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
};

const retailPriceBoxStyle = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 14,
  padding: 12,
};

const priceLabelStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 850,
};

const priceValueStyle = {
  display: "block",
  marginTop: 4,
};

const editProductButtonStyle = {
  border: 0,
  background: "#111827",
  color: "white",
  borderRadius: 14,
  padding: "12px 14px",
  fontWeight: 950,
  cursor: "pointer",
};

const discountSummaryBoxStyle = {
  background: "#f5f3ff",
  border: "1px solid #ddd6fe",
  color: "#5b21b6",
  borderRadius: 14,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const discountSummaryLabelStyle = {
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const discountSummaryValueStyle = {
  fontSize: 16,
  fontWeight: 950,
};

const editProductHintStyle = {
  border: "1px dashed #cbd5e1",
  background: "#f8fafc",
  color: "#334155",
  borderRadius: 14,
  padding: "12px 14px",
  fontWeight: 900,
  textAlign: "center",
};

const newBadgeStyle = {
  borderRadius: 999,
  padding: "4px 8px",
  background: "#dcfce7",
  color: "#166534",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: 0.4,
};

const updatedBadgeStyle = {
  borderRadius: 999,
  padding: "4px 8px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: 0.4,
};

const metaTextStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
};

const productDescriptionStyle = {
  margin: "10px 0 0",
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.5,
  minHeight: 40,
};

const emptyStateStyle = {
  gridColumn: "1 / -1",
  padding: 30,
  color: "#64748b",
  fontWeight: 850,
  textAlign: "center",
};

const toastStyle = {
  position: "fixed",
  right: 18,
  bottom: 18,
  zIndex: 1000,
  background: "#111827",
  color: "white",
  padding: "14px 18px",
  borderRadius: 14,
  boxShadow: "0 20px 60px rgba(15,23,42,0.28)",
  fontWeight: 900,
};

const loginPageStyle = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(37,99,235,0.24), transparent 35%), #0f172a",
  display: "grid",
  placeItems: "center",
  padding: 24,
  boxSizing: "border-box",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
};

const loginCardStyle = {
  width: "min(440px, 100%)",
  background: "white",
  borderRadius: 28,
  padding: 28,
  boxShadow: "0 30px 90px rgba(0,0,0,0.28)",
  border: "1px solid rgba(255,255,255,0.18)",
};

const loginLogoStyle = {
  width: 62,
  height: 62,
  borderRadius: 18,
  background: "linear-gradient(135deg, #111827 0%, #2563eb 55%, #facc15 100%)",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  marginBottom: 18,
};

const loginLabelStyle = {
  display: "block",
  margin: "14px 0 7px",
  color: "#334155",
  fontWeight: 900,
  fontSize: 13,
};

const loginInputStyle = {
  width: "100%",
  border: "1px solid #dbe3ef",
  borderRadius: 16,
  padding: "14px 15px",
  outline: 0,
  fontSize: 15,
  fontWeight: 700,
};

const loginButtonStyle = {
  width: "100%",
  marginTop: 18,
  border: 0,
  borderRadius: 16,
  background: "#111827",
  color: "white",
  padding: "14px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

const loginErrorStyle = {
  marginTop: 14,
  background: "#fee2e2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 14,
  padding: 12,
  fontWeight: 800,
  fontSize: 13,
};

const loginWarningStyle = {
  margin: "0 0 16px",
  background: "#fef3c7",
  color: "#92400e",
  border: "1px solid #fde68a",
  borderRadius: 14,
  padding: 12,
  fontWeight: 800,
  fontSize: 13,
};

export default App;

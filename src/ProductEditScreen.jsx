import React, { useMemo, useRef, useState } from "react";

const LOCAL_CATEGORIES_KEY = "nab-admin-dashboard:product-categories";

function cleanCategory(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function loadLocalCategories() {
  try {
    const raw = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(cleanCategory).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveLocalCategories(categories) {
  try {
    localStorage.setItem(
      LOCAL_CATEGORIES_KEY,
      JSON.stringify(Array.from(new Set(categories.map(cleanCategory).filter(Boolean))))
    );
  } catch {
    // ignore
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toMoney(value) {
  const n = toNumber(value, 0);
  return n.toFixed(2);
}

function clampPercent(value) {
  const n = toNumber(value, 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function calculateDiscountPrice(netPrice, discountPercent) {
  const net = toNumber(netPrice, 0);
  const percent = clampPercent(discountPercent);
  const discounted = net - (net * percent) / 100;
  return Math.max(0, discounted).toFixed(2);
}

function calculateDiscountPercent(netPrice, discountPrice) {
  const net = toNumber(netPrice, 0);
  const discounted = toNumber(discountPrice, 0);

  if (net <= 0) return "";

  const percent = ((net - discounted) / net) * 100;
  return String(Math.max(0, Math.min(100, percent)).toFixed(2)).replace(/\.00$/, "");
}

export default function ProductEditScreen({
  product,
  form,
  onChange,
  onBack,
  onSave,
  onAddCategory,
  saveLoading = false,
  categories = [],
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionEyebrowStyle,
  productCardStyle,
  productImageWrapStyle,
  productImageStyle,
  outOfStockBadgeStyle,
  stockBadgeStyle,
  productCategoryStyle,
  priceGridStyle,
  netPriceBoxStyle,
  priceLabelStyle,
  priceValueStyle,
  retailPriceBoxStyle,
}) {
  const fileInputRef = useRef(null);

  const safeProduct = product || {};
  const safeForm = form || {};

  const retailPriceNumber = toNumber(safeForm.retailPrice, 0);
  const discountPercentValue =
    safeForm.discountPercent !== undefined && safeForm.discountPercent !== null
      ? String(safeForm.discountPercent)
      : calculateDiscountPercent(
          safeForm.netPrice,
          safeForm.discountPrice || safeForm.discount
        );

  const displayDiscountPrice = safeForm.discountPrice || "";

  const [localCategories, setLocalCategories] = useState(() =>
    loadLocalCategories()
  );
  const [categoryMessage, setCategoryMessage] = useState("");

  const categoryNames = useMemo(() => {
    const fromProps = categories
      .map((category) => {
        if (typeof category === "string") return category;
        return category?.name || category?.category || category?.title || "";
      })
      .map(cleanCategory)
      .filter(Boolean);

    return Array.from(new Set([...fromProps, ...localCategories]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [categories, localCategories]);

  const filteredCategories = useMemo(() => {
    const text = cleanCategory(safeForm.category).toLowerCase();

    if (!text) return categoryNames;

    return categoryNames.filter((name) =>
      String(name).toLowerCase().includes(text)
    );
  }, [categoryNames, safeForm.category]);

  const handleRetailPriceChange = (value) => {
    onChange("retailPrice", value);
  };

  const handleDiscountPercentChange = (value) => {
    const percent = value === "" ? "" : String(clampPercent(value));
    onChange("discountPercent", percent);
  };

  const handleDiscountPriceChange = (value) => {
    onChange("discountPrice", value);
    onChange("discountPercent", calculateDiscountPercent(safeForm.retailPrice, value));
  };

  const handleChooseImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      onChange("image", typeof reader.result === "string" ? reader.result : "");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRemoveImage = () => {
    onChange("image", "");
  };

  const handleOpenImage = () => {
    const imageUrl = safeForm.image || safeProduct.image;
    if (!imageUrl || typeof window === "undefined") return;
    window.open(imageUrl, "_blank", "noopener,noreferrer");
  };

  const handleAddCategory = async () => {
    const trimmed = cleanCategory(safeForm.category);

    if (!trimmed) {
      setCategoryMessage("Type a category name first.");
      return;
    }

    const alreadyExists = categoryNames.some(
      (name) => name.toLowerCase() === trimmed.toLowerCase()
    );

    onChange("category", trimmed);

    if (alreadyExists) {
      setCategoryMessage("Category already exists and is selected.");
      return;
    }

    const nextCategories = Array.from(new Set([...localCategories, trimmed]));

    setLocalCategories(nextCategories);
    saveLocalCategories(nextCategories);
    setCategoryMessage("Category added and saved ✅");

    if (typeof onAddCategory === "function") {
      try {
        await onAddCategory(trimmed);
      } catch (error) {
        setCategoryMessage(
          `Category saved locally, but Firebase save failed: ${
            error?.message || "Unknown error"
          }`
        );
      }
    }
  };

  const actionsDisabled = saveLoading;

  return (
    <div style={editPageStyle}>
      <div style={editTopBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={secondaryButtonStyle}>
            ← Back to Products
          </button>

          <div>
            <p style={sectionEyebrowStyle}>Product Editor</p>
            <strong style={{ fontSize: 18 }}>
              {safeProduct.name || "Product"}
            </strong>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" style={secondaryButtonStyle}>
            Duplicate
          </button>

          <button
            type="button"
            onClick={onSave}
            style={primaryButtonStyle}
            disabled={saveLoading}
          >
            {saveLoading ? "Saving..." : "Save Product"}
          </button>
        </div>
      </div>

      <div style={editLayoutStyle}>
        <section style={editFormCardStyle}>
          <div style={editSectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Edit Product</p>
              <h2 style={{ margin: "6px 0 0", fontSize: 30 }}>
                Product Details
              </h2>
            </div>
          </div>

          <div style={editGridStyle}>
            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Product Name</span>
              <input
                value={safeForm.name || ""}
                onChange={(event) => onChange("name", event.target.value)}
                style={editInputStyle}
                placeholder="Product name"
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>SKU</span>
              <input
                value={safeForm.sku || ""}
                onChange={(event) => onChange("sku", event.target.value)}
                style={editInputStyle}
                placeholder="SKU"
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Barcode</span>
              <input
                value={safeForm.barcode || ""}
                onChange={(event) => onChange("barcode", event.target.value)}
                style={editInputStyle}
                placeholder="Barcode"
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Stock</span>
              <input
                value={safeForm.stock || ""}
                onChange={(event) => onChange("stock", event.target.value)}
                style={editInputStyle}
                placeholder="Stock"
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Net Price</span>
              <input
                value={safeForm.netPrice || ""}
                onChange={(event) => onChange("netPrice", event.target.value)}
                style={editInputStyle}
                placeholder="0.00"
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Retail Price</span>
              <input
                value={safeForm.retailPrice || ""}
                onChange={(event) => handleRetailPriceChange(event.target.value)}
                style={editInputStyle}
                placeholder="0.00"
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Discount %</span>
              <input
                value={discountPercentValue}
                onChange={(event) => handleDiscountPercentChange(event.target.value)}
                style={editInputStyle}
                placeholder="Example: 10"
                type="number"
                min="0"
                max="100"
                step="0.01"
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Discount Price</span>
              <input
                value={displayDiscountPrice}
                onChange={(event) => handleDiscountPriceChange(event.target.value)}
                style={editInputStyle}
                placeholder="0.00"
                type="number"
                min="0"
                step="0.01"
              />
            </label>


            <label style={{ ...fieldWrapStyle, gridColumn: "1 / -1" }}>
              <span style={fieldLabelStyle}>Product Description</span>
              <textarea
                value={safeForm.description || ""}
                onChange={(event) =>
                  onChange("description", event.target.value)
                }
                style={editTextareaStyle}
                placeholder="Enter product description"
                rows={5}
              />
            </label>
          </div>

          <div style={{ ...fieldWrapStyle, marginTop: 18 }}>
            <div style={categoryHeaderRowStyle}>
              <span style={fieldLabelStyle}>Categories</span>
              <span style={categoryCountStyle}>
                {filteredCategories.length} shown
              </span>
            </div>

            <div style={categoryInputRowStyle}>
              <input
                value={safeForm.category || ""}
                onChange={(event) => {
                  onChange("category", event.target.value);
                  setCategoryMessage("");
                }}
                style={editInputStyle}
                placeholder="Search or type new category..."
              />

              <button
                type="button"
                onClick={handleAddCategory}
                style={primaryButtonStyle}
                disabled={
                  actionsDisabled || !cleanCategory(safeForm.category)
                }
              >
                + Add
              </button>
            </div>

            {categoryMessage && (
              <div style={categoryMessageStyle}>{categoryMessage}</div>
            )}

            <div style={categoryResultsWrapStyle}>
              {filteredCategories.length > 0 ? (
                filteredCategories.map((categoryName) => {
                  const active =
                    cleanCategory(safeForm.category).toLowerCase() ===
                    categoryName.toLowerCase();

                  return (
                    <button
                      key={categoryName}
                      type="button"
                      onClick={() => {
                        onChange("category", categoryName);
                        setCategoryMessage("");
                      }}
                      style={
                        active
                          ? activeCategoryResultButtonStyle
                          : categoryResultButtonStyle
                      }
                    >
                      <span>{categoryName}</span>
                      {active && (
                        <span style={selectedCategoryBadgeStyle}>Selected</span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div style={categoryEmptyStyle}>
                  No matching categories. Press + Add to save it.
                </div>
              )}
            </div>
          </div>
        </section>

        <aside style={editPreviewCardStyle}>
          <div style={editSectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Image Manager</p>
              <h2 style={{ margin: "6px 0 0", fontSize: 24 }}>
                Product Media
              </h2>
            </div>
          </div>

          <div style={imageManagerCardStyle}>
            <div style={imageManagerPreviewStyle}>
              {safeForm.image || safeProduct.image ? (
                <img
                  src={safeForm.image || safeProduct.image || ""}
                  alt={safeForm.name || safeProduct.name || "Product preview"}
                  style={imageManagerPreviewImgStyle}
                />
              ) : (
                <div style={imageManagerEmptyStyle}>No image selected</div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageFileChange}
            />

            <div style={imageManagerActionsStyle}>
              <button
                type="button"
                onClick={handleChooseImage}
                style={primaryButtonStyle}
                disabled={actionsDisabled}
              >
                Upload Image
              </button>

              <button
                type="button"
                onClick={handleOpenImage}
                style={secondaryButtonStyle}
                disabled={actionsDisabled}
              >
                Show Image
              </button>

              <button
                type="button"
                onClick={handleRemoveImage}
                style={dangerButtonStyle}
                disabled={actionsDisabled}
              >
                Remove Image
              </button>
            </div>
          </div>

          <div style={editSectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Live Preview</p>
              <h2 style={{ margin: "6px 0 0", fontSize: 24 }}>
                Preview Card
              </h2>
            </div>
          </div>

          <article style={productCardStyle}>
            <div style={productImageWrapStyle}>
              {safeForm.image || safeProduct.image ? (
                <img
                  src={safeForm.image || safeProduct.image || ""}
                  alt={safeForm.name || safeProduct.name || "Product preview"}
                  style={productImageStyle}
                />
              ) : (
                <div style={previewNoImageStyle}>No image</div>
              )}

              <span
                style={
                  Number(safeForm.stock) === 0
                    ? outOfStockBadgeStyle
                    : stockBadgeStyle
                }
              >
                {Number(safeForm.stock) === 0
                  ? "Out of stock"
                  : `${safeForm.stock || 0} in stock`}
              </span>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div>
                <p style={productCategoryStyle}>
                  {safeForm.category || "Uncategorised"}
                </p>

                <h3 style={{ margin: "6px 0 0", fontSize: 18 }}>
                  {safeForm.name || "Untitled Product"}
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
                  <span>SKU: {safeForm.sku || safeProduct.sku || "-"}</span>
                  <span>
                    Barcode: {safeForm.barcode || safeProduct.barcode || "-"}
                  </span>
                </div>

                <p style={previewDescriptionStyle}>
                  {safeForm.description ||
                    safeProduct.description ||
                    "No description added yet."}
                </p>
              </div>

              <div style={priceGridStyle}>
                <div style={netPriceBoxStyle}>
                  <span style={priceLabelStyle}>Net</span>
                  <strong style={priceValueStyle}>
                    £{Number(safeForm.netPrice || 0).toFixed(2)}
                  </strong>
                </div>

                <div style={retailPriceBoxStyle}>
                  <span style={{ ...priceLabelStyle, color: "#2563eb" }}>
                    Retail
                  </span>
                  <strong style={{ ...priceValueStyle, color: "#1d4ed8" }}>
                    £{Number(safeForm.retailPrice || 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div style={discountPriceBoxStyle}>
                <span style={{ ...priceLabelStyle, color: "#7c3aed" }}>
                  Discount
                </span>
                <strong style={{ ...priceValueStyle, color: "#6d28d9" }}>
                  £
{Number(displayDiscountPrice || 0).toFixed(2)}
                </strong>
              </div>
            </div>
          </article>
        </aside>
      </div>
    </div>
  );
}

const editPageStyle = {
  minHeight: "100vh",
  background: "#f4f6f8",
  padding: 18,
  boxSizing: "border-box",
  display: "grid",
  gap: 18,
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
};

const editTopBarStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 18,
  padding: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  boxShadow: "0 16px 45px rgba(15,23,42,0.06)",
};

const editLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: 18,
  alignItems: "start",
};

const editFormCardStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 16px 45px rgba(15,23,42,0.06)",
};

const editPreviewCardStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 16px 45px rgba(15,23,42,0.06)",
  display: "grid",
  gap: 18,
};

const editSectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 18,
};

const editGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
};

const fieldWrapStyle = {
  display: "grid",
  gap: 8,
};

const fieldLabelStyle = {
  color: "#334155",
  fontSize: 13,
  fontWeight: 900,
};

const editInputStyle = {
  width: "100%",
  border: "1px solid #dbe3ef",
  borderRadius: 14,
  padding: "14px 15px",
  outline: 0,
  fontSize: 15,
  fontWeight: 700,
  boxSizing: "border-box",
  background: "#fff",
};

const editTextareaStyle = {
  width: "100%",
  border: "1px solid #dbe3ef",
  borderRadius: 14,
  padding: "14px 15px",
  outline: 0,
  fontSize: 15,
  fontWeight: 700,
  boxSizing: "border-box",
  background: "#fff",
  resize: "vertical",
  minHeight: 120,
  fontFamily: "inherit",
  color: "#111827",
};

const categoryInputRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
};

const categoryMessageStyle = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 800,
};

const imageManagerCardStyle = {
  display: "grid",
  gap: 14,
  padding: 14,
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#f8fafc",
};

const imageManagerPreviewStyle = {
  minHeight: 240,
  borderRadius: 18,
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

const imageManagerPreviewImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  padding: 16,
  boxSizing: "border-box",
};

const imageManagerEmptyStyle = {
  color: "#64748b",
  fontWeight: 800,
};

const imageManagerActionsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const categoryHeaderRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const categoryCountStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
};

const categoryResultsWrapStyle = {
  display: "grid",
  gap: 8,
  maxHeight: 220,
  overflowY: "auto",
  padding: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#f8fafc",
};

const categoryResultButtonStyle = {
  border: "1px solid #dbe3ef",
  background: "white",
  color: "#111827",
  borderRadius: 12,
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 800,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const activeCategoryResultButtonStyle = {
  ...categoryResultButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const selectedCategoryBadgeStyle = {
  borderRadius: 999,
  padding: "4px 8px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontSize: 11,
  fontWeight: 900,
};

const categoryEmptyStyle = {
  color: "#64748b",
  fontWeight: 700,
  textAlign: "center",
  padding: 10,
};

const discountAutoBoxStyle = {
  background: "linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)",
  border: "1px solid #ddd6fe",
  borderRadius: 16,
  padding: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
};

const discountAutoLabelStyle = {
  display: "block",
  color: "#7c3aed",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const discountAutoValueStyle = {
  display: "block",
  marginTop: 5,
  color: "#111827",
  fontSize: 16,
  fontWeight: 950,
};

const discountAutoSmallStyle = {
  display: "block",
  marginTop: 5,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 850,
};

const discountAutoActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const miniPrimaryButtonStyle = {
  border: "1px solid #7c3aed",
  background: "#7c3aed",
  color: "white",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 950,
  cursor: "pointer",
};

const miniSecondaryButtonStyle = {
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#111827",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 950,
  cursor: "pointer",
};

const discountPriceBoxStyle = {
  background: "#f5f3ff",
  border: "1px solid #ddd6fe",
  borderRadius: 14,
  padding: 12,
};

const previewDescriptionStyle = {
  margin: "10px 0 0",
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.55,
};

const previewNoImageStyle = {
  width: "100%",
  minHeight: 180,
  display: "grid",
  placeItems: "center",
  color: "#64748b",
  fontWeight: 900,
  background: "#f8fafc",
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

import React, { useMemo, useRef, useState } from "react";

export default function ProductEditScreen({
  product,
  form,
  onChange,
  onBack,
  onSave,
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

  const categoryNames = useMemo(() => {
    return Array.from(
      new Set(categories.map((category) => category?.name).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const text = String(safeForm.category || "").trim().toLowerCase();

    if (!text) return categoryNames;

    return categoryNames.filter((name) =>
      String(name).toLowerCase().includes(text)
    );
  }, [categoryNames, safeForm.category]);

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

  const handleAddCategory = () => {
    const trimmed = String(safeForm.category || "").trim();
    if (!trimmed) return;
    onChange("category", trimmed);
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
            <strong style={{ fontSize: 18 }}>{safeProduct.name || "Product"}</strong>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={secondaryButtonStyle}>Duplicate</button>
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
              <h2 style={{ margin: "6px 0 0", fontSize: 30 }}>Product Details</h2>
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
                onChange={(event) => onChange("retailPrice", event.target.value)}
                style={editInputStyle}
                placeholder="0.00"
              />
            </label>
            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Discount Price</span>
              <input
                value={safeForm.discountPrice || safeForm.discount || ""}
                onChange={(event) => onChange("discountPrice", event.target.value)}
                style={editInputStyle}
                placeholder="0.00"
              />
            </label>
            <label style={{ ...fieldWrapStyle, gridColumn: "1 / -1" }}>
              <span style={fieldLabelStyle}>Product Description</span>
              <textarea
                value={safeForm.description || ""}
                onChange={(event) => onChange("description", event.target.value)}
                style={editTextareaStyle}
                placeholder="Enter product description"
                rows={5}
              />
            </label>
          </div>

          <div style={{ ...fieldWrapStyle, marginTop: 18 }}>
            <div style={categoryHeaderRowStyle}>
              <span style={fieldLabelStyle}>Categories</span>
              <span style={categoryCountStyle}>{filteredCategories.length} shown</span>
            </div>

            <div style={categoryInputRowStyle}>
              <input
                value={safeForm.category || ""}
                onChange={(event) => onChange("category", event.target.value)}
                style={editInputStyle}
                placeholder="Search or select category..."
              />
              <button
                type="button"
                onClick={handleAddCategory}
                style={primaryButtonStyle}
                disabled={actionsDisabled || !String(safeForm.category || "").trim()}
              >
                Add
              </button>
            </div>

            <div style={categoryResultsWrapStyle}>
              {filteredCategories.length > 0 ? (
                filteredCategories.map((categoryName) => {
                  const active = (safeForm.category || "") === categoryName;
                  return (
                    <button
                      key={categoryName}
                      type="button"
                      onClick={() => onChange("category", categoryName)}
                      style={active ? activeCategoryResultButtonStyle : categoryResultButtonStyle}
                    >
                      <span>{categoryName}</span>
                      {active && <span style={selectedCategoryBadgeStyle}>Selected</span>}
                    </button>
                  );
                })
              ) : (
                <div style={categoryEmptyStyle}>No matching categories</div>
              )}
            </div>
          </div>
        </section>

        <aside style={editPreviewCardStyle}>
          <div style={editSectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Image Manager</p>
              <h2 style={{ margin: "6px 0 0", fontSize: 24 }}>Product Media</h2>
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
              <button type="button" onClick={handleChooseImage} style={primaryButtonStyle} disabled={actionsDisabled}>
                Upload Image
              </button>
              <button type="button" onClick={handleOpenImage} style={secondaryButtonStyle} disabled={actionsDisabled}>
                Show Image
              </button>
              <button type="button" onClick={handleRemoveImage} style={dangerButtonStyle} disabled={actionsDisabled}>
                Remove Image
              </button>
            </div>
          </div>

          <div style={editSectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Live Preview</p>
              <h2 style={{ margin: "6px 0 0", fontSize: 24 }}>Preview Card</h2>
            </div>
          </div>

          <article style={productCardStyle}>
            <div style={productImageWrapStyle}>
              <img
                src={safeForm.image || safeProduct.image || ""}
                alt={safeForm.name || safeProduct.name || "Product preview"}
                style={productImageStyle}
              />
              <span
                style={
                  Number(safeForm.stock) === 0 ? outOfStockBadgeStyle : stockBadgeStyle
                }
              >
                {Number(safeForm.stock) === 0
                  ? "Out of stock"
                  : `${safeForm.stock || 0} in stock`}
              </span>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div>
                <p style={productCategoryStyle}>{safeForm.category || "Uncategorised"}</p>
                <h3 style={{ margin: "6px 0 0", fontSize: 18 }}>
                  {safeForm.name || "Untitled Product"}
                </h3>
                <div style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13, display: "grid", gap: 4 }}>
                  <span>SKU: {safeForm.sku || safeProduct.sku || "-"}</span>
                  <span>Barcode: {safeForm.barcode || safeProduct.barcode || "-"}</span>
                </div>
                <p style={previewDescriptionStyle}>
                  {safeForm.description || safeProduct.description || "No description added yet."}
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
                  <span style={{ ...priceLabelStyle, color: "#2563eb" }}>Retail</span>
                  <strong style={{ ...priceValueStyle, color: "#1d4ed8" }}>
                    £{Number(safeForm.retailPrice || 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div style={discountPriceBoxStyle}>
                <span style={{ ...priceLabelStyle, color: "#7c3aed" }}>Discount</span>
                <strong style={{ ...priceValueStyle, color: "#6d28d9" }}>
                  £{Number(safeForm.discountPrice || safeForm.discount || 0).toFixed(2)}
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
const dangerButtonStyle = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 950,
  cursor: "pointer",
};

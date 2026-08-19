import React, { useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import "./mobileAdmin.css";

const Icon = ({ name }) => <span className={`ma-ui-icon ${name}`} aria-hidden />;
const Switch = ({ checked, onChange }) => <button type="button" role="switch" aria-checked={checked} className={`ma-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span/></button>;

function namesFrom(categories) {
  return categories.map(item => typeof item === "string" ? item : item?.name || item?.title).filter(Boolean);
}

export default function ProductEditScreen({
  product = {}, form = {}, onChange, onBack, onSave, onAddCategory,
  saveLoading = false, categories = [], storage,
}) {
  const fileRef = useRef(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const categoryNames = useMemo(() => Array.from(new Set(namesFrom(categories))), [categories]);
  const image = form.image || product.image || product.imageUrl;
  const bool = (field, fallback = false) => form[field] === undefined ? fallback : Boolean(form[field]);
  const quantity = Number(form.stock || 0);

  async function chooseImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!storage) {
      setImageError("Firebase Storage is unavailable.");
      return;
    }
    setImageUploading(true);
    setImageError("");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const productFolder = product.id || `new-${Date.now()}`;
      const imageRef = ref(storage, `products/${productFolder}/${Date.now()}-${safeName}`);
      await uploadBytes(imageRef, file, { contentType: file.type || "image/jpeg" });
      onChange("image", await getDownloadURL(imageRef));
    } catch (error) {
      setImageError(error?.message || "The product image could not be uploaded.");
    } finally {
      setImageUploading(false);
      event.target.value = "";
    }
  }

  async function addCategory() {
    const value = String(form.category || "").trim();
    if (value && onAddCategory) await onAddCategory(value);
    setCategoryOpen(false);
  }

  return <div className="ma-page ma-editor-page">
    <header className="ma-editor-header">
      <button className="ma-close" onClick={onBack}>Close</button>
      <div><span className="ma-eyebrow">{product.id ? "Product management" : "New catalogue item"}</span><h1>{product.id ? "Edit product" : "Add product"}</h1></div>
      <button className="ma-primary ma-desktop-save" onClick={onSave} disabled={saveLoading || imageUploading}>{imageUploading ? "Uploading image…" : saveLoading ? "Saving…" : "Save changes"}</button>
    </header>
    <main className="ma-editor-body">
      <>
        <section className="ma-edit-card ma-media-card">
          <div className="ma-product-photo">
            {image ? <img src={image} alt={form.name || "Product"}/> : <div className="ma-image-empty"><Icon name="image"/><span>Add a product image</span></div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseImage}/>
          <button className="ma-image-button" type="button" disabled={imageUploading} onClick={() => fileRef.current?.click()}><Icon name="camera"/> {imageUploading ? "Uploading image…" : "Change product image"}</button>
          {imageError && <div className="ma-image-error">{imageError}</div>}
          <label className="ma-field"><span>Image URL</span><input value={form.image || ""} onChange={e => onChange("image", e.target.value)} placeholder="https://…"/></label>
        </section>

        <section className="ma-edit-card">
          <div className="ma-card-heading"><span className="ma-eyebrow">Product information</span><h2>Details</h2></div>
          <div className="ma-form-grid">
            <label className="ma-field full"><span>Product name</span><input value={form.name || ""} onChange={e => onChange("name", e.target.value)} placeholder="Product name"/></label>
            <label className="ma-field"><span>SKU (optional)</span><input value={form.sku || ""} onChange={e => onChange("sku", e.target.value)} placeholder="SKU"/></label>
            <label className="ma-field"><span>Barcode</span><div className="ma-input-action"><input value={form.barcode || ""} onChange={e => onChange("barcode", e.target.value)} placeholder="Barcode"/><button type="button"><Icon name="scan"/></button></div></label>
            <label className="ma-field"><span>Retail price</span><div className="ma-prefix-input"><b>£</b><input type="number" step=".01" value={form.retailPrice || ""} onChange={e => onChange("retailPrice", e.target.value)} placeholder="0.00"/></div></label>
            <label className="ma-field"><span>Cost price</span><div className="ma-prefix-input"><b>£</b><input type="number" step=".01" value={form.netPrice || ""} onChange={e => onChange("netPrice", e.target.value)} placeholder="0.00"/></div></label>
            <label className="ma-field full"><span>Special price</span><div className="ma-prefix-input"><b>£</b><input type="number" min="0" step=".01" value={form.specialPrice || ""} onChange={e => onChange("specialPrice", e.target.value)} placeholder="0.00"/></div><small className="ma-field-help">Saved as the product's special and discounted selling price.</small></label>
            <label className="ma-field full"><span>Description</span><textarea value={form.description || ""} onChange={e => onChange("description", e.target.value)} placeholder="Describe this product"/></label>
          </div>
        </section>

        <section className="ma-edit-card">
          <div className="ma-form-grid">
            <div className="ma-field full ma-select-wrap"><span>Category</span><button type="button" className="ma-select-button" onClick={() => setCategoryOpen(!categoryOpen)}>{form.category || "Choose a category"} <b>⌄</b></button>
              {categoryOpen && <div className="ma-select-menu">{categoryNames.map(name => <button type="button" key={name} onClick={() => { onChange("category", name); setCategoryOpen(false); }}>{name}</button>)}<div><input value={form.category || ""} onChange={e => onChange("category", e.target.value)} placeholder="New category"/><button type="button" onClick={addCategory}>Add</button></div></div>}
            </div>
            <label className="ma-field full"><span>Supplier</span><input value={form.supplier || ""} onChange={e => onChange("supplier", e.target.value)} placeholder="Supplier name"/><small className="ma-field-help">The supplier is saved with this product.</small></label>
            <label className="ma-field"><span>Status</span><select value={form.status || "Active"} onChange={e => onChange("status", e.target.value)}><option>Active</option><option>Draft</option><option>Archived</option></select></label>
            <label className="ma-field full"><span>Admin notes</span><textarea value={form.adminNotes || ""} onChange={e => onChange("adminNotes", e.target.value)} placeholder="Private notes for administrators"/><small className="ma-field-help">These notes are saved privately with the product.</small></label>
          </div>
        </section>
        <div className="ma-inline-section-heading"><span className="ma-eyebrow">Stock management</span><h2>Inventory</h2><p>Location, quantities, availability and internal stock information.</p></div>
        <section className="ma-edit-card">
          <div className="ma-card-heading"><span className="ma-eyebrow">Stock control</span><h2>Inventory</h2></div>
          <label className="ma-field"><span>Stock location</span><select value={form.stockLocation || "Main Warehouse"} onChange={e => onChange("stockLocation", e.target.value)}><option>Main Warehouse</option><option>Workshop</option><option>Parts counter</option></select></label>
          <div className="ma-quantity"><span>Stock quantity</span><div><button type="button" onClick={() => onChange("stock", String(Math.max(0, quantity - 1)))}>−</button><strong>{quantity}</strong><button type="button" onClick={() => onChange("stock", String(quantity + 1))}>＋</button></div></div>
          <div className="ma-reorder"><span>Reorder level</span><input type="number" min="0" value={form.reorderLevel ?? 5} onChange={e => onChange("reorderLevel", e.target.value)}/></div>
          <label className="ma-field"><span>Warehouse bin</span><input value={form.warehouseBin || ""} onChange={e => onChange("warehouseBin", e.target.value)} placeholder="A12-05-03"/></label>
          <div className="ma-bin-grid">
            {[["shelf", "Shelf", "A"], ["row", "Row", "05"], ["binNumber", "Number", "03"]].map(([field, label, placeholder]) => <label className="ma-field" key={field}><span>{label}</span><input value={form[field] || ""} onChange={e => onChange(field, e.target.value)} placeholder={placeholder}/></label>)}
          </div>
        </section>
        <section className="ma-edit-card ma-switches">
          <div><span>Track inventory</span><Switch checked={bool("trackInventory", true)} onChange={value => onChange("trackInventory", value)}/></div>
          <div><span>Low stock alert</span><Switch checked={bool("lowStockAlert", true)} onChange={value => onChange("lowStockAlert", value)}/></div>
          <div><span>Allow sale when out of stock</span><Switch checked={bool("allowOutOfStock", false)} onChange={value => onChange("allowOutOfStock", value)}/></div>
        </section>
        <button type="button" className="ma-history">↶ <span>Stock history</span><b>›</b></button>
      </>
    </main>
    <footer className="ma-save-bar"><button className="ma-primary" onClick={onSave} disabled={saveLoading || imageUploading}><Icon name="save"/>{imageUploading ? "Uploading image…" : saveLoading ? "Saving…" : "Save changes"}</button></footer>
  </div>;
}

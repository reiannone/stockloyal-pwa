import React, { useEffect, useState, useRef, useCallback } from "react";
import { apiGet, apiPost } from "../api.js";
import ConfirmModal from "../components/ConfirmModal";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";

// ✅ Custom upload adapter for CKEditor images
class MyUploadAdapter {
  constructor(loader) {
    this.loader = loader;
  }

  upload() {
    return this.loader.file.then(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();

          reader.onload = () => {
            // Convert image to base64 data URI
            resolve({
              default: reader.result,
            });
          };

          reader.onerror = (error) => {
            reject(error);
          };

          reader.readAsDataURL(file);
        })
    );
  }

  abort() {
    // Reject promise on abort
  }
}

// Plugin to use the custom adapter
function MyCustomUploadAdapterPlugin(editor) {
  editor.plugins.get("FileRepository").createUploadAdapter = (loader) => {
    return new MyUploadAdapter(loader);
  };
}

export default function AdminFAQ() {
  const [faqs, setFaqs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const editPanelRef = useRef(null);

  // Confirm modal state
  const [modal, setModal] = useState({
    show: false, title: "", message: "", icon: null,
    confirmText: "Confirm", confirmColor: "#007bff", data: null,
  });
  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  const showNotify = (title, message, isError = false) => {
    setModal({
      show: true, title, message,
      icon: null, data: null,
      confirmText: "OK",
      confirmColor: isError ? "#dc2626" : "#007bff",
    });
  };

  const handleEditClick = useCallback((faq) => {
    setSelected({ ...faq });
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const data = await apiGet("get-faqs.php");
      if (data?.success) {
        setFaqs(data.faqs || []);
        if (selected) {
          const ref = (data.faqs || []).find(
            (f) => String(f.faq_id) === String(selected.faq_id)
          );
          if (ref) setSelected({ ...ref });
        }
      } else {
        console.warn("[AdminFAQ] get-faqs error:", data?.error);
      }
    } catch (e) {
      console.error("[AdminFAQ] get-faqs failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveFaq = async (e) => {
    e.preventDefault();
    if (!selected) return;

    const res = await apiPost("save-faq.php", selected);
    if (!res?.success) {
      showNotify("Save Failed", res?.error || "Unknown error", true);
      return;
    }

    const data = await apiGet("get-faqs.php").catch(() => null);
    if (data?.success) {
      setFaqs(data.faqs || []);
      const current = (data.faqs || []).find(
        (f) => String(f.faq_id) === String(res.faq?.faq_id ?? selected.faq_id)
      );
      setSelected(current || null);
    }

    showNotify("Saved", "FAQ saved successfully.");
  };

  const deleteFaq = (faq_id) => {
    setModal({
      show: true,
      title: "Delete FAQ",
      icon: null,
      message: `Delete FAQ #${faq_id}? This action cannot be undone.`,
      confirmText: "Delete",
      confirmColor: "#dc2626",
      data: { faq_id },
    });
  };

  const executeDelete = async (faq_id) => {
    closeModal();
    try {
      const res = await apiPost("delete-faq.php", { faq_id });
      if (!res?.success) {
        showNotify("Delete Failed", res?.error || "Unknown error", true);
        return;
      }
      const updated = faqs.filter((f) => String(f.faq_id) !== String(faq_id));
      setFaqs(updated);
      setSelected(null);
      showNotify("Deleted", "FAQ has been deleted.");
    } catch (e) {
      console.error("[AdminFAQ] delete-faq failed:", e);
      showNotify("Delete Failed", "Network or server error.", true);
    }
  };

  const handleModalConfirm = () => {
    if (modal.data?.faq_id) {
      executeDelete(modal.data.faq_id);
    } else {
      closeModal();
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSelected((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (checked ? 1 : 0) : value,
    }));
  };

  const newFaq = () => {
    setSelected({
      faq_id: null,
      question: "",
      answer_html: "",
      category: "",
      tags_csv: "",
      sort_order: 0,
      is_active: 1,
    });
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <div id="adminfaq-container" className="app-container app-content">
      <h1 className="page-title">FAQ Admin</h1>
      <p className="page-deck">Create and manage FAQs to present on a public FAQ page later.</p>

      {/* Edit Panel — only visible when a row is clicked */}
      {selected && (
        <div className="card" ref={editPanelRef} style={{ overflowX: "hidden", maxWidth: "100%", marginBottom: "1rem" }}>
          <h2 className="subheading" style={{ marginTop: 0 }}>
            {selected.faq_id ? `Edit FAQ #${selected.faq_id}` : "New FAQ"}
          </h2>
          <form onSubmit={saveFaq} className="form-grid" style={{ maxWidth: "100%" }}>
            <FormRow label="FAQ ID">
              <input
                className="form-input"
                type="text"
                name="faq_id"
                value={selected?.faq_id ?? ""}
                onChange={handleChange}
                disabled
                placeholder="(auto)"
              />
            </FormRow>

            <FormRow label="Question">
              <input
                className="form-input"
                type="text"
                name="question"
                value={selected?.question || ""}
                onChange={handleChange}
                required
              />
            </FormRow>

            <FormRow label="Category">
              <input
                className="form-input"
                type="text"
                name="category"
                value={selected?.category || ""}
                onChange={handleChange}
                placeholder="e.g., Wallet, Orders, Brokers"
              />
            </FormRow>

            <FormRow label="Tags (CSV)">
              <input
                className="form-input"
                type="text"
                name="tags_csv"
                value={selected?.tags_csv || ""}
                onChange={handleChange}
                placeholder="comma,separated,tags"
              />
            </FormRow>

            <FormRow label="Sort Order">
              <input
                className="form-input"
                type="number"
                name="sort_order"
                value={selected?.sort_order ?? 0}
                onChange={handleChange}
              />
            </FormRow>

            {/* Answer (WYSIWYG) */}
            <div
              className="form-row"
              style={{ flexDirection: "column", alignItems: "stretch", marginBottom: "1rem" }}
            >
              <label className="wysiwyg-label" style={{ marginBottom: "0.25rem", textAlign: "left" }}>
                Answer:
              </label>
              <CKEditor
                editor={ClassicEditor}
                data={selected?.answer_html || ""}
                onChange={(event, editor) => {
                  const data = editor.getData();
                  setSelected((prev) => ({ ...prev, answer_html: data }));
                }}
                config={{
                  placeholder: "Write the answer here...",
                  // ✅ Enable image upload plugin
                  extraPlugins: [MyCustomUploadAdapterPlugin],
                  // ✅ Add image toolbar options
                  toolbar: {
                    items: [
                      'heading',
                      '|',
                      'bold',
                      'italic',
                      'link',
                      'bulletedList',
                      'numberedList',
                      '|',
                      'imageUpload',
                      'blockQuote',
                      'insertTable',
                      'mediaEmbed',
                      '|',
                      'undo',
                      'redo'
                    ]
                  },
                  // ✅ Image configuration
                  image: {
                    toolbar: [
                      'imageTextAlternative',
                      'imageStyle:inline',
                      'imageStyle:block',
                      'imageStyle:side',
                      '|',
                      'toggleImageCaption',
                      'linkImage'
                    ]
                  }
                }}
              />
            </div>

            <FormRow label="Active">
              <input
                type="checkbox"
                name="is_active"
                checked={!!selected?.is_active}
                onChange={handleChange}
              />
            </FormRow>

            <div className="card-actions">
              <button type="submit" className="btn-primary">Save FAQ</button>
              {selected?.faq_id && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={() => deleteFaq(selected.faq_id)}
                >
                  Delete FAQ
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FAQ Records Table */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h2 className="subheading" style={{ margin: 0 }}>FAQ Records</h2>
        <button type="button" className="btn-secondary" onClick={newFaq}>
          + New FAQ
        </button>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Question</th>
                <th>Category</th>
                <th>Active</th>
                <th>Sort</th>
              </tr>
            </thead>
            <tbody>
              {(faqs || []).map((f) => (
                <tr 
                  key={f.faq_id}
                  onClick={() => handleEditClick(f)}
                  style={{ cursor: 'pointer' }}
                  title="Click to edit this FAQ"
                >
                  <td>{f.faq_id}</td>
                  <td>{f.question}</td>
                  <td>{f.category || "-"}</td>
                  <td>{f.is_active ? "Yes" : "No"}</td>
                  <td>{Number.isFinite(+f.sort_order) ? f.sort_order : "-"}</td>
                </tr>
              ))}
              {faqs?.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", color: "#6b7280" }}>
                    No FAQs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        icon={modal.icon}
        confirmText={modal.confirmText}
        confirmColor={modal.confirmColor}
        onConfirm={handleModalConfirm}
        onCancel={closeModal}
      />
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div className="form-row" style={{ maxWidth: "100%", boxSizing: "border-box" }}>
      {label && <label className="form-label">{label}:</label>}
      <div style={{ maxWidth: "100%", boxSizing: "border-box" }}>
        {children}
      </div>
    </div>
  );
}

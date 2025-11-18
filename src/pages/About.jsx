// src/pages/About.jsx
import React, { useEffect, useState } from "react";
import { apiGet } from "../api.js";

export default function About() {
  const [faqs, setFaqs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchFaqs = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("get-faqs.php");

      if (!data?.success) {
        console.warn("[About/FAQ] get-faqs error:", data?.error);
        setError(data?.error || "Unable to load FAQs.");
        setFaqs([]);
        setSelectedId("");
        return;
      }

      const raw = data.faqs || [];

      // Only show active FAQs
      const activeFaqs = raw
        .filter((f) => !!f.is_active)
        .sort((a, b) => {
          const sa = Number.isFinite(+a.sort_order) ? +a.sort_order : 9999;
          const sb = Number.isFinite(+b.sort_order) ? +b.sort_order : 9999;
          if (sa !== sb) return sa - sb;
          const qa = (a.question || "").toLowerCase();
          const qb = (b.question || "").toLowerCase();
          if (qa < qb) return -1;
          if (qa > qb) return 1;
          return 0;
        });

      setFaqs(activeFaqs);

      if (activeFaqs.length) {
        // Default to sort_order === 0 if possible
        const defaultFaq =
          activeFaqs.find((f) => Number(f.sort_order) === 0) || activeFaqs[0];
        setSelectedId(String(defaultFaq.faq_id));
      } else {
        setSelectedId("");
      }
    } catch (e) {
      console.error("[About/FAQ] get-faqs failed:", e);
      setError("Network or server error while loading FAQs.");
      setFaqs([]);
      setSelectedId("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedFaq =
    faqs.find((f) => String(f.faq_id) === String(selectedId)) ||
    faqs[0] ||
    null;

  return (
    <div className="about-container">
      <h2 className="page-title">About StockLoyal & FAQs</h2>

      <section className="about-section">
        <p className="body-text">
          Learn more about how StockLoyal works and find answers to common
          questions. These FAQs are maintained by the admin team and are
          read-only here.
        </p>
      </section>

      {/* Loading / error states */}
      {loading && (
        <section className="about-section">
          <p className="body-text">Loading FAQs...</p>
        </section>
      )}

      {!loading && error && (
        <section className="about-section">
          <p className="body-text" style={{ color: "#dc2626" }}>
            {error}
          </p>
        </section>
      )}

      {!loading && !error && !faqs.length && (
        <section className="about-section">
          <p className="body-text">
            No FAQs are available yet. Please check back later.
          </p>
        </section>
      )}

      {/* FAQ selector + current FAQ card */}
      {!loading && !error && faqs.length > 0 && (
        <>
          {/* Dropdown of questions at the top */}
          <section className="about-section">
            <div className="form-row">
              <label className="form-label" htmlFor="faqSelect">
                Question
              </label>
              <select
                id="faqSelect"
                className="form-input"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {faqs.map((f) => (
                  <option key={f.faq_id} value={f.faq_id}>
                    {f.question}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Card view for the current FAQ */}
          <section className="about-section">
            <div className="card">
              {selectedFaq ? (
                <>
                  {/* Question in the card view */}
                  <h3 className="heading-md" style={{ marginBottom: "0.5rem" }}>
                    {selectedFaq.question}
                  </h3>

                  {selectedFaq.category && (
                    <p
                      className="body-text"
                      style={{
                        fontSize: "0.8rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "#6b7280",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {selectedFaq.category}
                    </p>
                  )}

                  <div
                    className="body-text"
                    style={{ lineHeight: 1.6 }}
                    // answer_html comes from admin WYSIWYG and is read-only here.
                    dangerouslySetInnerHTML={{
                      __html:
                        selectedFaq.answer_html ||
                        "<p>No answer has been provided for this question yet.</p>",
                    }}
                  />
                </>
              ) : (
                <p className="body-text">
                  Select a question from the dropdown above to view its answer.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      <footer className="about-footer">
        &copy; {new Date().getFullYear()} StockLoyal LLC. All rights reserved.
      </footer>
    </div>
  );
}

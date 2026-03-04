// src/components/VoiceAssistant.jsx
// ═══════════════════════════════════════════════════════════════════════════════
// StockLoyal Voice Assistant — AI-powered conversational overlay widget
//
// Floating mic button → expandable panel with voice-driven navigation
// through the full StockLoyal journey: onboarding, broker, election,
// stock picking, wallet queries, and portfolio management.
//
// Uses Browser Web Speech API (SpeechRecognition + SpeechSynthesis)
// Calls existing StockLoyal PHP APIs via apiPost()
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import STOCKLOYAL_KNOWLEDGE from "../data/stockloyal-knowledge.js";
import {
  Mic,
  MicOff,
  X,
  MessageCircle,
  ChevronDown,
  Volume2,
  VolumeX,
  Loader2,
  Sparkles,
} from "lucide-react";

// ── Intent definitions ───────────────────────────────────────────────────────
// ONLY match explicit navigation commands. Questions go to Claude API.
// "go to wallet" → navigate. "what is my wallet?" → Claude answers.
const INTENTS = [
  { id: "navigate_profile", patterns: [/\b(go to|open|show|take me to)\b.*\b(profile|onboard)/i] },
  { id: "navigate_broker",  patterns: [/\b(go to|open|show|take me to)\b.*\bbroker/i] },
  { id: "navigate_election",patterns: [/\b(go to|open|show|take me to)\b.*\belection/i] },
  { id: "navigate_wallet",  patterns: [/\b(go to|open|show|take me to)\b.*\bwallet/i] },
  { id: "navigate_picker",  patterns: [/\b(go to|open|show|take me to)\b.*\b(stock picker|picker|basket)/i, /^(pick stocks|buy stocks|fill.*basket)$/i] },
  { id: "navigate_portfolio",patterns: [/\b(go to|open|show|take me to)\b.*\bportfolio/i] },
  { id: "navigate_orders",  patterns: [/\b(go to|open|show|take me to)\b.*\b(orders|order history|transactions)/i] },
  { id: "navigate_ledger",  patterns: [/\b(go to|open|show|take me to)\b.*\bledger/i] },
  { id: "navigate_funding", patterns: [/\b(go to|open|show|take me to)\b.*\bfunding/i, /\b(funding history|where.*my money|money flow|journals|deposits)\b/i] },
  { id: "navigate_trades",  patterns: [/\b(go to|open|show|take me to)\b.*\b(trade history|trades|alpaca.*trade)/i, /\b(trade history|my trades|recent trades|alpaca transactions)\b/i] },
  { id: "navigate_home",    patterns: [/\b(go to|open|take me to)\b.*\b(home|landing|dashboard)/i, /^(go home)$/i] },
  { id: "navigate_terms",   patterns: [/\b(go to|open|show|take me to)\b.*\bterms/i] },
  { id: "navigate_social",  patterns: [/\b(go to|open|show|take me to)\b.*\b(social|community|feed)/i] },
  { id: "navigate_promos",  patterns: [/\b(go to|open|show|take me to)\b.*\b(promo|promotion)/i] },
  { id: "navigate_about",   patterns: [/\b(go to|open|show|take me to)\b.*\b(about|faq)/i] },
  { id: "goodbye",          patterns: [/^(bye|goodbye|see you|that's all|close)$/i, /^(thanks|thank you)$/i] },
];

function matchIntent(text) {
  const t = text.trim();
  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(t)) return intent.id;
    }
  }
  return "unknown";
}

// ── Navigation map ───────────────────────────────────────────────────────────
const NAV_MAP = {
  navigate_profile:   { path: "/member-onboard",    label: "Member Profile" },
  navigate_broker:    { path: "/select-broker",      label: "Select Broker" },
  navigate_election:  { path: "/election",           label: "Investment Election" },
  navigate_wallet:    { path: "/wallet",             label: "Wallet" },
  navigate_picker:    { path: "/stock-picker",       label: "Stock Picker" },
  navigate_portfolio: { path: "/portfolio",          label: "Portfolio" },
  navigate_orders:    { path: "/transactions",       label: "Trade Orders" },
  navigate_ledger:    { path: "/ledger",             label: "Transaction Ledger" },
  navigate_funding:   { path: "/funding-history",    label: "Brokerage Funding History" },
  navigate_trades:    { path: "/alpaca-transactions",label: "Brokerage Trade History" },
  navigate_home:      { path: "/stockloyal-landing", label: "Home" },
  navigate_terms:     { path: "/terms",              label: "Terms & Conditions" },
  navigate_social:    { path: "/social",             label: "Community Feed" },
  navigate_promos:    { path: "/promotions",         label: "Promotions" },
  navigate_about:     { path: "/about",              label: "About & FAQs" },
};

// ── Build system prompt from knowledge base ──────────────────────────────────
function buildSystemPrompt(memberContext, liveFaqs) {
  const sections = Object.entries(STOCKLOYAL_KNOWLEDGE)
    .map(([key, val]) => `## ${key.toUpperCase()}\n${val.trim()}`)
    .join("\n\n");

  const faqBlock = liveFaqs
    ? `\n\nLIVE FAQ FROM DATABASE (most up-to-date — prefer these over static FAQ above):\n${liveFaqs}`
    : "";

  return `You are the StockLoyal AI Voice Assistant embedded in the StockLoyal app.
You help members navigate the app, understand features, and manage their investments.

CRITICAL RULES:
- Keep responses SHORT (1-3 sentences max) — they will be spoken aloud
- Never fabricate account data. Only reference numbers from MEMBER CONTEXT below.
- Never give specific investment advice (don't recommend specific stocks)
- If the member explicitly asks to navigate ("go to", "open", "take me to"), include:
  [NAV:/route-path]
- ALSO include [NAV:] when your answer would be better shown on a specific page. Examples:
  - "How do I invest?" → answer briefly + [NAV:/points-slider]
  - "What are my pending orders?" → answer + [NAV:/transactions]
  - "Show my portfolio" → answer + [NAV:/portfolio]
  - "How do I set up my profile?" → answer + [NAV:/member-onboard]
  - "Where did my money go?" → answer + [NAV:/funding-history]
  - "Show my trade history" → answer + [NAV:/alpaca-transactions]
  - "How do I buy stocks from my portfolio?" → answer briefly about the Buy button + [NAV:/portfolio]
  - "What's my balance?" → answer with numbers (no nav needed, data already spoken)
  - "What is a sweep?" → answer with explanation (no nav needed, it's informational)
  Use your judgment: navigate when SEEING the page helps, skip nav for pure knowledge questions.
  Valid routes: /stockloyal-landing, /login, /member-onboard, /select-broker, 
  /election, /terms, /wallet, /stock-picker, /fill-basket, /points-slider,
  /portfolio, /transactions, /ledger, /funding-history, /alpaca-transactions,
  /promotions, /social, /about
- If the member asks you to close or says goodbye, respond with [CLOSE]

MEMBER CONTEXT (live data from their account):
${memberContext}

APP KNOWLEDGE BASE:
${sections}${faqBlock}`;
}

// ── Call Claude API via PHP proxy (keeps API key server-side) ────────────────
async function callClaudeAPI(systemPrompt, conversationHistory) {
  try {
    const data = await apiPost("voice-assistant-ai.php", {
      system: systemPrompt,
      messages: conversationHistory.slice(-10),
    });

    if (data?.success && data?.reply) {
      return data.reply;
    }

    console.error("[VoiceAssistant] AI proxy error:", data?.error);
    return null;
  } catch (err) {
    console.error("[VoiceAssistant] AI proxy call failed:", err);
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function VoiceAssistant() {
  const navigate = useNavigate();

  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");

  // Conversation messages
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! I'm your StockLoyal assistant. Tap the mic and ask me anything — check your balance, navigate pages, or walk through setup.",
    },
  ]);

  // Refs
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const messagesEndRef = useRef(null);
  const panelRef = useRef(null);
  const conversationHistoryRef = useRef([]); // Claude API message history
  const [faqKnowledge, setFaqKnowledge] = useState(""); // Live FAQ from database

  // ── Fetch FAQ knowledge from database when panel opens ─────────────────────
  useEffect(() => {
    if (!isOpen || faqKnowledge) return; // Only fetch once per session
    (async () => {
      try {
        const data = await apiPost("get-faq-knowledge.php", {});
        if (data?.success && data?.text_block) {
          setFaqKnowledge(data.text_block);
          console.log(`[VoiceAssistant] Loaded ${data.count} FAQs from database`);
        }
      } catch (err) {
        console.warn("[VoiceAssistant] Could not load FAQs:", err);
      }
    })();
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Speech Recognition setup ───────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      setTranscript(interim || final);
      if (final) {
        handleUserInput(final.trim());
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setTranscript("");
    };

    recognition.onerror = (e) => {
      console.warn("[VoiceAssistant] Speech error:", e.error);
      setIsListening(false);
      setTranscript("");
      if (e.error === "not-allowed") {
        addMessage("assistant", "Microphone access is blocked. Please allow mic permissions in your browser settings, or type your question below.");
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, []);

  // ── Speak helper ───────────────────────────────────────────────────────────
  const speak = useCallback(
    (text) => {
      if (isMuted || !synthRef.current) return;
      synthRef.current.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 1.0;
      // Pick a natural voice if available
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith("en") && (v.name.includes("Samantha") || v.name.includes("Google") || v.name.includes("Natural"))
      );
      if (preferred) utter.voice = preferred;
      synthRef.current.speak(utter);
    },
    [isMuted]
  );

  // ── Add message helper ─────────────────────────────────────────────────────
  const addMessage = useCallback((role, text) => {
    setMessages((prev) => [...prev, { role, text, ts: Date.now() }]);
  }, []);

  // ── Toggle mic ─────────────────────────────────────────────────────────────
  const toggleListening = () => {
    if (!recognitionRef.current) {
      addMessage("assistant", "Sorry, speech recognition isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.warn("[VoiceAssistant] Already started:", e);
      }
    }
  };

  // ── Handle user input (voice or typed) ─────────────────────────────────────
  const handleUserInput = async (text) => {
    if (!text.trim()) return;

    setIsListening(false);
    recognitionRef.current?.stop();

    addMessage("user", text);
    setIsProcessing(true);

    try {
      const intent = matchIntent(text);
      const response = await processIntent(intent, text);
      addMessage("assistant", response);
      speak(response);
    } catch (err) {
      console.error("[VoiceAssistant] Error:", err);
      addMessage("assistant", "Sorry, something went wrong. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Intent processor ───────────────────────────────────────────────────────
  const processIntent = async (intent, rawText) => {
    const memberId = localStorage.getItem("memberId");

    // ── Fast-path: Navigation intents (no API call needed) ──
    if (NAV_MAP[intent]) {
      const { path, label } = NAV_MAP[intent];
      setTimeout(() => navigate(path), 600);
      const reply = `Taking you to ${label} now.`;
      conversationHistoryRef.current.push(
        { role: "user", content: rawText },
        { role: "assistant", content: reply }
      );
      return reply;
    }

    // ── Fast-path: Goodbye ──
    if (intent === "goodbye") {
      setTimeout(() => setIsOpen(false), 1500);
      return "You're welcome! Feel free to tap the mic anytime. Happy investing!";
    }

    // ── Build member context from live data ──
    let memberContext = "Not logged in — no member data available.";
    if (memberId) {
      try {
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (data?.success && data?.wallet) {
          const w = data.wallet;
          const pts = parseInt(w.points || "0", 10);
          const rate = Number(w.conversion_rate || 0.01);
          const effectiveRate = rate >= 1 ? rate / 100 : rate;
          const cashValue = (pts * effectiveRate).toFixed(2);

          // Profile completeness
          const profileFields = [w.first_name, w.last_name, w.member_email,
            w.member_address_line1, w.member_town_city, w.member_state,
            w.member_zip, w.member_country, w.member_timezone];
          const profileComplete = profileFields.every((f) => !!f && String(f).trim());

          memberContext = [
            `Member ID: ${memberId}`,
            `Name: ${w.first_name || ""} ${w.last_name || ""}`.trim() || "Not set",
            `Email: ${w.member_email || "Not set"}`,
            `Merchant: ${localStorage.getItem("merchantName") || "Unknown"}`,
            `Points: ${pts.toLocaleString()}`,
            `Conversion rate: ${effectiveRate} (1 point = $${effectiveRate})`,
            `Cash value: $${cashValue}`,
            `Cash balance: $${Number(w.cash_balance || 0).toFixed(2)}`,
            `Portfolio value: $${Number(w.portfolio_value || 0).toFixed(2)}`,
            `Broker: ${w.broker || localStorage.getItem("broker") || "Not set"}`,
            `Election type: ${w.election_type || "Not set"}`,
            `Sweep percentage: ${w.sweep_percentage || "N/A"}`,
            `Tier: ${w.member_tier || localStorage.getItem("memberTier") || "None"}`,
            `Profile complete: ${profileComplete ? "Yes" : "No — missing fields"}`,
            `Current page: ${window.location.hash || window.location.pathname}`,
          ].join("\n");
        }
      } catch (err) {
        console.warn("[VoiceAssistant] Wallet fetch failed:", err);
        memberContext = `Member ID: ${memberId} (wallet data unavailable — network error)`;
      }
    }

    // ── Send to Claude API ──
    const systemPrompt = buildSystemPrompt(memberContext, faqKnowledge);

    conversationHistoryRef.current.push({ role: "user", content: rawText });

    const aiReply = await callClaudeAPI(systemPrompt, conversationHistoryRef.current);

    if (!aiReply) {
      // Fallback if API fails — use basic intent matching
      conversationHistoryRef.current.pop(); // Remove the user message we just added
      return getFallbackResponse(intent, rawText, memberId);
    }

    // ── Parse navigation commands from Claude's response ──
    let cleanReply = aiReply;
    const navMatch = aiReply.match(/\[NAV:(\/[^\]]+)\]/);
    if (navMatch) {
      cleanReply = aiReply.replace(/\[NAV:\/[^\]]+\]/g, "").trim();
      setTimeout(() => navigate(navMatch[1]), 600);
    }

    // ── Parse close command ──
    if (aiReply.includes("[CLOSE]")) {
      cleanReply = aiReply.replace(/\[CLOSE\]/g, "").trim();
      setTimeout(() => setIsOpen(false), 1500);
    }

    conversationHistoryRef.current.push({ role: "assistant", content: cleanReply });

    return cleanReply;
  };

  // ── Fallback responses when Claude API is unavailable ──────────────────────
  const getFallbackResponse = (intent, rawText, memberId) => {
    return `I'm having trouble connecting to AI right now. You can say "go to wallet," "go to portfolio," or any page name to navigate.`;
  };

  // ── Typed input ────────────────────────────────────────────────────────────
  const [typedInput, setTypedInput] = useState("");
  const handleTypedSubmit = (e) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    handleUserInput(typedInput.trim());
    setTypedInput("");
  };

  // ── Pulse animation for listening state ────────────────────────────────────
  const pulseKeyframes = `
    @keyframes va-pulse {
      0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.5); }
      70% { box-shadow: 0 0 0 14px rgba(59,130,246,0); }
      100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
    }
    @keyframes va-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }
    @keyframes va-fade-in {
      from { opacity: 0; transform: translateY(12px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes va-dots {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    @keyframes va-slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  return (
    <>
      <style>{pulseKeyframes}</style>

      {/* ── Fixed container constrained to app max-width ── */}
      <div
        style={{
          position: "fixed",
          bottom: "112px",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 9900,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "var(--app-max-width, 600px)",
            position: "relative",
            pointerEvents: "none",
          }}
        >
          {/* ── Floating Mic Button ── */}
          {!isOpen && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Open voice assistant"
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
                color: "#fff",
                border: "none",
                boxShadow: "0 4px 20px rgba(37,99,235,0.35), 0 2px 8px rgba(0,0,0,0.12)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
                transition: "transform 0.2s, box-shadow 0.2s",
                animation: "va-float 3s ease-in-out infinite",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.08)";
                e.currentTarget.style.boxShadow = "0 6px 24px rgba(37,99,235,0.45), 0 3px 10px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(37,99,235,0.35), 0 2px 8px rgba(0,0,0,0.12)";
              }}
            >
              <Sparkles size={24} />
            </button>
          )}

          {/* ── Panel ── */}
          {isOpen && (
            <div
              ref={panelRef}
              style={{
                position: "absolute",
                bottom: 8,
                right: 8,
                width: "min(380px, calc(100% - 16px))",
                maxHeight: "min(520px, calc(100% - 60px))",
                background: "#fff",
                borderRadius: 20,
                boxShadow: "0 12px 48px rgba(0,0,0,0.18), 0 2px 12px rgba(0,0,0,0.08)",
                pointerEvents: "auto",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                animation: "va-slide-up 0.3s ease-out",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
          {/* ── Header ── */}
          <div
            style={{
              background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={18} color="#fff" />
              </div>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2 }}>
                  StockLoyal Assistant
                </div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.7rem", lineHeight: 1.2 }}>
                  Voice-powered • Always ready
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? "Unmute" : "Mute"}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  synthRef.current?.cancel();
                  recognitionRef.current?.stop();
                  setIsListening(false);
                }}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "#f8f9fb",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  animation: "va-fade-in 0.25s ease-out",
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: msg.role === "user"
                      ? "linear-gradient(135deg, #2563eb, #4f46e5)"
                      : "#fff",
                    color: msg.role === "user" ? "#fff" : "#1f2937",
                    fontSize: "0.875rem",
                    lineHeight: 1.5,
                    boxShadow: msg.role === "user"
                      ? "none"
                      : "0 1px 4px rgba(0,0,0,0.06)",
                    border: msg.role === "user" ? "none" : "1px solid #e5e7eb",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isProcessing && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    padding: "12px 18px",
                    borderRadius: "16px 16px 16px 4px",
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    gap: 5,
                    alignItems: "center",
                  }}
                >
                  {[0, 1, 2].map((d) => (
                    <div
                      key={d}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#9ca3af",
                        animation: `va-dots 1.4s ${d * 0.16}s infinite ease-in-out both`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Live transcript */}
            {isListening && transcript && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "8px 14px",
                    borderRadius: "16px 16px 4px 16px",
                    background: "rgba(37,99,235,0.08)",
                    color: "#6b7280",
                    fontSize: "0.85rem",
                    fontStyle: "italic",
                    border: "1px dashed #93c5fd",
                  }}
                >
                  {transcript}…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input area ── */}
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #e5e7eb",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {/* Text input */}
            <form
              onSubmit={handleTypedSubmit}
              style={{ flex: 1, display: "flex", gap: 6 }}
            >
              <input
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder={isListening ? "Listening…" : "Type or tap mic…"}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  fontSize: "0.85rem",
                  outline: "none",
                  background: "#f9fafb",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#2563eb")}
                onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
              />
              <button
                type="submit"
                disabled={!typedInput.trim() || isProcessing}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "none",
                  background: typedInput.trim() ? "#2563eb" : "#e5e7eb",
                  color: "#fff",
                  cursor: typedInput.trim() ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background 0.2s",
                }}
              >
                <MessageCircle size={16} />
              </button>
            </form>

            {/* Mic button */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isProcessing}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                background: isListening
                  ? "linear-gradient(135deg, #ef4444, #dc2626)"
                  : "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "#fff",
                cursor: isProcessing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "transform 0.15s",
                animation: isListening ? "va-pulse 1.5s infinite" : "none",
                opacity: isProcessing ? 0.5 : 1,
              }}
              title={isListening ? "Stop listening" : "Start listening"}
            >
              {isProcessing ? (
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              ) : isListening ? (
                <MicOff size={20} />
              ) : (
                <Mic size={20} />
              )}
            </button>
          </div>

          {/* ── Quick actions chips ── */}
          <div
            style={{
              padding: "6px 12px 10px",
              background: "#fff",
              display: "flex",
              gap: 6,
              overflowX: "auto",
              flexShrink: 0,
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {[
              { label: "💰 Balance", action: "check my balance" },
              { label: "📊 Portfolio", action: "check my portfolio" },
              { label: "📋 Status", action: "what's my status" },
              { label: "🛒 Invest", action: "pick stocks" },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleUserInput(chip.action)}
                disabled={isProcessing}
                style={{
                  padding: "5px 10px",
                  borderRadius: 20,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  color: "#374151",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#eff6ff";
                  e.currentTarget.style.borderColor = "#93c5fd";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#f9fafb";
                  e.currentTarget.style.borderColor = "#e5e7eb";
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
        </div>
      </div>
    </>
  );
}

// व्याज हिशोब वही - ४-अंकी अ‍ॅप PIN लॉक मॉड्यूल (js/security.js - V14.6)
(function () {
  const PIN_HASH_KEY = "vyaj_aap_pin_hash_v1";
  const PIN_ENABLED_KEY = "vyaj_aap_pin_enabled_v1";
  let enteredPin = "";

  // PIN सुरक्षित ठेवण्यासाठी SHA-256 हॅश तयार करा (create SHA-256 hash of PIN)
  async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode("vyaj_salt_v14_" + pin);
    if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // बॅकअप पद्धत (fallback if crypto.subtle unavailable)
    return btoa("vyaj_salt_v14_" + pin);
  }

  // PIN चालू आहे का तपासा (check if PIN lock is enabled)
  function isPinEnabled() {
    return (
      localStorage.getItem(PIN_ENABLED_KEY) === "true" &&
      !!localStorage.getItem(PIN_HASH_KEY)
    );
  }

  // लॉक स्क्रीन तयार करा आणि दाखवा (create and show 4-digit PIN lock overlay)
  function showLockScreen() {
    if (!isPinEnabled()) return;
    if (document.getElementById("vyajPinLockOverlay")) return;

    enteredPin = "";

    const overlay = document.createElement("div");
    overlay.id = "vyajPinLockOverlay";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9998",
      "background:radial-gradient(circle at 50% 25%, #131c36 0%, #05070e 80%)",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "padding:20px",
      "color:#f8fafc",
      "font-family:system-ui,-apple-system,sans-serif"
    ].join(";");

    overlay.innerHTML = `
      <div style="text-align:center; max-width:320px; width:100%;">
        <div style="font-size:2.4rem; margin-bottom:6px;">🔐</div>
        <h2 style="margin:0 0 4px; font-size:1.3rem; color:#38bdf8;">व्याज हिशोब वही लॉक</h2>
        <div id="pinLockMsg" style="font-size:0.85rem; color:#94a3b8; margin-bottom:18px;">
          अ‍ॅप उघडण्यासाठी ४-अंकी PIN टाका
        </div>

        <div id="pinDotsRow" style="display:flex; justify-content:center; gap:14px; margin-bottom:24px;">
          <span class="pin-dot" style="width:16px; height:16px; border-radius:50%; border:2px solid #38bdf8; display:inline-block;"></span>
          <span class="pin-dot" style="width:16px; height:16px; border-radius:50%; border:2px solid #38bdf8; display:inline-block;"></span>
          <span class="pin-dot" style="width:16px; height:16px; border-radius:50%; border:2px solid #38bdf8; display:inline-block;"></span>
          <span class="pin-dot" style="width:16px; height:16px; border-radius:50%; border:2px solid #38bdf8; display:inline-block;"></span>
        </div>

        <div id="pinKeypad" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "⌫"]
            .map(
              (key) => `
            <button type="button" data-pinkey="${key}" style="
              height:58px; border-radius:14px; font-size:1.3rem; font-weight:700;
              background:rgba(23,33,56,0.9); color:#f8fafc;
              border:1px solid rgba(56,189,248,0.28); cursor:pointer;
            ">${key}</button>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // कीपॅड बटणांवर क्लिक हाताळा (handle keypad button clicks)
    overlay.querySelectorAll("[data-pinkey]").forEach((btn) => {
      btn.addEventListener("click", async function () {
        const val = this.getAttribute("data-pinkey");
        const msgEl = document.getElementById("pinLockMsg");

        if (val === "C") {
          enteredPin = "";
          updatePinDots();
          return;
        }
        if (val === "⌫") {
          enteredPin = enteredPin.slice(0, -1);
          updatePinDots();
          return;
        }

        if (enteredPin.length < 4) {
          enteredPin += val;
          updatePinDots();
        }

        if (enteredPin.length === 4) {
          const savedHash = localStorage.getItem(PIN_HASH_KEY);
          const inputHash = await hashPin(enteredPin);

          if (inputHash === savedHash) {
            overlay.remove();
          } else {
            msgEl.textContent = "❌ चुकीचा PIN! कृपया पुन्हा प्रयत्न करा.";
            msgEl.style.color = "#f43f5e";
            enteredPin = "";
            setTimeout(() => {
              updatePinDots();
              msgEl.textContent = "अ‍ॅप उघडण्यासाठी ४-अंकी PIN टाका";
              msgEl.style.color = "#94a3b8";
            }, 900);
          }
        }
      });
    });
  }

  // ४ ठिपके अपडेट करा (update 4 PIN indicator dots)
  function updatePinDots() {
    const dots = document.querySelectorAll("#pinDotsRow .pin-dot");
    dots.forEach((dot, idx) => {
      dot.style.background = idx < enteredPin.length ? "#38bdf8" : "transparent";
    });
  }

  // सेटिंग्ज पॉपअपमध्ये PIN सेटअप विभाग जोडा (mount PIN settings inside #settingsModal)
  function mountPinSettings() {
    if (document.getElementById("vyajPinSettingsBox")) return;

    const settingsModal = document.getElementById("settingsModal");
    if (!settingsModal) return;
    const modalCard = settingsModal.querySelector(".modal-card");
    if (!modalCard) return;

    const box = document.createElement("div");
    box.id = "vyajPinSettingsBox";
    box.className = "meta-box";
    box.style.marginTop = "14px";

    box.innerHTML = `
      <div style="font-weight:700; color:var(--accent); margin-bottom:8px;">
        🔐 ४-अंकी अ‍ॅप PIN लॉक (Security Module)
      </div>
      <div id="pinCurrentStatus" class="muted" style="margin-bottom:8px;"></div>
      <div class="row" style="margin-bottom:8px;">
        <input type="password" id="newAppPinInput" maxlength="4" inputmode="numeric" placeholder="नवीन ४-अंकी PIN" style="flex:1; min-width:130px;" />
        <button type="button" id="saveAppPinBtn" class="success sm">✅ PIN सेव्ह करा</button>
      </div>
      <div class="row">
        <button type="button" id="lockNowPinBtn" class="primary sm">🔒 आत्ता लॉक करा</button>
        <button type="button" id="disableAppPinBtn" class="danger sm">🗑️ PIN बंद करा</button>
      </div>
    `;

    modalCard.appendChild(box);

    function refreshStatus() {
      const statusEl = document.getElementById("pinCurrentStatus");
      if (!statusEl) return;
      if (isPinEnabled()) {
        statusEl.textContent = "स्थिती: ✅ PIN लॉक चालू आहे (दरवेळी अ‍ॅप उघडताना PIN मागेल)";
        statusEl.style.color = "var(--accent-2)";
      } else {
        statusEl.textContent = "स्थिती: ⚪ PIN लॉक बंद आहे";
        statusEl.style.color = "var(--muted)";
      }
    }

    refreshStatus();

    // नवीन PIN सेव्ह करा (save new 4-digit PIN)
    document.getElementById("saveAppPinBtn").addEventListener("click", async function () {
      const input = document.getElementById("newAppPinInput");
      const pinVal = (input.value || "").trim();

      if (!/^\d{4}$/.test(pinVal)) {
        alert("कृपया फक्त ४ अंकी (0-9) PIN टाका. उदा. 1234");
        return;
      }

      const hashed = await hashPin(pinVal);
      localStorage.setItem(PIN_HASH_KEY, hashed);
      localStorage.setItem(PIN_ENABLED_KEY, "true");
      input.value = "";
      refreshStatus();
      alert("✅ ४-अंकी अ‍ॅप PIN यशस्वीरीत्या सेट झाला आहे!");
    });

    // तात्काळ लॉक करा (lock app immediately)
    document.getElementById("lockNowPinBtn").addEventListener("click", function () {
      if (!isPinEnabled()) {
        alert("आधी ४-अंकी PIN सेट करा.");
        return;
      }
      settingsModal.classList.add("hidden");
      showLockScreen();
    });

    // PIN बंद करा (disable PIN lock)
    document.getElementById("disableAppPinBtn").addEventListener("click", function () {
      if (!isPinEnabled()) {
        alert("PIN लॉक आधीच बंद आहे.");
        return;
      }
      if (confirm("तुम्हाला ४-अंकी अ‍ॅप PIN लॉक बंद करायचा आहे का?")) {
        localStorage.removeItem(PIN_HASH_KEY);
        localStorage.setItem(PIN_ENABLED_KEY, "false");
        refreshStatus();
        alert("PIN लॉक बंद केला आहे.");
      }
    });
  }

  // ग्लोबल अ‍ॅक्सेससाठी (expose globally)
  window.VyajSecurity = {
    showLockScreen,
    isPinEnabled
  };

  function init() {
    mountPinSettings();
    // अ‍ॅप उघडताच PIN चालू असल्यास लॉक स्क्रीन दाखवा (show lock screen on app open)
    if (isPinEnabled()) {
      showLockScreen();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

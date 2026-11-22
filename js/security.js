// व्याज हिशोब वही - ३ तासांचे Gmail सेशन + ४-अंकी PIN लॉक + Refresh सुरक्षितता (js/security.js - V14.10)
(function () {
  const PIN_HASH_KEY = "vyaj_aap_pin_hash_v1";
  const PIN_ENABLED_KEY = "vyaj_aap_pin_enabled_v1";
  const AUTH_TS_KEY = "vyaj_aap_last_auth_ts_v1";
  const SESSION_UNLOCKED_KEY = "vyaj_aap_pin_unlocked_session";
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000; // ३ तास (3 Hours)

  let enteredPin = "";
  let wasLoggedOut = false;

  // PIN सुरक्षित ठेवण्यासाठी SHA-256 हॅश तयार करा (create SHA-256 hash of PIN)
  async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode("vyaj_salt_v14_" + pin);
    if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return btoa("vyaj_salt_v14_" + pin);
  }

  // PIN चालू आहे का तपासा (check if PIN lock is enabled)
  function isPinEnabled() {
    return (
      localStorage.getItem(PIN_ENABLED_KEY) === "true" &&
      !!localStorage.getItem(PIN_HASH_KEY)
    );
  }

  // या सेशनमध्ये अ‍ॅप आधीच अनलॉक आहे का तपासा (check if unlocked in current session - prevents lock on refresh)
  function isUnlockedInSession() {
    return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "true";
  }

  // लॉक स्क्रीन तयार करा आणि दाखवा (create and show 4-digit PIN lock overlay)
  function showLockScreen() {
    if (!isPinEnabled()) return;
    if (document.getElementById("vyajPinLockOverlay")) return;

    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
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
            // या सेशनसाठी अनलॉक सेव्ह करा म्हणजे Refresh वर पुन्हा PIN मागणार नाही
            sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
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

  // ३ तास पूर्ण झाल्यावर सुरक्षित लॉगआउट करा (force Gmail/Password login after 3 hours)
  async function checkThreeHourSession(user) {
    if (!user) return false;
    const lastAuthTs = Number(localStorage.getItem(AUTH_TS_KEY) || 0);
    const elapsed = Date.now() - lastAuthTs;

    if (!lastAuthTs || elapsed >= THREE_HOURS_MS) {
      localStorage.removeItem(AUTH_TS_KEY);
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
      const existingOverlay = document.getElementById("vyajPinLockOverlay");
      if (existingOverlay) existingOverlay.remove();
      try {
        await firebase.auth().signOut();
      } catch (_) {}
      return true;
    }
    return false;
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
        🔐 ४-अंकी अ‍ॅप PIN लॉक (३ तासांचे Gmail सेशन)
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
        statusEl.textContent = "स्थिती: ✅ PIN लॉक चालू आहे (दर ३ तासांनी Gmail लॉगिन व मधल्या वेळेत ४-अंकी PIN)";
        statusEl.style.color = "var(--accent-2)";
      } else {
        statusEl.textContent = "स्थिती: ⚪ PIN लॉक बंद आहे (दर ३ तासांनी Gmail लॉगिन)";
        statusEl.style.color = "var(--muted)";
      }
    }

    refreshStatus();

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
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
      input.value = "";
      refreshStatus();
      alert("✅ ४-अंकी अ‍ॅप PIN यशस्वीरीत्या सेट झाला आहे!");
    });

    document.getElementById("lockNowPinBtn").addEventListener("click", function () {
      if (!isPinEnabled()) {
        alert("आधी ४-अंकी PIN सेट करा.");
        return;
      }
      settingsModal.classList.add("hidden");
      showLockScreen();
    });

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

  window.VyajSecurity = {
    showLockScreen,
    isPinEnabled
  };

  function init() {
    mountPinSettings();

    if (typeof firebase !== "undefined" && firebase.auth) {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
          wasLoggedOut = true;
          sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
          const existingOverlay = document.getElementById("vyajPinLockOverlay");
          if (existingOverlay) existingOverlay.remove();
          return;
        }

        // जर युजरने आत्ताच Gmail/Password ने ताजे लॉगिन केले असेल (fresh login)
        if (wasLoggedOut) {
          wasLoggedOut = false;
          localStorage.setItem(AUTH_TS_KEY, String(Date.now()));
          sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
          return;
        }

        // ३ तास पूर्ण झाले आहेत का तपासा (check 3-hour expiry)
        const expired = await checkThreeHourSession(user);
        if (expired) return;

        // ३ तासांच्या आत अ‍ॅप नव्याने उघडले असेल (आणि फक्त Refresh नसेल) तरच ४-अंकी PIN दाखवा
        if (isPinEnabled() && !isUnlockedInSession()) {
          showLockScreen();
        }
      });

      // अ‍ॅप चालू असताना दर १ मिनिटाने ३ तासांची वेळ तपासा (check expiry every 1 min)
      setInterval(() => {
        const curUser = firebase.auth().currentUser;
        if (curUser) checkThreeHourSession(curUser);
      }, 60000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

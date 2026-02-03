/**
 * Warning page script
 * Handles blocked site information display and allowlist management
 */

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

async function getBlockedTarget() {
    try {
        const res = await chrome.runtime.sendMessage({ type: "GET_BLOCKED_TARGET" });
        return res?.target || null;
    } catch {
        return null;
    }
}

async function addToAllowlist(url) {
    try {
        const res = await chrome.runtime.sendMessage({ type: "ADD_ALLOW", url });
        return res?.ok || false;
    } catch {
        return false;
    }
}

async function clearBlocked() {
    try {
        await chrome.runtime.sendMessage({ type: "CLEAR_BLOCKED" });
    } catch {
        // Ignore errors
    }
}

function truncateUrl(url, maxLength = 100) {
    if (!url || url.length <= maxLength) return url;
    return url.substring(0, maxLength) + "...";
}

(async () => {
    const target = await getBlockedTarget();
    const domain = target ? getDomain(target) : null;

    const domainEl = document.getElementById("domain");
    const targetEl = document.getElementById("target");
    const addBtn = document.getElementById("add");
    const backBtn = document.getElementById("back");

    // Update UI with blocked site info
    if (domain) {
        domainEl.textContent = domain;
        domainEl.setAttribute("title", domain);
    } else {
        domainEl.textContent = "Unknown domain";
    }

    if (target) {
        targetEl.textContent = truncateUrl(target, 150);
        targetEl.setAttribute("title", target);
    } else {
        targetEl.textContent = "URL not available";
    }

    // Disable add button if no valid target
    if (!target || !domain) {
        addBtn.disabled = true;
        addBtn.setAttribute("aria-disabled", "true");
    }

    // Back button handler
    backBtn.addEventListener("click", async () => {
        await clearBlocked();

        // Try to go back in history, fallback to closing tab
        if (window.history.length > 1) {
            window.history.back();
        } else {
            // If no history, try to close the tab
            try {
                window.close();
            } catch {
                // If we can't close, navigate to new tab page
                window.location.href = "chrome://newtab";
            }
        }
    });

    // Add to allowlist button handler
    addBtn.addEventListener("click", async () => {
        if (!target || addBtn.disabled) return;

        // Show loading state
        const originalText = addBtn.innerHTML;
        addBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"></circle>
      </svg>
      Adding...
    `;
        addBtn.disabled = true;

        // Add spinning animation
        const style = document.createElement("style");
        style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .spin {
        animation: spin 1s linear infinite;
      }
    `;
        document.head.appendChild(style);

        const success = await addToAllowlist(target);

        if (success) {
            // Show success state briefly
            addBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Added!
      `;
            addBtn.style.background = "var(--success)";

            // Navigate to the original URL
            setTimeout(() => {
                window.location.href = target;
            }, 500);
        } else {
            // Show error state
            addBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        Failed
      `;

            // Reset after delay
            setTimeout(() => {
                addBtn.innerHTML = originalText;
                addBtn.disabled = false;
                addBtn.style.background = "";
            }, 2000);
        }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        // Enter to add to allowlist
        if (e.key === "Enter" && !addBtn.disabled) {
            addBtn.click();
        }

        // Escape to go back
        if (e.key === "Escape") {
            backBtn.click();
        }

        // Backspace to go back (when not in input)
        if (e.key === "Backspace" && document.activeElement.tagName !== "INPUT") {
            backBtn.click();
        }
    });

    // Focus the add button for keyboard navigation
    addBtn.focus();

})().catch((err) => {
    console.error("Warning page error:", err);
    // Show error state in UI
    const domainEl = document.getElementById("domain");
    const targetEl = document.getElementById("target");
    if (domainEl) domainEl.textContent = "Error loading";
    if (targetEl) targetEl.textContent = "Unable to retrieve blocked URL";
});

"use strict";

window.XA_EXPORT = (() => {
  function downloadBlob(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportXyz(header, atoms, filename) {
    const text = window.XA_PARSE.buildXyzText(header, atoms);
    const outName = window.XA_PARSE.outFilename(filename);
    downloadBlob(outName, text, "chemical/x-xyz");
    return outName;
  }

  async function copyTextToClipboard(text) {
    // navigator.clipboard needs a secure context (https/localhost) and is
    // usually unavailable when the app is opened via file://, so fall back
    // to the older execCommand approach, which still works there.
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // fall through to legacy fallback
      }
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }

  async function copyXyz(header, atoms) {
    const text = window.XA_PARSE.buildXyzText(header, atoms);
    const ok = await copyTextToClipboard(text);
    return { ok, text };
  }

  return { exportXyz, downloadBlob, copyXyz };
})();

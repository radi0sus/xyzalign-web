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

  return { exportXyz, downloadBlob };
})();

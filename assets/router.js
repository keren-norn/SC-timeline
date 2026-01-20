// assets/router.js
(() => {
  function isEditHash(h){
    h = (h || "#timeline").toLowerCase();
    return (h === "#edit" || h.startsWith("#edit"));
  }

  function applyRoute(){
    if (!location.hash || location.hash === "#") {
      location.hash = "#timeline";
      return; // le hashchange relancera applyRoute
    }
  const isEdit = isEditHash(location.hash);
    

    document.body.dataset.mode = isEdit ? "edit" : "view";

    // Header
    const modePill = document.getElementById("modePill");
    if (modePill) modePill.textContent = "Mode: " + (isEdit ? "édition" : "lecture");

    const navEdit = document.getElementById("navEdit");
    const navView = document.getElementById("navView");
    if (navEdit) navEdit.style.display = isEdit ? "none" : "inline-flex";
    if (navView) navView.style.display = isEdit ? "inline-flex" : "none";

    // Panel édition (colonne de gauche)
    const editPanel = document.getElementById("editPanel");
    if (editPanel) editPanel.style.display = isEdit ? "block" : "none";

    // Prévenir app.js qu'on a changé de mode (si app.js écoute)
    window.dispatchEvent(new CustomEvent("sc:modechange", { detail: { mode: isEdit ? "edit" : "view" }}));
  }

  document.addEventListener("DOMContentLoaded", () => {
   ();
    window.addEventListener("hashchange", applyRoute);
  });
})();

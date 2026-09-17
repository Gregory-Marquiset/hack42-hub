// The Hub opens the board with `?u=<participant name>`. Without it Excalidraw
// picks a random name ("Arctic Dragonfly") and the cursors belong to nobody.
// The name is written before the app loads, in the place it reads at startup.
(function () {
  try {
    var name = new URLSearchParams(window.location.search).get("u");
    if (name) {
      localStorage.setItem(
        "excalidraw-collab",
        JSON.stringify({ username: name.slice(0, 60) }),
      );
    }
  } catch (error) {
    // Storage refused (private window): the random name takes over.
  }
})();

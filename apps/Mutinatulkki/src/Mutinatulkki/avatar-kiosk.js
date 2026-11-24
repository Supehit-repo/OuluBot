const kiosk = document.querySelector("#kiosk");
const closeButton = document.querySelector("#kioskClose");
const stateHero = document.querySelector(".state-hero");
const avatarStage = document.querySelector("#avatarStage");
let hideControlsTimer;

function showControls() {
  kiosk.classList.add("controls-visible");
  window.clearTimeout(hideControlsTimer);
  hideControlsTimer = window.setTimeout(() => kiosk.classList.remove("controls-visible"), 2500);
}

closeButton.addEventListener("click", () => window.close());
window.addEventListener("pointerdown", (event) => {
  if (event.target !== closeButton) showControls();
});
window.addEventListener("keydown", (event) => {
  showControls();
  if (event.key === "Escape") window.close();
});

const stateChannel = new BroadcastChannel("toripolliisi-avatar-state");
const openerState = window.opener?.document?.querySelector(".state-hero")?.dataset.state;
if (typeof openerState === "string") stateHero.dataset.state = openerState;
stateChannel.addEventListener("message", (event) => {
  const state = event.data?.state;
  if (typeof state === "string") stateHero.dataset.state = state;
});

function toggleConversation() {
  stateChannel.postMessage({ action: "toggle-conversation" });
  showControls();
}

avatarStage.addEventListener("click", toggleConversation);
avatarStage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleConversation();
  }
});

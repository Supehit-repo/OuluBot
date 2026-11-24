const form = document.querySelector("#chat-form");
const message = document.querySelector("#message");
const response = document.querySelector("#response");
const stateHero = document.querySelector(".state-hero");
const stateText = document.querySelector("#stateText");
const requestStatus = document.querySelector("#requestStatus");
const submitButton = form.querySelector("button[type=submit]");

const stateLabels = {
  listening: "Valmiina viestiin",
  processing: "Agentti käsittelee pyyntöä",
  answering: "Vastaus valmis",
  error: "Pyyntö epäonnistui",
};

function setState(state) {
  stateHero.dataset.state = state;
  stateText.textContent = stateLabels[state] || stateLabels.listening;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = message.value.trim();
  if (!text) return;

  setState("processing");
  requestStatus.textContent = "Käsitellään";
  response.textContent = "Odotetaan vastausta…";
  submitButton.disabled = true;

  try {
    const result = await fetch("./api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.detail || "Pyyntö epäonnistui.");

    response.textContent = data.reply;
    requestStatus.textContent = "Valmis";
    setState("answering");
  } catch (error) {
    response.textContent = error.message || "Agenttirajapinta ei ole vielä saatavilla tältä sivulta.";
    requestStatus.textContent = "Virhe";
    setState("error");
  } finally {
    submitButton.disabled = false;
  }
});

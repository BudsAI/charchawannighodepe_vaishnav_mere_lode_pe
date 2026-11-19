const forecastGains = [
  ["09:31", 34], ["10:00", 16], ["10:30", 12], ["11:00", 6],
  ["11:30", 11], ["12:00", 9], ["12:30", 11], ["13:00", 2],
  ["13:30", 18], ["14:00", 28], ["14:30", 20], ["15:00", 12],
  ["15:30", 30]
];
const plotMaximum = 35;
const benchmarkGains = { weighted: 19.2, equal: 16.1 };

function initializeResearchExplorer(explorer) {
  const interactive = explorer.querySelector(".research-explorer__interactive");
  const plot = explorer.querySelector(".research-explorer__plot");
  const bars = explorer.querySelector(".research-explorer__bars");
  const time = explorer.querySelector(".research-explorer__time");
  const value = explorer.querySelector(".research-explorer__value");
  const lag = explorer.querySelector(".research-explorer__lag");
  const status = explorer.querySelector("[role='status']");
  const benchmarks = explorer.querySelector(".research-explorer__benchmarks");
  const intervalSelect = explorer.querySelector(".research-explorer__intervals");
  const percent = value.querySelector("span");
  let selected = 0;
  let active = 0;

  const buttons = forecastGains.map(([interval, gain], position) => {
    const button = document.createElement("button");
    const fill = document.createElement("span");
    const tick = document.createElement("span");
    const gainLabel = document.createElement("span");

    button.type = "button";
    button.className = "research-explorer__bar";
    button.dataset.interval = position;
    button.style.setProperty("--gain", `${gain / plotMaximum * 100}%`);
    button.setAttribute("aria-label", `${interval}, ${gain}% reduction in forecast MSE`);
    button.setAttribute("aria-pressed", String(position === selected));
    button.tabIndex = position === selected ? 0 : -1;

    fill.className = "research-explorer__fill";
    fill.setAttribute("aria-hidden", "true");
    tick.className = "research-explorer__tick";
    tick.textContent = interval;
    tick.setAttribute("aria-hidden", "true");
    gainLabel.className = "research-explorer__gain";
    gainLabel.textContent = gain;
    gainLabel.setAttribute("aria-hidden", "true");
    button.append(fill, gainLabel, tick);
    return button;
  });

  buttons[active].classList.add("is-active");
  bars.replaceChildren(...buttons);
  intervalSelect.replaceChildren(...forecastGains.map(([interval, gain], position) => {
    const option = document.createElement("option");
    option.value = position;
    option.textContent = `${interval} · ${gain}%`;
    return option;
  }));

  function showReading(position) {
    if (position === active) return;
    buttons[active].classList.remove("is-active");
    buttons[position].classList.add("is-active");
    active = position;

    const [interval, gain] = forecastGains[position];
    time.textContent = interval;
    time.dateTime = interval;
    value.replaceChildren(String(gain), percent);
    lag.textContent = position === 0
      ? "Uses the pre-open lag."
      : "Uses the preceding intraday interval.";
  }

  function select(position, announce = false) {
    if (position !== selected) {
      buttons[selected].tabIndex = -1;
      buttons[selected].setAttribute("aria-pressed", "false");
      buttons[position].tabIndex = 0;
      buttons[position].setAttribute("aria-pressed", "true");
      selected = position;
      intervalSelect.value = String(position);
    }

    showReading(position);
    if (announce) {
      const [interval, gain] = forecastGains[position];
      status.textContent = `${interval}, ${gain}% reduction in forecast MSE`;
    }
  }

  bars.addEventListener("click", event => {
    const button = event.target.closest(".research-explorer__bar");
    if (button) select(Number(button.dataset.interval), true);
  });

  bars.addEventListener("focusin", event => {
    const button = event.target.closest(".research-explorer__bar");
    if (button) select(Number(button.dataset.interval));
  });

  bars.addEventListener("pointerover", event => {
    const button = event.target.closest(".research-explorer__bar");
    if (event.pointerType === "mouse" && button) showReading(Number(button.dataset.interval));
  });
  bars.addEventListener("pointerleave", () => showReading(selected));

  bars.addEventListener("keydown", event => {
    const button = event.target.closest(".research-explorer__bar");
    if (!button) return;

    const position = Number(button.dataset.interval);
    const last = buttons.length - 1;
    let next;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        next = Math.max(position - 1, 0);
        break;
      case "ArrowRight":
      case "ArrowDown":
        next = Math.min(position + 1, last);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    buttons[next].focus();
  });

  intervalSelect.addEventListener("change", () => select(Number(intervalSelect.value), true));

  for (const [name, gain] of Object.entries(benchmarkGains)) {
    plot.style.setProperty(`--benchmark-${name}`, `${gain / plotMaximum * 100}%`);
  }
  benchmarks.addEventListener("change", event => {
    if (event.target.matches("input[type='radio']")) plot.dataset.benchmark = event.target.value;
  });
  interactive.hidden = false;
}

for (const explorer of document.querySelectorAll(".research-explorer")) {
  initializeResearchExplorer(explorer);
}

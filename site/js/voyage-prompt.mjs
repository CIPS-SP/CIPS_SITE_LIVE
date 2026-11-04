// Copied from monaco/voyage-prompt.mjs on 30 Oct 2026 so the live site stands alone (it shares no files with the Monaco page). This is the "Start your voyage" prompt; from here on it is the live site's own copy and the Monaco page keeps its own.
// Keep the shared route calculation, but make Monaco's instruction a one-shot cue.
export function installVoyagePrompt(stage, {minimumCalculationMs = 2200, readyLabel, dismissOnScroll = true} = {}) {
  // dismissOnScroll: Monaco hides the prompt on the first scroll (a one-shot cue). The home page passes false so the
  // globe's own pulsing prompts (Simon's) stay up until the globe itself retires them.
  if (!stage) return;
  const prompts = new Map();
  const liveReadyText = 'Scroll to continue your journey';   // what live.js writes when the route is ready
  const readyText = readyLabel || liveReadyText;              // what the visitor sees (the home page passes its own wording)
  function start(button) {
    const previous = prompts.get(button);
    if (previous) clearTimeout(previous.timer);
    button.classList.remove('globe-prompt-dismissed');
    const state = {started: performance.now(), scrollY: window.scrollY, ready: false, dismissed: false};
    prompts.set(button, state);
    return state;
  }
  function finish(button, state) {
    if (!button.isConnected || prompts.get(button) !== state) return;
    state.ready = true;
    button.textContent = readyText;
    button.classList.add('pulse');
    button.classList.toggle('globe-prompt-dismissed', dismissOnScroll && state.dismissed);
  }
  function inspect() {
    for (const button of stage.querySelectorAll('.ltake')) {
      const text = button.textContent.trim();
      let state = prompts.get(button);
      if (text.startsWith('Calculating') && !state) state = start(button);
      if (text !== liveReadyText || !state || state.ready || state.timer) continue;
      // live.js has finished typing the route details; also allow the calculation
      // message enough time to be noticed before replacing it with the instruction.
      const remaining = minimumCalculationMs - (performance.now() - state.started);
      if (remaining <= 0) finish(button, state);
      else {
        button.textContent = 'Calculating route…';
        button.classList.remove('pulse');
        state.timer = setTimeout(() => finish(button, state), remaining);
      }
    }
  }
  function onClick(event) {
    const button = event.target.closest('.ltake');
    if (!button || !stage.contains(button)) return;
    const state = prompts.get(button);
    const label = button.textContent.trim();
    if (state && (label === readyText || label === liveReadyText || label.startsWith('Calculating'))) {
      // This is an instruction now, not a second route-planning action.
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function onScroll() {
    if (!dismissOnScroll) return;
    for (const [button, state] of prompts) {
      if (Math.abs(window.scrollY - state.scrollY) < 2) continue;
      state.dismissed = true;
      if (state.ready) button.classList.add('globe-prompt-dismissed');
    }
    // The demo has no live-route calculation, but its instruction also ends on scroll.
    for (const button of stage.querySelectorAll('[data-g="voyageExample"].armed')) {
      button.classList.add('globe-prompt-dismissed');
    }
  }
  function resetDemo(event) {
    if (event.target.closest('[data-live="panelClose"], [data-g="voyageExample"]')) {
      stage.querySelector('[data-g="voyageExample"]')?.classList.remove('globe-prompt-dismissed');
    }
  }
  const observer = new MutationObserver(inspect);
  observer.observe(stage, {subtree:true, childList:true, characterData:true});
  stage.addEventListener('click', onClick, true);
  stage.addEventListener('click', resetDemo);
  window.addEventListener('scroll', onScroll, {passive:true});
  return () => {
    observer.disconnect();
    prompts.forEach(state => clearTimeout(state.timer));
    stage.removeEventListener('click', onClick, true);
    stage.removeEventListener('click', resetDemo);
    window.removeEventListener('scroll', onScroll);
  };
}

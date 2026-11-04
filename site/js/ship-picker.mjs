// Copied from monaco/ship-picker.mjs on 30 Oct 2026 so the live site stands alone (it shares no files with the Monaco page). This is the ship chooser; from here on it is the live site's own copy and the Monaco page keeps its own.
// Monaco presentation only: shared live.js remains the owner of vessel selection.
export function installShipPicker(stage) {
  if (!stage) return;
  const find = selector => stage.querySelector(selector);
  const panel = find('[data-live="panel"]');
  const follow = find('[data-live="follow"]');
  const clear = find('[data-live="clear"]');
  const search = find('[data-live="search"]');
  const actions = find('.lactions');
  if (!panel || !follow || !clear || !search || !actions) return;

  // Move the real controls, preserving their shared click handlers and tab order.
  panel.insertBefore(actions, search);
  follow.textContent = 'Go to Ship →';
  clear.textContent = 'Choose another ship';
  search.setAttribute('aria-label', 'Vessel name or MMSI');
  let selectedResult = null, routeStarted = false;
  stage.tabIndex = -1;
  const simulation = document.createElement('div');
  simulation.id = 'globe-simulation-indicator';
  simulation.textContent = 'Simulation';
  simulation.setAttribute('role', 'status');
  simulation.hidden = true;
  document.body.appendChild(simulation);

  let wasSelected = false;
  function sync() {
    const selected = stage.classList.contains('has-ship');
    const following = selected && stage.classList.contains('following');
    stage.classList.toggle('globe-ship-selected', selected);

    const cardLayout = stage.classList.contains('vcard-panel');   // home page: the panel IS the voyage card while following, so it must stay clickable
    panel.inert = (following && !cardLayout) || stage.classList.contains('globe-intro');
    if (selected && !wasSelected && !following) follow.focus({preventScroll:true});
    wasSelected = selected;
  }
  function stepBack() {
    // home page (finder-card layout, 4 Oct 2026): choosing a ship goes straight to its card, so one step back is simply "Change ship"
    if (stage.classList.contains('vcard-panel') && stage.classList.contains('voyage-mode')) {
      find('[data-g="voyageChange"]')?.click();
      return true;
    }
    if (stage.classList.contains('following')) {
      if (routeStarted && selectedResult) {
        find('[data-g="voyageReopenPanel"]')?.click();
        selectedResult.click();
        routeStarted = false;
      }
      stage.classList.add('globe-picker-reopened');
      stage.classList.remove('following');
      sync();
      follow.focus({preventScroll:true});
    } else if (stage.classList.contains('has-ship')) {
      clear.click();
      sync();
      search.focus({preventScroll:true});
    } else return false;
    return true;
  }
  function onStageClick(event) {
    const result = event.target.closest('[data-live="results"] li[data-mmsi]');
    if (result) selectedResult = result;
    const destination = event.target.closest('.ltake');
    if (destination && destination.textContent.trim() === 'Simulate route to Jersey') {
      routeStarted = true;
      simulation.hidden = false;
    }
    const demo = event.target.closest('[data-g="voyageExample"]');
    if (demo) queueMicrotask(() => { simulation.hidden = !demo.classList.contains('armed'); });
    if (event.target.closest('[data-live="panelClose"], [data-g="voyageMonitor"], [data-g="voyageReopenPanel"]')) simulation.hidden = true;
    const close = event.target.closest('.kin-callout-card:not([data-g]):not(.voyage-route-callout) .kin-callout-close');
    if (close && stage.classList.contains('following')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stepBack();
    }
  }
  stage.addEventListener('click', onStageClick, true);
  function labelDestination() {
    for (const button of stage.querySelectorAll('.ltake')) {
      if (button.querySelector('.ltake-l1')) button.textContent = 'Simulate route to Jersey';
    }
    for (const close of stage.querySelectorAll('.kin-callout-card:not([data-g]):not(.voyage-route-callout) .kin-callout-close')) {
      close.setAttribute('aria-label', 'Back to chosen ship');
    }
  }
  const labels = new MutationObserver(labelDestination);
  labels.observe(stage, {subtree:true, childList:true});
  labelDestination();
  follow.addEventListener('click', () => {
    sync();
    stage.focus({preventScroll:true}); // release focus from the now-hidden chooser
  });
  clear.addEventListener('click', () => {
    simulation.hidden = true;
    routeStarted = false;
    stage.classList.add('globe-picker-reopened');
    sync();
    search.focus({preventScroll:true});
  });
  // Ignore held Escape, hidden sections and modal dialogs: one press = one step.
  function onKey(event) {
    if (event.key !== 'Escape' || event.repeat || event.defaultPrevented ||
        stage.closest('[hidden]') || document.querySelector('dialog[open]')) return;
    if (stepBack()) { event.preventDefault(); event.stopPropagation(); }
  }
  document.addEventListener('keydown', onKey);
  const observer = new MutationObserver(sync);
  observer.observe(stage, {attributes:true, attributeFilter:['class']});
  sync();
  return () => { observer.disconnect(); document.removeEventListener('keydown', onKey); simulation.remove(); labels.disconnect(); stage.removeEventListener('click', onStageClick, true); };
}

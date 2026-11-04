import {BOARDING_SPEED_MIN_KNOTS,BOARDING_SPEED_MAX_KNOTS,BOARDING_HEADING_MIN_DEG,BOARDING_HEADING_MAX_DEG,boardingSpeedSafe,boardingHeadingSafe} from './pilot-boarding.js';
// Representative game thresholds. Never real navigational instructions.
export const ARRIVAL_LIMITS = Object.freeze({
  stationSpeedMinKnots: BOARDING_SPEED_MIN_KNOTS, stationSpeedMaxKnots: BOARDING_SPEED_MAX_KNOTS,
  stationHeadingMinDeg: BOARDING_HEADING_MIN_DEG, stationHeadingMaxDeg: BOARDING_HEADING_MAX_DEG,
  dolphinMinKnots: 4.5, dolphinMaxKnots: 9.6, dolphinMaxTurn: 1.5,
});
export const STORE_ITEMS = Object.freeze({
  bread: 'Bread and pastries', milk: 'Jersey dairy', fruit: 'Fruit and vegetables',
  fish: 'Fish and shellfish', wine: 'Wines', ice: 'Ice', papers: 'Papers and flowers',
});
export const HAMPERS = Object.freeze({produce:'Jersey produce',dairy:'Jersey dairy',sea:'From the sea',cellar:'The cellar',surprise:"Simon's surprise"});
export const callMade = value => value === true || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
export const suppliesComplete = calls => Array.isArray(calls.stores) && calls.stores.length > 0 && callMade(calls.fuel);
export function validateOrder(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.stores) || typeof input.fuel !== 'boolean') throw new Error('Choose provisions and/or bunkers');
  const stores = [...new Set(input.stores)];
  if (stores.some(k => typeof k !== 'string' || !Object.hasOwn(STORE_ITEMS,k))) throw new Error('Unknown provision');
  if (!stores.length && !input.fuel) throw new Error('Select at least one provision or bunkers');
  if (input.hamper != null && !Object.hasOwn(HAMPERS,input.hamper)) throw new Error('Unknown hamper choice');
  return {stores, fuel:input.fuel, hamper:input.hamper || null};
}
export function orderAcknowledgement(calls) {
  const stores = Array.isArray(calls.stores) && calls.stores.length > 0, fuel = callMade(calls.fuel);
  if (stores && fuel) return 'Provisions and bunkers arranged, Captain.';
  if (stores) return 'Provisions arranged, Captain. Bunkers not ordered.';
  if (fuel) return 'Bunkers arranged, Captain. Provisions not ordered.';
  return 'Tap to arrange provisions and bunkers.';
}
export function arrivalChecklist(S,calls,cfg) {
  const dolphinTime = cfg.dolphins.triggerSeconds + cfg.dolphins.bowSeconds + cfg.dolphins.wakeSeconds;
  return [
    // 26 Sep 2026, Simon: reintroduced as something the player actually does (was automatic on start) — the
    // VHF 82 button on the VTS/Pilots card. If the port ends up logging it for you (S.noticeAuto, too slow off
    // the mark), it still ticks — Simon: "should still show a tick... autocompleted greyed out" — the `auto`
    // flag is what arrival-ui.js reads to grey it rather than the usual green/gold; the celebratory star toast
    // (game.js's star()) is never called on that path regardless, so no fanfare either way.
    {id:'notice',label:"1 hr's notice sent",criterion:'Call VHF 82 early in the passage',done:callMade(calls.coastguard),auto:!!S.noticeAuto},
    {id:'stores',label:'Provisions and bunkers',criterion:'Arrange both with Simon',done:suppliesComplete(calls),auto:false},
    // 28 Sep 2026, Simon: "include those requirements on the arrival notes" \u2014 spells out all three the launch
    // actually gates on (game/pilot-boarding.js's `safe`), not just speed and a vague "course held".
    {id:'onStation',label:'On station for the pilot',criterion:`In the pilot boarding area, heading ${String(BOARDING_HEADING_MIN_DEG).padStart(3,'0')}\u2013${String(BOARDING_HEADING_MAX_DEG).padStart(3,'0')}\u00b0, ${BOARDING_SPEED_MIN_KNOTS}\u2013${BOARDING_SPEED_MAX_KNOTS} kts`,done:!!S.onStation,auto:false},
    {id:'dolphins',label:'Dolphins joined us',criterion:`speed 4.5–9.6 kts; steady for ${dolphinTime} s`,done:!!S.wakeDolphins,auto:false},
    // 26 Sep 2026, Simon: last on the list \u2014 it's the last thing you actually do before the passage ends
    {id:'pilot',label:'Pilot aboard',criterion:'Board the pilot safely',done:!!S.pilotBoarded,auto:false},
  ];
}
export function currentVtsMessage({S,calls,cfg,pilot,lastMessage},format) {
  if (S.safetyError) return {text:'Passage paused for safety. Please restart.',urgent:true};
  if ((lastMessage?.priority >= 4 || lastMessage?.group === 'safety') && S.t < lastMessage.until && (!lastMessage.valid || lastMessage.valid())) return {text:lastMessage.text,urgent:true};
  // 28 Sep 2026, Simon: "the '1' is on the top line on its own, looks a bit disconnected" — the VTS card is
  // narrow enough that "1 hr's" was breaking between the two, leaving a lone "1" dangling at the line's end. A
  // non-breaking space between them (here and everywhere else "1 hr's" appears below) keeps the two together,
  // wrapping onto the next line as a pair instead of splitting.
  if (!S.playing && !S.done) return {text:"Give 1 hr's notice on VHF 82 once under way."};
  if (S.done) return {text:'Welcome to Jersey, Captain.'};
  // 26 Sep 2026, Simon: "soon after the start the pilot dialogue box can say don't forget... and flash" — urgent
  // here also flashes the card (arrival-ui.js toggles .urgent from it, arrival.css does the actual flashing).
  // Clears itself the moment the notice goes out, by whichever path (the button, or the t>16 auto-chase).
  if (!callMade(calls.coastguard) && S.t >= 6) return {text:"Don't forget — give 1 hr's notice on VHF 82.",urgent:true};
  if (!callMade(calls.coastguard)) return {text:"Ready when you are — 1 hr's notice on VHF 82."};
  if (S.t - (S.noticeAt ?? -Infinity) < 4 && !S.noticeAuto) return {text: S.noticeAuto ? "Coastguard logged your notice for you — a little slow off the mark, Captain." : "1 hr's notice sent."};
  if (pilot?.phase === 'boarding') return {text:format('pilot.boarding'),active:true};
  if (!S.pilotBoarded && S.pilotAdvised) {
    if (lastMessage?.id === 'pilot.station' && S.t < lastMessage.until && (!lastMessage.valid || lastMessage.valid())) return {text:lastMessage.text};
    if (lastMessage?.id === 'pilot.clearance' && S.t < lastMessage.until && (!lastMessage.valid || lastMessage.valid())) return {text:lastMessage.text};
    return {text: format(boardingSpeedSafe(S.speed) && boardingHeadingSafe(S.hdg) ? 'pilot.ready' : 'pilot.hold'),active:true};
  }
  if (S.pilotBoarded && S.t - (S.boardedAt ?? -Infinity) < 5) return {text:format('pilot.aboard'),active:true};
  if (lastMessage && S.t < lastMessage.until && lastMessage.group === 'navigation') return {text:lastMessage.text};
  if (S.pilotBoarded) return {text:'Pilot aboard. Bringing the ship in to St Helier.'};
  if (callMade(calls.vts)) return {text:'VTS: arrival noted. Pilots standing by.'};
  return {text:S.pilotBoarded ? 'Pilot aboard. Bringing the ship in to St Helier.' : 'Enjoy the approach.'};
}

// Compact sender repetition only; the complete validated instruction stays in the detail dialog.
export function compactInstruction(text) {
 return String(text).replace(/^([^,.]+),\s*(?:Pilots?|VTS)\.\s*/i,'$1: ').replace(/Please reduce speed to/i,'Reduce to').replace(/\bknots\b/gi,'kts');
}

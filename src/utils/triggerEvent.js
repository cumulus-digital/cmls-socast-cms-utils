/**
 * Cross-browser event triggering
 * @param {Object} el Element to trigger event on
 * @param {string} name Name of the event
 * @param {*} data Data to send with the event
 */
export default function triggerEvent(el, name, data) {
	let ev;
	if (window.document.createEvent) {
		ev = window.document.createEvent('CustomEvent');
		ev.initCustomEvent(name, true, true, data);
	} else {
		ev = new CustomEvent(name, { detail: data });
	}
	el.dispatchEvent(ev);
}

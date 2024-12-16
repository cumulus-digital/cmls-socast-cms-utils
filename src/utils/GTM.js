/**
 * Holder for our multiple dataLayers
 */
export const dataLayerNames = [
	'dataLayer',
	'sharedContainerDataLayer',
	'corpDataLayer',
];

/**
 * Push a command to all datalayers at once
 * @param {object} ev Variables to push to all data layers
 */
export const push = (ev) => {
	dataLayerNames.forEach((dl) => {
		window.self[dl] = window.self[dl] || [];
		window.self[dl].push(ev);
	});
};

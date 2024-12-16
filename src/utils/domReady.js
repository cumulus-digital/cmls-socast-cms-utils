/**
 * Fire cb when dom is ready, or fire immediately if dom is already ready
 */
const domReady = (cb) => {
	if (window.self.document.readyState !== 'loading') {
		cb();
	} else {
		window.self.document.addEventListener('DOMContentLoaded', cb);
	}
};
export default domReady;

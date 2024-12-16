/**
 * Fire cb when readyState is "interactive" or better
 */
const isInteractive = (cb) => {
	let cbFired = false;
	if (!cbFired && window.self.document.readyState !== 'loading') {
		cb();
	} else {
		const doCb = (e) => {
			if (!cbFired && window.self.document.readyState !== 'loading') {
				cb();
				cbFired = true;
				window.self.document.removeEventListener(
					'readystatechange',
					doCb
				);
			}
		};
		window.self.document.addEventListener('readystatechange', doCb);
	}
};
export default isInteractive;

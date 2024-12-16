/**
 * Returns a promise to wait for a check condition to return true.
 *
 * @param {function} check
 * @param {integer} timeout
 * @param {integer} interval
 */
export default function waitFor(
	check = (r) => typeof r !== 'undefined',
	timeout = 10000,
	interval = 20
) {
	const start = Date.now();

	function waiting(resolve, reject) {
		const checked = check();
		if (checked) {
			resolve(checked);
		} else if (Date.now() - start >= timeout) {
			console.trace('waitFor timeout', { check, timeout, interval });
			reject(new Error('Timed out waiting for ref'));
		} else {
			setTimeout(waiting.bind(this, resolve, reject), interval);
		}
	}
	return new Promise(waiting);
}

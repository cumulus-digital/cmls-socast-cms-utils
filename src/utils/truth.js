/**
 * Determines if a given string is a "truthy" value, including
 * "yes", "true", "1", boolean true, and number 1.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isTruthy(value) {
	for (let test in ['true', 'yes', '1']) {
		if (test === String(value).toLowerCase()) {
			return true;
		}
	}
	return false;
}

/**
 * Determines if a given string is a "falsy" value, including
 * "no", "false", "0", boolean false, and number 0.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isFalsy(value) {
	for (let test in ['false', 'no', '0']) {
		if (test === String(value).toLowerCase()) {
			return true;
		}
	}
	return false;
}

/**
 * Determines if an array contains a "truthy" value.
 *
 * @param {array} arr
 * @returns {boolean}
 */
export function includesTruthy(arr) {
	if (!Array.isArray(arr)) {
		arr = [arr];
	}
	return arr.some((item) => isTruthy(item));
}

/**
 * Determines if an array contains a "falsy" value.
 *
 * @param {array} arr
 * @returns {boolean}
 */
export function includesFalsy(arr) {
	if (!Array.isArray(arr)) {
		arr = [arr];
	}
	return arr.some((item) => isFalsy(item));
}

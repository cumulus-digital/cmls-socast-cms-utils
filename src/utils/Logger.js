/**
 * Cache for namespace colors
 */
const namesToColors = {};

/**
 * Whether debug was forced on, via cookie, session storage or the query
 * string. All three can be changed at runtime - by hand from the console, or
 * by `history.replaceState` - so this cannot be resolved once and kept.
 *
 * It also cannot run on every log call: it reads `document.cookie` and runs
 * two regexes, and a single page load makes well over a hundred log calls.
 *
 * Memoized for FORCE_DEBUG_TTL instead, so a burst of logging pays for one
 * check while a change made from the console still takes effect a moment
 * later.
 */
const FORCE_DEBUG_TTL = 1000;
let forceDebugCache = false;
let forceDebugCheckedAt = 0;
const isDebugForced = () => {
	const now = Date.now();
	if (forceDebugCheckedAt && now - forceDebugCheckedAt < FORCE_DEBUG_TTL) {
		return forceDebugCache;
	}
	forceDebugCheckedAt = now;
	forceDebugCache = false;
	try {
		if (
			/(1|true|yes)/i.test(window.sessionStorage.getItem('cmlsDebug')) ||
			/cmlsDebug/i.test(window.document.cookie) ||
			window.location.search.indexOf('cmlsDebug') >= 0
		) {
			forceDebugCache = true;
		}
	} catch (e) {}
	return forceDebugCache;
};

/**
 * Generate a random color that's not red.
 * @returns string
 */
export const generateColor = () => {
	const randomHex = (max = 256) => Math.floor(Math.random() * max);
	const hexPad = (i) => i.toString(16).padStart(2, '0');

	let red, green, blue, distanceFromRed;
	do {
		red = randomHex();
		green = randomHex();
		blue = randomHex();

		distanceFromRed = Math.sqrt(
			(255 - red) ** 2 + (0 - green) ** 2 + (0 - blue) ** 2
		);
	} while (distanceFromRed < 100);

	return `${hexPad(red)}${hexPad(green)}${hexPad(blue)}`;
};

/**
 * Return black or white hex color value depending on brightness
 * of a given color.
 * @param {string} color Input color value
 * @returns string
 */
export const generateForeground = (color) => {
	const rgb = parseInt(color, 16);
	const r = ((rgb >> 16) & 0xff) / 255,
		g = ((rgb >> 8) & 0xff) / 255,
		b = ((rgb >> 0) & 0xff) / 255;

	const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return luma > 0.6 ? '000000' : 'FFFFFF';
};

export default class Logger {
	background = null;
	foreground = null;

	#header = null;

	constructor(defaultHeader) {
		if (namesToColors[defaultHeader]) {
			//[this.background, this.foreground] = namesToColors[defaultHeader];
			this.background = namesToColors[defaultHeader]?.background;
			this.foreground = namesToColors[defaultHeader]?.foreground;
		} else {
			this.background = generateColor();
			this.foreground = generateForeground(this.background);
			namesToColors[defaultHeader] = {
				background: this.background,
				foreground: this.foreground,
			};
		}

		this.header = [
			`CL %c ${defaultHeader} %c`,
			`background: #${this.background}; color: #${this.foreground}`,
		];
	}

	timestamp() {
		return new Date()?.toISOString() || new Date().toUTCString();
	}

	/**
	 * Resolves the arguments a log method was called with.
	 *
	 * A single function argument is treated as a thunk and invoked here, so
	 * call sites can defer building an expensive message until we know it will
	 * actually be displayed:
	 *
	 *   log.debug(() => ['Slot rendered', slotData.summary]);
	 */
	resolveMessage(request) {
		if (request.length === 1 && typeof request[0] === 'function') {
			request = [].concat(request[0]());
		}
		let message = request;
		let headerLength = 160;
		if (
			Array.isArray(request) &&
			request.length > 0 &&
			request[0]?.message &&
			request[0]?.headerLength
		) {
			message = request[0].message;
			headerLength = request[0].headerLength;
		}
		return { message, headerLength };
	}

	smallString(str, length = 160) {
		return !str
			? str
			: (str instanceof Element
					? str.innerHTML
					: str.toString()
				).substring(0, length);
	}

	displayHeader(type, message, headerLength = 160) {
		// Add icon to message type
		const icons = {
			debug: '🐞',
			info: 'ℹ️',
			warn: '🚸',
			error: '🚨',
		};

		// Add colors to message type
		const colors = {
			debug: '#777777',
			info: 'inherit',
			warn: 'darkgoldenrod',
			error: 'darkred',
		};

		//let header = [...this.header, '', icons?.[type]];
		let msg = [icons?.[type]];

		if (message) {
			if (Array.isArray(message)) {
				msg.push(
					this.smallString(
						message
							.map((i) => {
								if (typeof i !== 'string') {
									//return JSON.stringify(i);
									const seen = new WeakSet();
									return JSON.stringify(i, (key, value) => {
										if (
											typeof value === 'object' &&
											value !== null
										) {
											if (seen.has(value)) {
												// Prevent circular reference
												return undefined;
											}
											seen.add(value);
										}
										return value;
									});
								}
								return i;
							})
							.join(' || '),
						headerLength
					)
				);
			} else {
				msg.push(this.smallString(message, headerLength));
			}
		}

		if (this.header.length > 1) {
			window.top.console.groupCollapsed.apply(window.top.console, [
				`${this.header[0]} %c${msg.join(' ')}`,
				this.header[1],
				'',
				`color: ${colors?.[type]}`,
				'',
			]);
		} else {
			window.top.console.groupCollapsed.apply(window.top.console, [
				...this.header,
				...msg,
			]);
		}
	}

	displayFooter() {
		window.top.console.debug('TIMESTAMP:', this.timestamp());
		// console.trace() captures a stack every time it is called, which is
		// far too expensive for the info/warn/error lines that run on every
		// page load. Only trace when someone is actually debugging.
		if (this.debugMessagesEnabled()) {
			window.top.console.trace();
		}
		window.top.console.groupEnd();
	}

	/**
	 * `window._CMLS.debug` is read on every call; the cookie/storage/query
	 * string checks behind `isDebugForced` are briefly memoized. Both can be
	 * changed at runtime, so neither is resolved permanently.
	 *
	 * @returns {boolean}
	 */
	debugMessagesEnabled() {
		return !!(window?._CMLS?.debug || isDebugForced());
	}

	/**
	 * Guard for call sites that would otherwise build an expensive argument
	 * only to have it discarded:
	 *
	 *   if (log.isDebug) log.debug('Slot rendered', slotData.summary);
	 *
	 * @returns {boolean}
	 */
	get isDebug() {
		return this.debugMessagesEnabled();
	}

	logMessage(type, message, headerLength = 160) {
		if (!(typeof console === 'object' && console.groupCollapsed)) {
			return false;
		}

		// Only display non-debug messages if debug flag is set
		if (type !== 'debug' || this.debugMessagesEnabled()) {
			this.displayHeader(type, message, headerLength);
			//if (headerLength !== Infinity) {
			window.top.console.debug(message);
			//}
			this.displayFooter();
		}
	}

	time(identifier) {
		if (this.debugMessagesEnabled())
			window.top.console.time(
				`${this.header[0].replace(/%c\s*/g, '')} / ${identifier}`
			);
	}

	timeEnd(identifier) {
		if (this.debugMessagesEnabled()) {
			window.top.console.group(
				`${this.header[0]} ⏲️ ${identifier}`,
				this.header[1],
				''
			);
			window.top.console.timeEnd(
				`${this.header[0].replace(/%c\s*/g, '')} / ${identifier}`
			);
			window.top.console.groupEnd();
		}
	}

	info(...request) {
		let { message, headerLength } = this.resolveMessage(request);
		this.logMessage('info', message, headerLength);
	}

	debug(...request) {
		// Bail before resolveMessage so a disabled debug call costs one boolean
		// read rather than a message walk and a JSON.stringify.
		if (!this.debugMessagesEnabled()) {
			return;
		}
		let { message, headerLength } = this.resolveMessage(request);
		this.logMessage('debug', message, headerLength);
	}

	warn(...request) {
		let { message, headerLength } = this.resolveMessage(request);
		this.logMessage('warn', message, headerLength);
	}

	error(...request) {
		let { message, headerLength } = this.resolveMessage(request);
		this.logMessage('error', message, headerLength);
	}
}

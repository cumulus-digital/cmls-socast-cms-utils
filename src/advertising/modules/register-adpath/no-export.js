import config from './config.json';

((window) => {
	const { Logger, triggerEvent } = window.__CMLSINTERNAL.libs;
	const { scriptName, version, networkId } = config;
	const log = new Logger(`${scriptName} ${version}`);

	function registerAdPath() {
		function registerPath(path) {
			const parts = path.match(/^(\/[0-9]+\/[^\/]+).*/);
			if (parts?.length > 1) {
				path = parts[1];
			}
			window._CMLS = window._CMLS || {};
			window._CMLS.adPath = path;
			window.__CMLSINTERNAL.adPath = path;
			log.info('Ad path discovered', window.__CMLSINTERNAL.adPath);
			triggerEvent(
				window,
				'cmls-adpath-discovered',
				window.__CMLSINTERNAL.adPath
			);
			return true;
		}

		if (window.GPT_SITE_ID) {
			log.info('Using GPT_SITE_ID', window.GPT_SITE_ID);
			return registerPath(window.GPT_SITE_ID);
		}
		const adTag = window.__CMLSINTERNAL.adTag;

		log.debug('Checking for ad path');
		const slots = adTag.getSlots();

		log.debug(`Testing ${slots.length} slots`);
		if (slots.length) {
			slots.some((slot) => {
				const p = slot?.getAdUnitPath();
				if (p && p.indexOf(`/${networkId}/`) > -1) {
					log.debug(
						'Found in-network slot',
						slot.getSlotElementId(),
						p
					);
					return registerPath(p);
				}
			});
		} else {
			log.warn('Found no slots!');
		}
	}

	if (window?.__CMLSINTERNAL?.adTag?.isReady()) {
		registerAdPath();
	} else {
		window.addEventListener('cmls-adtag-loaded', () => registerAdPath());
	}
})(window.self);

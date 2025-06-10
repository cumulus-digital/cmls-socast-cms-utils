import config from './config.json';

const scriptName = 'SIDEWALL ADS IMPORTER';
const nameSpace = 'sidewallAdsImporter';
const version = '2.1';

const log = new window.__CMLSINTERNAL.Logger(`${scriptName} ${version}`);
const w = window.self;

export function areSidewallsAllowed() {
	if (w.NO_SIDEWALLS || w.NO_SIDE_WALLS) {
		log.info('window.NO_SIDEWALLS is set. Sidewalls will not be created.');
		return false;
	}

	if (w._CMLS?.disabled?.sideWalls) {
		log.info(
			'_CMLS.disabled.sideWalls is set. Sidewalls will not be created.'
		);
		return false;
	}

	if (w.document.querySelector(config.legacySelector)) {
		log.info('Legacy skyscrapers exist. Sidewalls will not be created.');
		return false;
	}

	if (
		window.matchMedia(`(max-width: ${config.contentWidth + 320}px)`).matches
	) {
		log.info('Device width is too narrow. Sidewalls will not be created.');
		return false;
	}

	return true;
}

export default () => {
	const waiting = (resolve, reject) => {
		setTimeout(() => {
			if (!areSidewallsAllowed()) {
				resolve(false);
				return;
			}

			resolve(() => {
				import(
					/* webpackChunkName: "advertising/sidewalls" */
					'./generate-sidewalls.js'
				);
			});
		}, config.timeToWait);
	};
	return new Promise(waiting);
};

import config from './config.json';

const scriptName = `${config.scriptName} IMPORTER`;
const nameSpace = `${config.nameSpace}Importer`;
const version = '1.0';

const log = new window.__CMLSINTERNAL.Logger(`${scriptName} ${version}`);
const w = window.self;

export default () => {
	const waiting = (resolve, reject) => {
		// Do not operate on mobile.
		if (!window.matchMedia(config.matchMedia).matches) {
			log.info('Device does not match restrictions, will not inject.');
			resolve(false);
			return;
		}

		const injectSlot = () => {
			const adTag = window.__CMLSINTERNAL.adTag;
			let hasWallpaper = adTag
				.getSlots()
				.some((slot) => slot.getTargeting('pos').includes(config.pos));
			if (hasWallpaper) {
				log.warn(
					'In-page wallpaper slot already exists, will not inject.'
				);
				resolve(false);
				return false;
			}
			log.debug('No in-page wallpaper slot detected, will inject.');
			resolve(() => {
				import(
					/* webpackChunkName: "advertising/wallpaper/oop" */
					'./inject.js'
				);
			});
		};

		if (window.__CMLSINTERNAL.adTag) {
			injectSlot();
		} else {
			window.addEventListener(
				'cmls-adtag-loaded',
				() => {
					injectSlot();
				},
				{ once: true }
			);
		}
	};
	return new Promise(waiting);
};

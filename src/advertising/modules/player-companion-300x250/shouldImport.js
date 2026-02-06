import config from './config.json';

const scriptName = `${config.scriptName} IMPORTER`;
const nameSpace = `${config.nameSpace}Importer`;
const version = '1.0';

const log = new window.__CMLSINTERNAL.Logger(`${scriptName} ${version}`);
const w = window.self;

export default () => {
	const waiting = (resolve, reject) => {
		if (w.document.querySelector(`#${config.companionTagId}`)) {
			log.warn('300x250 companion already exists, will not inject.');
			resolve(false);
			return false;
		}

		if (w.document.querySelector('body#playerBody')) {
			resolve(() => {
				const { h, Fragment } = window.__CMLSINTERNAL.libs;
				let div = (
					<div class="injected_companion_300x250">
						<div
							id="companion-ad300x250"
							class="sc-ad-block slot-player_companion_ad300x250"
						></div>
						<div
							id={`${config.companionTagId}`}
							class="td_companion_slot td_companion_container"
						></div>
					</div>
				);
				w.document.body.append(div);
				const style = import(
					/* webpackChunkName: "advertising/companion-300x250/tag" */
					'./style.scss'
				).then((style) => {
					if (style?.default?.use) {
						style.default.use({
							target: w.document.body,
						});
					}
				});
				log.info('Injected 300x250 companion');
			});
		}

		log.debug('Not the player!');
		resolve(false);
		return false;
	};
	return new Promise(waiting);
};

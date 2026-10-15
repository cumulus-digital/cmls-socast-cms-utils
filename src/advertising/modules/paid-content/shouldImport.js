import config from './config.json';

const scriptName = config.scriptName + ' / IMPORTER';

const { Logger } = window.__CMLSINTERNAL.libs;
const log = new Logger(`${scriptName} ${config.version}`);

export default () => {
	const waiting = (resolve) => {
		if (window.self.NO_PAIDCONTENT || window.self.NO_PAID_CONTENT) {
			log.info('NO_PAIDCONTENT flag found, exiting.');
			resolve(false);
		}
		resolve(() => {
			log.info('Loading paid content injector.');
			import(
				/* webpackChunkName: "advertising/paid-content" */
				'./injector.js'
			);
		});
	};
	return new Promise(waiting);
};

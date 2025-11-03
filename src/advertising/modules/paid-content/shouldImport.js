const scriptName = 'PAID CONTENT IMPORTER';
const nameSpace = 'paidContentImporter';
const version = '0.1';

const { Logger } = window.__CMLSINTERNAL.libs;
const log = new Logger(`${scriptName} ${version}`);

export default () => {
	const waiting = (resolve) => {
		const { getBasicPost } = window.__CMLSINTERNAL.libs;
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

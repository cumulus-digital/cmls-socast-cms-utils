import waitFor from 'Utils/waitFor';
import config from './config.json';

const { scriptName, nameSpace, version } = config;

export default () => {
	const log = new window.__CMLSINTERNAL.Logger(
		`${scriptName} Loader ${version}`
	);
	log.info('Checking for CMP');
	const waiting = async (resolve, reject) => {
		try {
			await waitFor(
				() =>
					window?.OneTrustStub || window?.OneTrust || window?.truste,
				99999,
				10
			);
			resolve(() => {
				if (window.OneTrustStub || window?.OneTrust) {
					log.info('OneTrust CMP detected');
					require(
						/* webpackPreload: true, webpackChunkName: "functionality/cmp/onetrust" */
						'./onetrust/index.js'
					);
				}
				if (window.truste) {
					log.info('TrustArc CMP detected');
					require(
						/* webpackPreload: true, webpackChunkName: "functionality/cmp/trustarc" */
						'./trustarc/index.js'
					);
				}
			});
		} catch (e) {
			log.info('CMP not detected');
			resolve(false);
		}
	};
	return new Promise(waiting);
};

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
			await waitFor(() => window?.OneTrustStub || window?.OneTrust);
			log.info('CMP detected');
			resolve(() => {
				import(
					/* webpackChunkName: "functionality/cmp/onetrust" */
					'./onetrust/index.js'
				);
			});
		} catch (e) {
			log.info('CMP not detected');
			resolve(false);
		}
	};
	return new Promise(waiting);
};

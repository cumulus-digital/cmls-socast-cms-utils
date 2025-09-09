import waitFor from 'Utils/waitFor';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('functionality') > -1
) {
	throw new Error('Functionality library already loaded!');
}

if (window._CMLS.libsLoaded.includes('main')) {
	require('./functionality/index');
} else {
	waitFor(() => window._CMLS.libsLoaded.indexOf('main') > -1).then(
		() => {
			require('./functionality/index');
		},
		() => {
			console.warn(
				'CMLS Functionality Support: Timed out waiting for main library!'
			);
		}
	);
}

import waitFor from 'Utils/waitFor';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('functionality') > -1
) {
	throw new Error('Functionality library already loaded!');
}

waitFor(() => window._CMLS.libsLoaded.indexOf('main') > -1).then(
	() => {
		require('./functionality/index');

		// Log that functionality has been loaded
		window._CMLS.libsLoaded.push('functionality');
	},
	() => {
		console.warn(
			'CMLS Functionality Support: Timed out waiting for main library!'
		);
	}
);

import shouldImportCMPTools from './cmp/shouldImport';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];

if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('functionality') > -1
) {
	throw new Error('Functionality library already loaded!');
}

// Log that lib has been loaded
window._CMLS.libsLoaded.push('functionality');

const imports = [
	{
		name: 'functionality/cmp',
		check: shouldImportCMPTools,
		loadImmediately: true,
		loaderOptions: { async: false, defer: false },
	},
];
window.__CMLSINTERNAL.libs.doDynamicImports(imports);

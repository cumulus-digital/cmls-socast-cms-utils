import config from '../config.json';

export default (injectPoint) => {
	const { h, Fragment, Logger } = window.__CMLSINTERNAL.libs;
	const scriptName = `${config.scriptName} / REVCONTENT`;
	const version = '0.1';
	const log = new Logger(`${scriptName} ${version}`);

	let pubId = '144840',
		widgetId = '';

	if (!injectPoint) {
		log.warn('No inject point given!');
		return;
	}

	function isMobile() {
		return window.matchMedia('only screen and (max-width: 760px)').matches;
	}

	if (document.body.classList.contains('home')) {
		widgetId = isMobile() ? '286638' : '286768';
	} else if (
		document.body.classList.contains('single-post') ||
		document.body.id === 'playerBody'
	) {
		widgetId = isMobile() ? '286636' : '286635';
	}

	if (widgetId) {
		const alreadyExists = document.querySelector(
			'[data-widget-host="revcontent"]'
		);
		if (alreadyExists) {
			log.info('Already exists');
			return;
		}

		const style = <style></style>;
		style.innerHTML =
			':root .sbn-item-anchor { color: inherit !important; }';

		injectPoint.append(
			<div style="margin-top: 1em;">
				{style}
				<div
					data-widget-host="revcontent"
					data-pub-id={pubId}
					data-widget-id={widgetId}
				></div>
				<script
					src={`https://delivery.revcontent.com/${pubId}/${widgetId}/widget.js`}
					async
				></script>
			</div>
		);
		log.info('Injected');
	}
};

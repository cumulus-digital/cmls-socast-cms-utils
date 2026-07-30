export default () => {
	const { h, Fragment, Logger } = window.__CMLSINTERNAL.libs;
	const scriptName = 'PAID CONTENT / REVCONTENT';
	const version = '0.1';
	const log = new Logger(`${scriptName} ${version}`);

	let pubId = '144840',
		widgetId = '';

	function isMobile() {
		return window.matchMedia('only screen and (max-width: 760px)').matches;
	}

	if (document.body.classList.contains('home')) {
		widgetId = isMobile() ? '286638' : '286768';
	} else if (document.body.classList.contains('single-post')) {
		widgetId = isMobile() ? '286636' : '286635';
	}

	if (widgetId) {
		const scContent = document.querySelector('.sc-content');
		if (!scContent) {
			log.info('Could not find sc-content');
			return;
		}

		const alreadyExists = document.querySelector(
			'[data-widget-host="revcontent"]'
		);
		if (alreadyExists) {
			log.info('Already exists');
			return;
		}

		const div = (
			<>
				<div
					data-widget-host="revcontent"
					data-pub-id={pubId}
					data-widget-id={widgetId}
				></div>
				<script
					src={`https://delivery.revcontent.com/${pubId}/${widgetId}/widget.js`}
					async
				></script>
			</>
		);
		scContent.append(div);
		log.info('Injected');
	}
};

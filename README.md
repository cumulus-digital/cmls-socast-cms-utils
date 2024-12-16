# Scripts for SoCast CMS Sites

A collection of front-end scripts for SoCast CMS sites.

# Deployment

Distribution scripts are located in `./dist`. Distribution can be made either through the single bundle.js file or through individual categories to enable consent management handlers.

- `main.js` *Must be loaded before any other bundle* (except bundle.js, which already includes this).
  - Initializes window._CMLS, window.__CMLSINTERNAL, and associated libraries.
- `advertising.js` Advertising support, custom slots and injected placements.
- `analytics.js` Analytics support and events.
- `functionality.js` Pure functionality support.
  - NO tracking, ads, or any PII cookies should be created here.

Each category folder under `./src` contains an `index.js` file to manage the decision-making and importing code within their `modules` subdirectories. Modules which may be imported remotely during runtime contain a `shouldImport.js` file exporting a function to determine if the full library is required. shouldImport functions may return a function or Promise which may then import the rest of the library. Remote modules are asyncronously loaded, automatically, using webpack lazy imports.

Note that remote modules in `dist` are named using content hashes which *will* change. Mapping is maintained by webpack. Do not attempt to import or include them directly.

## Runtime logging

Processes, state, and debugging are logged at runtime with a console wrapper function to distinguish modules with distinct header tags and colors. Logging is available in both development and production builds, but is disabled by default. Logging may be enabled by appending `cmlsDebug` to any URL where this package is included, or persistently by setting a `cmlsDebug` cookie for the domain.

# Development

This project consists of javascript and SASS. Dependencies are managed with npm. Compilation is handled with webpack+babel. Modules are imported at runtime using dynamic import() and webpack lazy loading.

JSX note: Several modules contain code which looks like JSX, but this project does not use react/preact. JSX compilation is handled by a custom pragma `h` exported by `./src/utils/createElement.js`.

## First steps

```
git clone https://github.com/cumulus-digital/cmls-amp-cms-utils
cd cmls-amp-cms-utils
npm install
```

## Development server

`npm start` will launch a local http server at `http://localhost:3000` serving *development* env bundles.

Be aware the dev server will allow connections from **ANYWHERE**. This helps with interception and redirection of the live scripts on a production site. The Chrome extension [Requestly](https://chrome.google.com/webstore/detail/requestly-open-source-htt/mdnleldcmiljblolnjhpnblkcekpdkpa) is useful for testing local changes on the fly by intercepting the live script includes from the CDN and redirecting them to the local node server.

`npm run serve-prod` launches the dev server serving *production* env bundles.

## Production build

`npm run build` compiles all scripts and styles into the `dist` dir.

## Updating packages

`npm run full-upgrade` performs an update and upgrade of npm packages in one. It *does not* rebuild `dist`.

JS LogFlush Manager
===============

This is an example of log storage manager for [JS LogFlush](https://github.com/hindmost/jslogflush).

[Demo](http://demos.savreen.com/jslogflush-manager/)

**Note**: Demo has some differences from this repository:

* Authentication. Use these credentials to log in: `demo/demo`.
* Config options are only accessible in read-only mode, except `app_urls` option which has separate view.
* Number of web app urls (stored in `app_urls` option) is limited to 3 (newer items shifts older).


How to use
-------------
Plug _JS LogFlush_ [processing script](http://demos.savreen.com/jslogflush-manager/logger.php) into your web application by following [README instructions](https://github.com/hindmost/jslogflush), register the latter in the manager by entering its URL in the "New web app" field and you can watch and manage all the data logged (by console.log calls) in your web app.

[Screencast](http://youtu.be/AFfTu2F3leM)


Thanks
-------------
* [Backbone.js](http://backbonejs.org/)
* [Twitter Bootstrap](http://getbootstrap.com/)
* [Composer](https://getcomposer.org/)


License
-------------
* [GPL v2](http://opensource.org/licenses/GPL-2.0)

function manager(urlCfg, urlFilelist, deftCfg, deftFilelist, intFilelistFetch) {

    intFilelistFetch = (intFilelistFetch || 60)* 1000;

    var Cfg = Backbone.Model.extend({
        initialize: function(){
        },
        sync: function(method, model, options){
            var params = method == 'read'?
                {
                    type: 'GET', url: urlCfg, dataType: 'json'
                } :
                {
                    type: 'POST', url: urlCfg,
                    contentType: 'application/json',
                    data: JSON.stringify(options.attrs || model.toJSON(options))
                };
            var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
            model.trigger('request', model, xhr, options);
            return xhr;
        },
        buildUrlAttrs: function(url){
            var title = url.substr(url.indexOf('://')+3);
            if (title.length > 35) title = title.substr(0, 35)+ '...';
            return {id: url, title: title};
        },
        syncUrls: function(method, model, options){
            var resp, errMsg = 'Sync error';
            var dfd = Backbone.$ ?
              (Backbone.$.Deferred && Backbone.$.Deferred()) :
              (Backbone.Deferred && Backbone.Deferred());
            var urls = this.get('app_urls'), url;
            if (urls)
            switch (method) {
            case 'read':
                resp = _.map(urls, this.buildUrlAttrs);
                break;
            case 'create': case 'update':
                url = model.attributes.id;
                if (_.indexOf(urls, url) < 0)
                    this.save({app_urls: _.union(urls, url)});
                break;
            case 'delete':
                url = model.attributes.id;
                if (_.indexOf(urls, url) >= 0)
                    this.save({app_urls: _.without(urls, url)});
                break;
            default:
            }
            if (resp) {
                if (options && options.success) options.success(resp);
                if (dfd) dfd.resolve(resp);
            } else {
                if (options && options.error) options.error(errMsg);
                if (dfd) dfd.reject(errMsg);
            }
            if (options && options.complete) options.complete(resp);
            return dfd && dfd.promise();
        }
    });
    var cfg = new Cfg(deftCfg);

    var Url = Backbone.Model.extend({
        defaults: {
            id: '',
            title: '',
            selected: false
        },
        initialize: function() {
        },
        sync: function(method, model, options){
            return cfg.syncUrls(method, model, options);
        }
    });

    var UrlList = Backbone.Collection.extend({
        model: Url,
        initialize: function() {
            this.listenTo(cfg, 'sync', this.onCfgSync);
        },
        sync: function(method, list, options){
            return cfg.syncUrls(method, list, options);
        },
        onCfgSync: function(model, resp, options) {
            if (resp) {
                this.fetch();
            }
            else {
                cfg.fetch();
                callFilelistFetch();
            }
        }
    });
    var urlList = new UrlList();

    var File = Backbone.Model.extend({
        defaults: {
            id: '',
            path: '',
            url: '',
            time: 0,
            ip: '',
            useragent: '',
            visible: true,
            selected: false
        },
        sync: function(method, model, options) {
            var params = {
                type: 'POST', url: urlFilelist,
                data: {id: model.attributes.id}
            };
            var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
            model.trigger('request', model, xhr, options);
            return xhr;
        }
    });

    var FileList = Backbone.Collection.extend({
        model : File,
        initialize: function() {
            this.lastfetch = 0;
        },
        parse: function(response) {
            var aResp = [];
            for (var key in response) {
                if (typeof key != 'string') continue;
                if (key == 'stamp') {
                    this.lastfetch = response.stamp; continue;
                }
                var arr = response[key];
                aResp.push({
                    id: key, path: cfg.get('dir')+key, url: arr[0],
                    time: (new Date(arr[1]*1000)).toLocaleString(),
                    ip: arr[2], useragent: arr[3]
                });
            }
            return aResp;
        },
        sync: function(method, list, options) {
            if (method != 'read') return false;
            var params = {
                type: 'GET', url: urlFilelist,
                data: {stamp: this.lastfetch},
                dataType: 'json'
            };
            var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
            list.trigger('request', list, xhr, options);
            return xhr;
        },
        filterByUrl: function(url) {
            this.each(function(model) {
                model.set('visible', !url || model.get('url') == url);
            });
        },
        filterByIp: function(ip) {
            if (!ip) return;
            this.each(function(model) {
                if (model.get('visible'))
                    model.set('visible', model.get('ip') == ip);
            });
        },
        destroyVisible: function() {
            var list = this.where({'visible': true});
            if (!list.length) return;
            var dfd = 0;
            _.each(list, function(model) {
                dfd = model.destroy();
            });
            if (dfd) dfd.done(callFilelistFetch);
        }
    });
    var fileList = new FileList();

    var fetchCount = 0, fetchId = 0, fetchFlag = true;
    function callFilelistFetch() {
        if (fetchId) clearTimeout(fetchId);
        if (fetchCount && fetchFlag) fileList.fetch({remove: true});
        fetchCount = 1;
        fetchId = setTimeout(callFilelistFetch, intFilelistFetch);
    }
    function setFilelistFetchFlag(b) {
        fetchFlag = Boolean(b);
    }

    var fileContent = new File({visible:false});

    var Selection = Backbone.Model.extend({
        defaults: {
            value: ''
        },
        init: function(keyLs, list){
            this.keyLs = keyLs && 'localStorage' in window && window.localStorage?
                keyLs : 0;
            this.list = list;
            this.on('change', this.apply);
            this.listenTo(this.list, 'reset', this.apply);
            this.listenTo(this.list, 'sync', this.apply);
            var v;
            if (this.keyLs && (v = localStorage.getItem(this.keyLs)))
                this.set('value', v);
        },
        select: function(value, bUseDesel) {
            var b = this.get('value') != value;
            if (!b && !bUseDesel) return;
            this.set('value', b? value : '');
            if (this.keyLs) localStorage.setItem(this.keyLs, this.get('value'));
        },
        apply: function() {
            var v = this.get('value');
            var found = 0;
            this.list.each(function(model) {
                var b = v && model.get('id') == v;
                model.set('selected', b);
                if (b) found = model;
            });
            this.applyExtra(found);
        },
        applyExtra: function(model) {
        }
    });

    var UrlSelection = Selection.extend({
        initialize: function() {
            this.init('sel-url', urlList);
        },
        applyExtra: function(model) {
            fileList.filterByUrl(this.get('value'));
        }
    });
    var urlSelection;
    
    var FileSelection = Selection.extend({
        initialize: function() {
            this.model = 0;
            this.cache = 0;
            this.init('sel-file', fileList);
        },
        getModel: function() {
            return this.model;
        },
        applyExtra: function(model) {
            if (this.model) this.stopListening(this.model);
            this.model = model;
            if (!this.model) {
                fileContent.set('visible', false);
                return;
            }
            this.listenTo(this.model, 'change:visible', this.updateContentView);
            var value = this.get('value');
            if (value == this.cache) {
                this.updateContentView();
                return;
            }
            fileContent.set(_.extend(
                _.omit(this.model.attributes, 'selected'), {'selected': false}
            ));
            Backbone.ajax({
                url: this.model.get('path'),
                type: 'GET', dataType: 'text', context: this,
                success: function(text) {
                    this.cache = value;
                    fileContent.set('selected', this.fixContent(text));
                }
            });
        },
        updateContentView: function() {
            if (!this.model) return;
            fileContent.set('visible', this.model.get('visible'));
        },
        fixContent: function(text) {
            var map = {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#039;'
            };
            var i = text.indexOf('\n\n');
            if (i) text = text.substr(i);
            return text
                .replace(/[&<>"']/g, function(m) {
                    return map[m];
                })
                .replace(/\n(\d+)\t/g, function(m, s) {
                    return '\n<strong>+'+s/1000+' sec:</strong>\n';
                })
                .replace(/(?:^\s+|\s+$)/g, '');
        }
    });
    var fileSelection;
    
    var FileFilter = Backbone.Model.extend({
        defaults: {
            value: ''
        },
        initialize: function(){
            this.listenTo(fileList, 'change:visible', this.reset);
        },
        reset: function() {
            this.set('value', '');
            setFilelistFetchFlag(true);
        },
        setValue: function(v) {
            this.set('value', v);
            setFilelistFetchFlag(false);
        }
    });
    var fileFilter;

    var UrlView = Backbone.View.extend({
        tagName: 'li',
        template: _.template( $('#url-template').html() ),
        events: {
            'click a.url-item' : 'select',
            'click a.remove' : 'destroy'
        },
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
            this.listenTo(this.model, 'destroy', function() {
                this.remove();
            });
            this.listenTo(this.model, 'remove', function() {
                this.model.clear({silent:true});
                this.remove();
            });
        },
        render: function() {
            this.$el.html( this.template( this.model.toJSON() ) );
            if (this.model.get('selected'))
                this.$el.addClass('active');
            else
                this.$el.removeClass('active');
            return this;
        },
        select: function(e) {
            e.preventDefault();
            urlSelection.select(this.model.get('id'), true);
        },
        destroy: function(e) {
            e.preventDefault();
            this.model.destroy();
        }
    });

    var UrlListView = Backbone.View.extend({
        el: '#url-list',
        initialize: function() {
            this.listenTo(urlList, 'add', this.addOne);
            this.listenTo(urlList, 'all', this.render);
        },
        render: function() {
            if (urlList.length)
                this.$el.show();
            else
                this.$el.hide();
            return this;
        },
        addOne: function(item) {
            if (!('id' in item.attributes)) return;
            var urlView = new UrlView({model:item});
            this.$el.append(urlView.render().el);
        }
    });
    var urlListView = new UrlListView();

    var FileView = Backbone.View.extend({
        tagName: 'li',
        template: _.template( $('#file-template').html() ),
        events: {
            'click a.file-item' : 'select',
            'click a.remove' : 'destroy'
        },
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
            this.listenTo(this.model, 'destroy', function() {
                this.remove();
            });
            this.listenTo(this.model, 'remove', function() {
                this.model.clear({silent:true});
                this.remove();
            });
        },
        render: function() {
            if (this.model.get('visible'))
                this.$el.html( this.template( this.model.toJSON() ) ).show();
            else
                this.$el.hide();
            if (this.model.get('selected'))
                this.$el.addClass('active');
            else
                this.$el.removeClass('active');
            return this;
        },
        select: function(e) {
            e.preventDefault();
            fileSelection.select(this.model.get('id'));
        },
        destroy: function(e) {
            e.preventDefault();
            this.model.destroy().done(callFilelistFetch);
        }
    });

    var FileListView = Backbone.View.extend({
        el: '#file-list',
        initialize: function() {
            this.listenTo(fileList, 'add', this.addOne);
            this.listenTo(fileList, 'reset', this.addAll);
            this.listenTo(fileList, 'all', this.render);
            urlList.fetch().done(function() {
                fileList.reset(fileList.parse(deftFilelist));
                callFilelistFetch();
                urlSelection = new UrlSelection();
                fileSelection = new FileSelection();
                fileFilter = new FileFilter();
            });
        },
        render: function() {
            if (fileList.length)
                this.$el.show();
            else
                this.$el.hide();
            return this;
        },
        addOne: function(item) {
            if (!('id' in item.attributes)) return;
            var fileView = new FileView({model:item});
            this.$el.append(fileView.render().el);
        },
        addAll: function() {
            fileList.each(this.addOne, this);
        }
    });
    var fileListView = new FileListView();

    var FileContentView = Backbone.View.extend({
        el: '#file-content',
        template: _.template( $('#content-template').html() ),
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
        },
        render: function() {
            var model = fileSelection.getModel();
            if (model && model.get('visible') && this.model.get('visible') && this.model.get('selected')) {
                this.$el.html( this.template( this.model.toJSON() ) ).show();
            }
            else
                this.$el.hide();
            return this;
        }
    });
    var fileContentView = new FileContentView({model:fileContent});

    var CfgView = Backbone.View.extend({
        el: '#config',
        template: _.template( $('#config-template').html() ),
        events: {
            'click button.save' : 'saveForm'
        },
        initialize: function() {
            var self = this;
            this.$el.on('show.bs.modal', function () {
                self.render();
            });
        },
        render: function() {
            this.$('form').html( this.template( this.model.toJSON() ) );
            return this;
        },
        saveForm: function(e) {
            e.preventDefault();
            var attrs = {};
            _.each(this.$('form').serializeArray(), function(obj) {
                attrs[obj.name] = parseFloat(obj.value);
            });
            if (Object.keys(attrs).length) this.model.save(attrs, {wait: true});
            this.$el.modal('hide');
        }
    });
    var cfgView = new CfgView({model:cfg});

    var ControlsView = Backbone.View.extend({
        el: '#controls',
        events: {
            'keypress input' : 'create',
            'click button.filter' : 'toggle',
            'click button.refresh' : 'refresh',
            'click button.remove' : 'destroy'
        },
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
            this.btn = this.$('button.filter');
            this.$('input').val('');
        },
        render: function() {
            var v = this.model.get('value');
            if (v)
                this.btn.addClass('active').children('.value').html(': '+v);
            else
                this.btn.removeClass('active').children('.value').html('');
            return this;
        },
        create: function(e) {
            if (e.which != 13) return;
            var el = e.target;
            var v = $(el).val();
            if (!v) return;
            $(el).val('').blur();
            urlList.create(cfg.buildUrlAttrs(v));
        },
        refresh: function(e) {
            e.preventDefault();
            $(e.target).blur();
            callFilelistFetch();
        },
        toggle: function(e) {
            e.preventDefault();
            $(e.target).blur();
            var v = this.model.get('value');
            var model = v? false : fileSelection.getModel();
            if (!v && !model) return;
            if (!v) {
                v = model.get('ip');
                fileList.filterByIp(v);
                this.model.setValue(v);
            }
            else {
                this.model.reset();
                urlSelection.apply();
            }
        },
        destroy: function(e) {
            e.preventDefault();
            $(e.target).blur();
            fileList.destroyVisible();
        }
    });
    var controlsView = new ControlsView({model:fileFilter});
}

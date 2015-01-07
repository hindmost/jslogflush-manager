function manager(urlCfg, urlFilelist, deftCfg, deftFilelist, intFilelistUpdate) {

    intFilelistUpdate = (intFilelistUpdate || 60)* 1000;

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
            }
        }
    });
    var urlList = new UrlList();

    var File = Backbone.Model.extend({
        defaults: {
            id: '',
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
            this.updCount = this.updId = 0;
            this.updFlag = true;
            this.listenTo(cfg, 'sync', this.onCfgSync);
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
                    id: key, url: arr[0],
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
        onCfgSync: function(model, resp, options) {
            if (!resp) {
                this.update();
            }
        },
        findById: function(id) {
            return this.findWhere({'id': id});
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
            var list = this.where({'visible': true}), n = list.length;
            if (!n) return;
            var count = 0, self = this;
            _.each(list, function(model) {
                model.destroy().always(function() {
                    if (++count >= n) self.update();
                });
            });
        },
        update: function() {
            if (this.updId) clearTimeout(this.updId);
            if (this.updCount && this.updFlag) this.fetch({remove: true});
            this.updCount = 1;
            var fn = _.bind(this.update, this);
            this.updId = setTimeout(fn, intFilelistUpdate);
        },
        setUpdFlag: function(b) {
            this.updFlag = Boolean(b);
        }
    });
    var fileList = new FileList();

    var FileContent = File.extend({
        defaults: {
            path: '',
            content: ''
        },
        initialize: function() {
            this.value = 0;
            this.source = 0;
        },
        apply: function(v) {
            if (this.source) this.stopListening(this.source);
            this.source = fileList.findById(v) || 0;
            if (!this.source) {
                this.updateVisible();
                return;
            }
            this.listenTo(this.source, 'change:visible', this.updateVisible);
            if (v == this.value) {
                this.updateVisible();
                return;
            }
            this.set(_.extend(
                _.omit(this.source.attributes, 'selected'),
                {'content': '', 'path': cfg.get('dir')+this.source.get('id')}
            ));
            Backbone.ajax({
                url: this.get('path'),
                type: 'GET', dataType: 'text', context: this,
                success: function(text) {
                    this.value = v;
                    this.set('content', this.fixText(text));
                }
            });
        },
        updateVisible: function() {
            this.set('visible', this.source? this.source.get('visible') : false);
        },
        fixText: function(text) {
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
    var fileContent = new FileContent({visible:false});

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
            this.list.each(function(model) {
                model.set('selected', v && model.get('id') == v);
            });
            this.applyExtra();
        },
        applyExtra: function() {
        }
    });

    var UrlSelection = Selection.extend({
        initialize: function() {
            this.init('sel-url', urlList);
        },
        applyExtra: function() {
            fileList.filterByUrl(this.get('value'));
        }
    });
    var urlSelection = new UrlSelection();
    
    var FileSelection = Selection.extend({
        initialize: function() {
            this.init('sel-file', fileList);
        },
        applyExtra: function() {
            fileContent.apply(this.get('value'));
        }
    });
    var fileSelection = new FileSelection();

    var FileFilter = Backbone.Model.extend({
        defaults: {
            value: ''
        },
        initialize: function(){
            this.listenTo(fileList, 'change:visible', this.reset);
        },
        setVal: function(v) {
            this.set('value', v);
            fileList.setUpdFlag(v? true : false);
            v? fileList.filterByIp(v) : urlSelection.apply();
        },
        reset: function() {
            this.setVal('');
        }
    });
    var fileFilter = new FileFilter();

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
            this.listenTo(this.collection, 'add', this.addOne);
            this.listenTo(this.collection, 'all', this.render);
            this.collection.fetch();
        },
        render: function() {
            if (this.collection.length)
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
    var urlListView = new UrlListView({collection: urlList});

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
            this.model.destroy().always(function() {
                fileList.update();
            });
        }
    });

    var FileListView = Backbone.View.extend({
        el: '#file-list',
        initialize: function() {
            this.listenTo(this.collection, 'add', this.addOne);
            this.listenTo(this.collection, 'reset', this.addAll);
            this.listenTo(this.collection, 'all', this.render);
            this.collection.reset(this.collection.parse(deftFilelist));
            this.collection.update();
        },
        render: function() {
            if (this.collection.length)
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
            this.collection.each(this.addOne, this);
        }
    });
    var fileListView = new FileListView({collection: fileList});

    var FileContentView = Backbone.View.extend({
        el: '#file-content',
        template: _.template( $('#content-template').html() ),
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
        },
        render: function() {
            if (this.model.source && this.model.source.get('visible') &&
                this.model.get('visible') && this.model.get('content')) {
                this.$el.html( this.template( this.model.toJSON() ) ).show();
            }
            else
                this.$el.hide();
            return this;
        }
    });
    var fileContentView = new FileContentView({model: fileContent});

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
            fileList.update();
        },
        toggle: function(e) {
            e.preventDefault();
            $(e.target).blur();
            var v = this.model.get('value');
            if (v)
                this.model.reset();
            else if (fileContent.source)
                this.model.setVal(fileContent.source.get('ip'));
        },
        destroy: function(e) {
            e.preventDefault();
            $(e.target).blur();
            fileList.destroyVisible();
        }
    });
    var controlsView = new ControlsView({model:fileFilter});
}

function manager(urlCfg, urlFilelist, deftCfg, deftFilelist, intFilelistFetch) {

    intFilelistFetch = (intFilelistFetch || 60)* 1000;

    var Cfg = Backbone.Model.extend({
        initialize: function(){
            console.log('Cfg.initialize(): app_urls=%o', this.get('app_urls'));
        },
        sync: function(method, model, options){
            console.log('Cfg:sync(): method=%s',method);
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
        buildUrlAttrs: function(url, i){
            var title = url.substr(url.indexOf('://')+3);
            if (title.length > 35) title = title.substr(0, 35)+ '...';
            return {id: url, title: title, i: typeof i != 'undefined'? i+1 : 0};
        },
        syncUrls: function(method, model, options){
            var resp, errMsg = 'Sync error';
            var dfd = Backbone.$ ?
              (Backbone.$.Deferred && Backbone.$.Deferred()) :
              (Backbone.Deferred && Backbone.Deferred());
            var urls = this.get('app_urls'), url;
            console.log('Cfg:syncUrls(): method=%s; options=%o; urls=%o',method,options,urls);
            if (urls)
            switch (method) {
            case 'read':
                console.log('read:');
                resp = _.map(urls, this.buildUrlAttrs);
                break;
            case 'create': case 'update':
                url = model.attributes.id;
                console.log('create: model=%o; url=%s',model, url);
                if (_.indexOf(urls, url) < 0)
                    this.save({app_urls: _.union(urls, url)});
                break;
            case 'delete':
                url = model.attributes.id;
                console.log('delete: model=%o; url=%s',model, url);
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
            i: 0
        },
        initialize: function() {
            console.log('Url:initialize(): attributes=%o',this.attributes);
        },
        sync: function(method, model, options){
            console.log('Url:sync():');
            return cfg.syncUrls(method, model, options);
        }
    });

    var UrlList = Backbone.Collection.extend({
        model: Url,
        initialize: function() {
            this.listenTo(cfg, 'sync', this.onCfgSync);
        },
        sync: function(method, list, options){
            console.log('UrlList:sync():');
            return cfg.syncUrls(method, list, options);
        },
        onCfgSync: function(model, resp, options) {
            console.log('UrlList:onCfgSync(): options=%o',options);
            if (resp) {
                console.log('on-fetch: resp=%o',resp);
                this.fetch();
            }
            else {
                console.log('on-save');
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
            display: true,
            content: '',
            i: 0
        },
        sync: function(method, model, options) {
            console.log('File:sync(): method=%s; model.attrs=%o',method,model.attributes);
            var params = {
                type: 'POST', url: urlFilelist,
                data: {id: model.attributes.id}
            };
            var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
            model.trigger('request', model, xhr, options);
            return xhr;
        },
        setDisplay: function(b) {
            this.set('display', b);
        }
    });
    var fileContent = new File({display:false});

    var FileList = Backbone.Collection.extend({
        model : File,
        initialize: function() {
            this.lastfetch = 0;
        },
        parse: function(response) {
            console.log('parse(): response=%o',response);
            var aResp = [], i = 0;
            for (var key in response) {
                if (typeof key != 'string') continue;
                if (key == 'stamp') {
                    this.lastfetch = response.stamp; continue;
                }
                var arr = response[key];
                aResp.push({
                    id: key, path: cfg.get('dir')+key, url: arr[0],
                    time: (new Date(arr[1]*1000)).toLocaleString(),
                    ip: arr[2], useragent: arr[3], i: ++i
                });
            }
            console.log('aResp=%o',aResp);
            return aResp;
        },
        sync: function(method, list, options) {
            console.log('FileList:sync(): method=%s; options=%o; lastfetch=%d',method,options,this.lastfetch);
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
            console.log('filterByUrl(): url=%s',url);
            this.each(function(model) {
                model.set('display', !url || model.get('url') == url);
            });
        },
        filterByIp: function(ip) {
            if (!ip) return;
            console.log('filterByUrl(): ip=%s',ip);
            this.each(function(model) {
                if (model.get('display'))
                    model.set('display', model.get('ip') == ip);
            });
        },
        destroyVisible: function() {
            var list = this.where({'display': true});
            console.log('destroyVisible(): list=%d',list.length);
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
        console.log('callFilelistFetch(): intFilelistFetch=%d; fetchId=%d; fetchCount=%d; fetchFlag=%d',intFilelistFetch,fetchId,fetchCount,fetchFlag);
        if (fetchId) clearTimeout(fetchId);
        if (fetchCount && fetchFlag) fileList.fetch({remove: true});
        fetchCount = 1;
        fetchId = setTimeout(callFilelistFetch, intFilelistFetch);
    }
    function setFilelistFetchFlag(b) {
        fetchFlag = Boolean(b);
        console.log('setFilelistFetchFlag(): fetchFlag=%d',fetchFlag);
    }

    var Selection = Backbone.Model.extend({
        defaults: {
            value: 0
        },
        initialize: function(idLs){
            this.on('change', this.apply);
            this.idLs = idLs && 'localStorage' in window && window.localStorage?
                idLs : 0;
            var v;
            if (this.idLs && (v = localStorage.getItem(this.idLs)))
                this.set('value', v);
            console.log('Selection:initialize(): idLs=%s; value=%s',this.idLs,this.get('value'));
            this.apply();
        },
        select: function(value, bUseDesel) {
            var b = this.get('value') != value;
            console.log('Selection:select(): value=%s (%s); bUseDesel=%d; b=%d',value,this.get('value'),bUseDesel,b);
            if (!b && !bUseDesel) return;
            this.set('value', b? value : 0);
            if (this.idLs) localStorage.setItem(this.idLs, this.get('value'));
        },
        apply: function() {
            console.log('Selection:apply():');
        }
    });

    var UrlSelection = Selection.extend({
        initialize: function() {
            console.log('UrlSelection:initialize():');
            Selection.prototype.initialize.call(this, 'sel-url');
        },
        getModel: function() {
            return this.get('value')?
                urlList.findWhere({'id': this.get('value')}) : false;
        },
        apply: function() {
            var v = this.get('value');
            console.log('UrlSelection:apply(): v=%s',v);
            fileList.filterByUrl(v? v : 0);
        }
    });
    var urlSelection = new UrlSelection();
    
    var FileSelection = Selection.extend({
        initialize: function() {
            console.log('FileSelection:initialize():');
            Selection.prototype.initialize.call(this, 'sel-file');
        },
        getModel: function() {
            return this.get('value')?
                fileList.findWhere({id: this.get('value'), display: true})
                : false;
        }
    });
    var fileSelection = new FileSelection();
    
    var FileFilter = Backbone.Model.extend({
        defaults: {
            value: false
        },
        initialize: function(){
            this.listenTo(fileList, 'change:display', this.reset);
            console.log('FileFilter:initialize(): value=%d', this.get('value'));
        },
        reset: function() {
            console.log('FileFilter:reset():');
            this.set('value', false);
            setFilelistFetchFlag(true);
        },
        setValue: function(v) {
            console.log('FileFilter:setValue(): v=%d',v);
            this.set('value', v);
            setFilelistFetchFlag(false);
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
            this.listenTo(this.model, 'destroy', function() {
                console.log('UrlView:remove-from-destroy:');
                this.remove();
            });
            this.listenTo(this.model, 'remove', function() {
                console.log('UrlView:remove-from-remove:');
                this.model.clear({silent:true});
                this.remove();
            });
        },
        render: function() {
            console.log('UrlView:render(): model=%o', this.model.attributes);
            this.$el.html( this.template( this.model.toJSON() ) );
            return this;
        },
        select: function(e) {
            e.preventDefault();
            console.log('UrlView:select(): id=%s', this.model.get('id'));
            urlSelection.select(this.model.get('id'), true);
        },
        destroy: function(e) {
            e.preventDefault();
            console.log('UrlView:destroy(): model=%o', this.model);
            this.model.destroy();
        }
    });

    var UrlListView = Backbone.View.extend({
        el: '#url-list',
        initialize: function() {
            this.listenTo(urlList, 'add', this.addOne);
            this.listenTo(urlList, 'all', this.render);
            urlList.fetch();
        },
        render: function() {
            console.log('UrlListView:render(): n(urlList)=%d', urlList.length);
            if (urlList.length)
                this.$el.show();
            else
                this.$el.hide();
            return this;
        },
        addOne: function(item) {
            console.log('UrlListView:addOne(): model=%o', item.attributes);
            if (!('id' in item.attributes)) return;
            var urlView = new UrlView({model:item});
            this.$el.append(urlView.render().el);
        },
        addAll: function() {
            console.log('UrlListView:addAll(): n(urlList)=%d', urlList.length);
            urlList.each(this.addOne, this);
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
                console.log('FileView:remove-from-destroy:');
                this.remove();
            });
            this.listenTo(this.model, 'remove', function() {
                console.log('FileView:remove-from-remove:');
                this.model.clear({silent:true});
                this.remove();
            });
        },
        render: function() {
            console.log('FileView:render(): id=%s; display=%d', this.model.get('id'), this.model.get('display'));
            if (this.model.get('display'))
                this.$el.html( this.template( this.model.toJSON() ) ).show();
            else
                this.$el.hide();
            return this;
        },
        select: function(e) {
            e.preventDefault();
            console.log('FileView:select(): id=%s', this.model.get('id'));
            fileSelection.select(this.model.get('id'));
        },
        destroy: function(e) {
            e.preventDefault();
            console.log('FileView:destroy():');
            this.model.destroy().done(callFilelistFetch);
        }
    });

    var FileListView = Backbone.View.extend({
        el: '#file-list',
        initialize: function() {
            this.listenTo(fileList, 'add', this.addOne);
            this.listenTo(fileList, 'reset', this.addAll);
            this.listenTo(fileList, 'all', this.render);
            fileList.reset(fileList.parse(deftFilelist));
            callFilelistFetch();
        },
        render: function() {
            console.log('FileListView:render(): n(fileList)=%d', fileList.length);
            if (fileList.length)
                this.$el.show();
            else
                this.$el.hide();
            return this;
        },
        addOne: function(item) {
            console.log('FileListView:addOne(): model=%o', item.attributes);
            if (!('id' in item.attributes)) return;
            var fileView = new FileView({model:item});
            this.$el.append(fileView.render().el);
        },
        addAll: function() {
            console.log('FileListView:addAll(): n(fileList)=%d', fileList.length);
            fileList.each(this.addOne, this);
        }
    });
    var fileListView = new FileListView();

    var SelectionView = Backbone.View.extend({
        initialize: function() {
            console.log('SelectionView:initialize(): value=%s',this.model.get('value'));
            this.listenTo(this.model, 'change', this.render);
            if (this.model.get('value')) this.render();
        },
        render: function() {
            var els = this.$el.children('li');
            var i = this.getIndex();
            console.log('SelectionView:render(): n(els)=%d; i=%d', els.length, i);
            if (els.length) {
                els.removeClass('active');
                if (i && i <= els.length) els.eq(i-1).addClass('active');
            }
            return this;
        },
        getIndex: function() {
            return 0;
        }
    });

    var UrlSelectionView = SelectionView.extend({
        el: $('#url-list'),
        getIndex: function() {
            var model = this.model.getModel();
            console.log('UrlSelectionView:getIndex(): value=%s; model=%o',this.model.get('value'),model);
            return model? model.get('i') : 0;
        }
    });
    var urlSelectionView = new UrlSelectionView({model:urlSelection});

    var FileSelectionView = SelectionView.extend({
        el: $('#file-list'),
        initialize: function() {
            console.log('FileSelectionView:initialize():');
            this.listenTo(fileList, 'change', this.render);
            this.listenTo(fileList, 'remove', this.render);
            this.cache = 0;
            SelectionView.prototype.initialize.call(this);
        },
        getIndex: function() {
            var model = this.model.getModel();
            console.log('FileSelectionView:getIndex(): value=%s (%s); model=%o',this.model.get('value'),this.cache,model);
            this.callContent(this.model.get('value'), model);
            return model? model.get('i') : 0;
        },
        callContent: function(value, model) {
            if (!model) {
                console.log('FileSelectionView:callContent(): display off');
                fileContent.set('display', false);
                return;
            }
            if (value == this.cache) {
                console.log('FileSelectionView:callContent(): display on');
                fileContent.set('display', true);
                return;
            }
            var urlCont = model.get('path');
            console.log('FileSelectionView:callContent(): urlCont=%s',urlCont);
            fileContent.set({display: false, content: ''});
            $.ajax({
                url: urlCont, type: 'GET', dataType: 'text', context: this,
                success: function(text) {
                    this.cache = value;
                    fileContent.set(model.attributes);
                    fileContent.set('content', this.fixContent(text));
                }
            });
        },
        fixContent: function (text) {
            var map = {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#039;'
            };
            var i = text.indexOf('\n\n');
            if (i) text = text.substr(i);
            return $.trim(
                text.replace(/[&<>"']/g, function(m) { return map[m]; })
                .replace(/\n(\d+)\t/g, function(m, s) {
                    return '\n<strong>+'+s/1000+' sec:</strong>\n'; }
                )
            );
        }
    });
    var fileSelectionView = new FileSelectionView({model:fileSelection});

    var FileContentView = Backbone.View.extend({
        el: $('#file-content'),
        template: _.template( $('#content-template').html() ),
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
        },
        render: function() {
            console.log('FileContentView:render(): display=%d; content=%d', this.model.get('display'), Boolean(this.model.get('content')));
            if (this.model.get('display') && this.model.get('content')) {
                console.log('display: on');
                this.$el.html( this.template( this.model.toJSON() ) ).show();
            }
            else
                this.$el.hide();
            return this;
        }
    });
    var fileContentView = new FileContentView({model:fileContent});

    var CfgView = Backbone.View.extend({
        el: $('#config'),
        template: _.template( $('#config-template').html() ),
        events: {
            'click button.save' : 'saveForm'
        },
        initialize: function() {
            console.log('CfgView:initialize():');
            var self = this;
            this.$el.on('show.bs.modal', function () {
                self.render();
            });
        },
        render: function() {
            console.log('CfgView:render(): model=%o',this.model.toJSON());
            this.$('form').html( this.template( this.model.toJSON() ) );
            return this;
        },
        saveForm: function(e) {
            e.preventDefault();
            var attrs = {};
            _.each(this.$('form').serializeArray(), function(obj) {
                attrs[obj.name] = parseFloat(obj.value);
            });
            console.log('CfgView:saveForm(): attrs=%o',attrs);
            if (Object.keys(attrs).length) this.model.save(attrs, {wait: true});
            this.$el.modal('hide');
        }
    });
    var cfgView = new CfgView({model:cfg});

    var ControlsView = Backbone.View.extend({
        el: $('#controls'),
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
            console.log('ControlsView:render(): v=%s', v);
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
            console.log('ControlsView:create(): v=%s',v);
            if (!v) return;
            $(el).val('').blur();
            urlList.create(cfg.buildUrlAttrs(v));
        },
        refresh: function(e) {
            e.preventDefault();
            $(e.target).blur();
            console.log('ControlsView:refresh():');
            callFilelistFetch();
        },
        toggle: function(e) {
            e.preventDefault();
            $(e.target).blur();
            var v = this.model.get('value');
            var model = v? false : fileSelection.getModel();
            console.log('ControlsView:toggle(): v=%s; model=%o',v,model);
            if (!v && !model) return;
            if (!v) {
                v = model.get('ip');
                console.log('applyFilter: v=%s', v);
                fileList.filterByIp(v);
                this.model.setValue(v);
            }
            else {
                console.log('resetFilter:');
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

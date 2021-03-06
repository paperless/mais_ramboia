// RequireJS configs
require.config({
    paths: {
        // Utils
        'console': 'utils/console',
        'dom': 'utils/dom',
        // Socket.IO
        'socket.io': '/socket.io/socket.io',
        // Libs
        'cloak': 'libs/cloak-client',
        // Bower
        'promises': '../vendor/q/q',
        'underscore': '../vendor/underscore/underscore',
        'domready': '../vendor/domready/ready',
        'reqwest': '../vendor/reqwest/reqwest',
        'bonzo': '../vendor/bonzo/bonzo',
        'qwery': '../vendor/qwery/qwery',
        'bean': '../vendor/bean/bean',
        'fingerprint': '../vendor/fingerprint/fingerprint',
        'moment': '../vendor/moment/moment'
    },
    shim: {
        'underscore': {
            exports: '_'
        },
        'cloak': {
            deps: [ 'socket.io' ],
            exports: 'cloak'
        }
    }
});

define(function (require) {
    'use strict';

    // Requires
    var console = require('console'),
        when = require('promises');

    var reqwest = require('reqwest'),
        _ = require('underscore'),
        $ = require('dom');

    var cloak = require('cloak'),
        Fingerprint = require('fingerprint');

    var player = require('parts/player');

    var moment = require('moment');

    // constants
    var SETTINGS = {
        API: {
            SETTINGS: '/api/settings'
        }
    };

    var TEMPLATES = {
        CHAT: '<p><span class="username"><%- it.usr.name %></span>: <%- it.msg %></p>',
        SYSTEM: '<p class="system"><em><span class="username"><%- it.usr.name %></span> <%- it.msg %></em></p>',
        ENTRY: '<li title="<%- it.title %> (Requested by <%- it.user %>)">' +
            '<span style="background-image: url(<%- it.thumb %>)"></span>' +
            '<header>' +
            '<p><%- it.title %></p>' +
            '</header>' +
            '</li>',
        TIMER: '<span class="elapsed"><%- it.elapsed %></span>' +
            '<span class="separator"> / </span>' +
            '<span class="total"><%- it.total %></span>'
    };

    // variables
    var _loaded = when.defer();

    var _currentUsername = 'Nameless User';

    var _elapsedTimer;

    // DOM elements
    var _$form,
        _$user,
        _$input;

    var _$messages,
        _$playlist;

    var _$mute,
        _$skip;

    var _$timer;

    function _loadSettings() {
        var deferred = when.defer();

        reqwest(SETTINGS.API.SETTINGS)
            .then(function onSuccess(settings) {
                SETTINGS = _.defaults(settings, SETTINGS);

                deferred.resolve(SETTINGS);
            },
            function onError(err) {
                console.debug(err);
                alert('There was an error loading the settings from the server');

                deferred.reject();
            }
        );

        return deferred.promise;
    }

    function _setup() {
        cloak.configure({
            serverEvents: {
                begin: _onBegin,
                resume: _onResume,
                disconnect: _onDisconnect
            },
            messages: {
                init: _onInit,
                chat: _onChat,
                name: _onNameChange,
                playlist: _onPlaylistChange,
                video: _onVideoChange,
                skip: _onSkipResponse
            }
        });

        cloak.run('//' + window.location.hostname + ':' + SETTINGS.PORT);
    }

    function _onBegin() {
        cloak.message('init', {
            uuid: new Fingerprint({
                canvas: true,
                ie_activex: true
            }).get()
        });
        _initTemplates();
    }

    function _onInit(data) {
        data = data || {};

        _onChat(data.chat);
        _onNameChange(data.name);

        if (data.playlist) {
            _onPlaylistChange(data.playlist);
            _onVideoChange(data.video);
        }

        _enableForm();
    }

    function _onResume() {
        _enableForm();
    }

    function _onDisconnect() {
        _disableForm();
    }

    function _enableForm() {
        _loaded.promise.then(function () {
            _.forEach($('input, button'), function (el) {
                $(el).removeAttr('disabled');
            });
        });
    }

    function _disableForm() {
        _loaded.promise.then(function () {
            _.forEach($('input, button'), function (el) {
                $(el).attr('disabled', 'disabled');
            });
        });
    }

    var _initTemplates = function () {
        for (var k in TEMPLATES) {
            if (!TEMPLATES.hasOwnProperty(k)) {
                continue;
            }

            TEMPLATES[k] = _.template(TEMPLATES[k]);
        }
    };

    function _onChat(entries) {
        _loaded.promise.then(function () {
            var $elements = _.chain(entries)
                .map(_printMessage)
                .flatten()
                .compact()
                .value();

            _$messages.prepend($elements);
        });
    }

    function _printMessage(entry) {
        entry = entry || {};

        var tmpl = entry.system ? TEMPLATES.SYSTEM : TEMPLATES.CHAT;

        return $.create(tmpl({
            it: entry
        }));
    }

    function _printTime(elapsed, total){
        var time = {
            elapsed: moment(0).add(moment.duration(elapsed, 's')).format('mm:ss'),
            total: moment(0).add(moment.duration(total, 's')).format('mm:ss')
        };

        var html = $.create(
            TEMPLATES.TIMER({
                it: time
            })
        );

        _$timer.html(html);
    }

    function _elapsedTimeChecker() {
        player.time().then(function(data){
            var elapsed = data.elapsed,
                total = data.total;

            _printTime(elapsed, total);
        });
    }

    function _onDomLoaded() {
        _$form = $('#chat-form');
        _$input = $('input', '#chat-form');
        _$user = $('#chat-name');

        _$messages = $('.entries .inner', '#chat-container');
        _$playlist = $('.playlist ul', '#video-container');

        _$mute = $('#mute');
        _$skip = $('#skip');

        _$timer = $('.player-time', '#video-container');

        _initListeners();

        _loaded.resolve();
    }

    function _initListeners() {
        _$form.on('submit', _onSubmit);
        _$user.on('click', _onUserClick);

        _$mute.on('click', _onMuteToggle);
        _$skip.on('click', _onSkipClick);
    }

    function _onSubmit(e) {
        e.preventDefault();

        var msg = _$input.val();

        if (msg.length > 0) {
            cloak.message('chat', msg);
            _$input.val('');
        }
    }

    function _onUserClick() {
        var newUsername = prompt("Username", _currentUsername);

        if (newUsername && newUsername.length > 1) {
            cloak.message('name', newUsername);
        }
    }

    function _onMuteToggle() {
        player.toggleMute().then(function (muted) {
            var _$icon = $(_$mute.find('i')),
                _$label = $(_$mute.find('span'));

            if (muted) {
                _$label.text('Unmute');

                _$icon.removeClass('fa-volume-up');
                _$icon.addClass('fa-volume-off');

                _$mute.addClass('pure-button-active');
            } else {
                _$label.text('Mute');

                _$icon.addClass('fa-volume-up');
                _$icon.removeClass('fa-volume-off');

                _$mute.removeClass('pure-button-active');
            }
        });
    }

    function _onSkipClick() {
        _$skip.attr('disabled', true);

        cloak.message('skip');
    }

    function _onSkipResponse(error) {
        if (error && error !== 'DUPLICATE_VOTE') {
            _$skip.attr('disabled', false);
        }
    }

    function _onNameChange(name) {
        _currentUsername = name;
    }

    function _onVideoChange(video) {
        video = video || {};

        if (!video.id) {
            player.stop();
            clearInterval(_elapsedTimer);
            _printTime(0,0);
        } else {
            player.play(video.id, video.timestamp);
            _elapsedTimer = setInterval(_elapsedTimeChecker, 600);
            _$skip.attr('disabled', false);
        }
    }

    function _onPlaylistChange(playlist) {
        _loaded.promise.then(function () {
            var $elements = _.chain(playlist)
                .map(_renderPlaylistEntry)
                .flatten()
                .compact()
                .value();

            _$playlist.html($elements);
        });
    }

    function _renderPlaylistEntry(entry) {
        return $.create(
            TEMPLATES.ENTRY({
                it: entry
            })
        );
    }

    // Init
    function init() {
        _loadSettings().then(_setup);
        $.ready(_onDomLoaded);
    }

    init();

    return {};
});

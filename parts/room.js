/* jshint nodejs:true */

var history = require('./history'),
    playlist = require('./playlist');

var _ = require('underscore');

var TIMEOUT = 300;

var timers = {};

var memberLeaves = function memberLeaves(usr) {
    var room = this;

    history.send(room, usr, 'has left the room', true);

    timers[usr.id] = setTimeout(playlist.recalculateVotes, TIMEOUT, room, usr);
};

var newMember = function newMember(usr) {
    clearTimeout(timers[usr.id]);
};

module.exports = {
    newMember: newMember,
    memberLeaves: memberLeaves
};
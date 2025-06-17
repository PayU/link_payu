'use strict';

var processInclude = require('base/util');

function initializeEvents() {
    var name = 'placeerror';

    var error = (new RegExp('[?&]' + encodeURIComponent(name) + '=([^&]*)')).exec(location.search);
    if (error) {
        $('.error-message').show();
        $('.error-message-text').text(decodeURIComponent(error[1]));
    }

    processInclude(require('./checkout/checkout'));
}

$(document).ready(function () {
    initializeEvents();
});

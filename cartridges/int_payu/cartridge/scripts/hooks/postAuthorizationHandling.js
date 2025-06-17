'use strict';

var URLUtils = require('dw/web/URLUtils');
var StringUtils = require('dw/util/StringUtils');
var server = require('server');



function postAuthorization(handlePaymentResult, order, options) {
    if (handlePaymentResult.redirection && handlePaymentResult.redirection.url) {
        return {
            error: false,
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: handlePaymentResult.redirection.url,
            redirect: true
        }
    }
}

module.exports = {
    postAuthorization: postAuthorization
}
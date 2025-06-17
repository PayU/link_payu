'use strict';

var server = require('server');
var webhookHelpers = require('*/cartridge/scripts/helpers/webhookHelper');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var Logger = require('dw/system/Logger');
/**
 * PayU Webhook Handler
 * 
 * Handles incoming webhook notifications from PayU PaymentsOS.
 * Parses the request body and passes it along with headers to the helper for processing.
 */
server.post('Webhook', function (req, res, next) {
    var result;
    try {
        var requestBody = JSON.parse(req.body);
        var headers = req.httpHeaders;
        result = webhookHelpers.handlePayUWebhook(requestBody, headers);
        res.setStatusCode(result.status);
        res.json({});
    } catch (e) {
        Logger.error('PayU Webhook Error: {0} ', JSON.stringify(e));
        res.setStatusCode(500);
        res.json({ error: 'Failed to consume webhook event.' });
    }
    return next();
});

server.get('Handle3DS', function (req, res, next) {
    try {
        COHelpers.handle3dsRedirect(req, res, next);
    } catch (e) {
        Logger.error('PayU Webhook Error: {0}', JSON.stringify(e));
        res.json({
            error: true,
            msg: 'Something went wrong.'
        })
    }
    return next();
})



module.exports = server.exports();
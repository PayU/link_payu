'use strict';
/* API Modules */
var dwsvc = require('dw/svc');
var Logger = require('dw/system/Logger');
var SERVICE_ID = 'https.payment.payu';
var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var PAYU_SERVICE_ACTIONS = {
    CREATE_TOKEN: 'create-token',
    CREATE_PAYMENT: 'create-payment',
    AUTHORIZATION: 'authorizations',
    CAPTURES: 'captures'
}


function getHeaders(action) {
    var headers = {
        'api-version': PayUFactory.CONFIGS.API_VERSION,
        'x-payments-os-env': PayUFactory.CONFIGS.ENVIRONMENT,

        // To-Do Need to send same IdempotencyKey if PAY_U_CASH Failed with status 503
        'idempotency-key': Math.random().toString(36).substr(2),
        'app-id': PayUFactory.CONFIGS.APP_ID,
        'Content-Type': 'application/json',
    }

    if (action === PayUFactory.ACTIONS.CREATE_CC_TOKEN || action === PayUFactory.ACTIONS.CARD_CVV_CODE) {
        headers['public-key'] = PayUFactory.CONFIGS.PUBLIC_KEY;
    } else {
        headers['private-key'] = PayUFactory.CONFIGS.PRIVATE_KEY;
    }

    if (PayUFactory.CONFIGS.THREE_D_S_CONFIG !== 'DISABLED') {
        var ip = request.httpHeaders['x-forwarded-for'] || request.httpRemoteAddress;
        if (ip && ip.indexOf(',') !== -1) {
            ip = ip.split(',')[0]; // take the first IP if multiple
        }
        headers['x-client-ip-address'] = ip || 'SYSTEM_JOB';
        headers['x-client-user-agent'] = 'Mozilla/5.0 (Windows; U; Windows NT 5.0) AppleWebKit/533.2.1 (KHTML, like Gecko) Chrome/25.0.826.0 Safari/533.2.1'
    }
    return headers;
}

/*
 *
 * HTTP Services
*/
var serviceConfig = {
    createRequest: function(service, requestDataContainer) {
        // var URL = 'https://api.paymentsos.com';
        var URL = service.configuration.credential.URL;
        URL = URL + requestDataContainer.path;
        
        var headers = getHeaders(requestDataContainer.action);
        if (requestDataContainer.ipKey) {
            headers['idempotency-key'] = requestDataContainer.ipKey;
        }
        Object.keys(headers).forEach(function (key) {
            service.addHeader(key, headers[key]);
        });
        service.URL = URL;
        var requestMethod = requestDataContainer.requestMethod || 'GET';
        service.setRequestMethod(requestMethod);
        return JSON.stringify(requestDataContainer.data)
    },

    parseResponse: function (service, response) {
        var responseObject = {};
        if (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 204) {
            responseObject = JSON.parse(response.text);
        } else {
            // throw new Error('PAYU Service Errored with Status Code: ' + service.statusCode);
            return {
                error: true,
                message: 'Something went wrong'
            }
        }
        return responseObject;
    },
    filterLogMessage: function (msg) {
        return "";
    },
    getRequestLogMessage: function (request) {
        return "";
    },
    getResponseLogMessage: function (response) {
        return "";
    },

}

module.exports = dwsvc.LocalServiceRegistry.createService(SERVICE_ID, serviceConfig);
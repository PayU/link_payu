'use strict';

var server = require('server');
server.extend(module.superModule);
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var Transaction = require('dw/system/Transaction');
var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

server.append('Begin', function (req, res, next) {
    var viewData = res.getViewData();
    var errorMsg = null
    if (undefined !== req.querystring.placeerror && req.querystring.placeerror) {
        errorMsg = req.querystring.placeerror;
    }
    // Get rid of this from top-level ... should be part of OrderModel???
    var currentYear = new Date().getFullYear();
    var creditCardExpirationYears = [];

    for (var j = 0; j < 15; j++) {
        creditCardExpirationYears.push(currentYear + j);
    }
    var isInstallmentsEnabled = PayUFactory.CONFIGS.INSTALLMENTS_ENABLED;
    var countryCode = PayUFactory.CONFIGS.COUNTRY;
    var installments = [];
    if (isInstallmentsEnabled) {
        installments = PayUFactory.CONFIGS.INSTALLMENTS;
        viewData.allowedInstallmentZero = COHelpers.allowedInstallmentZero()
    }
    var isSpportedDocumentNumber = payuHelpers.supportedDocumentNumber();
    var documentTypes = payuHelpers.getDocumentTypes();
    viewData.expirationYears = creditCardExpirationYears;
    viewData.payUInstallments = installments;
    viewData.isInstallmentsEnabled = isInstallmentsEnabled;
    viewData.deviceSessionId = COHelpers.generateDeviceFingerPrint()
    viewData.supportedDocumentTypes = documentTypes;
    viewData.isSpportedDocumentNumber = isSpportedDocumentNumber;
    next();
});


module.exports = server.exports();

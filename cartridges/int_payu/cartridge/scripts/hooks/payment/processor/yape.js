
'use strict';

var collections = require('*/cartridge/scripts/util/collections');

var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentStatusCodes = require('dw/order/PaymentStatusCodes');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var PaymentService = require('*/cartridge/scripts/services/PaymentService');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} currentBasket Current users's currentBasket
 * @param {Object} paymentInformation - the payment information
 * @param {string} paymentMethodID - paymentmethodID
 * @param {Object} req the request object
 * @return {Object} returns an error object
 */
function Handle(currentBasket, paymentInformation, paymentMethodID, req) {
    var fieldErrors = {};
    var serverErrors = [];

    Transaction.wrap(function() {
        var paymentInstruments = currentBasket.getPaymentInstruments();
        
        // Removed other payment Instruments
        collections.forEach(paymentInstruments, function (pi) {
            currentBasket.removePaymentInstrument(pi);
        });
        
        var paymentInstrument = currentBasket.createPaymentInstrument('YAPE', currentBasket.totalGrossPrice);
    })

    return { fieldErrors: fieldErrors, serverErrors: serverErrors, error: false };
}

exports.Handle = Handle;
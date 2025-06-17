
'use strict';

var collections = require('*/cartridge/scripts/util/collections');

var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentStatusCodes = require('dw/order/PaymentStatusCodes');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

var PAYU_FACTORY = require('*/cartridge/scripts/utils/PayuFactory');
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
        collections.forEach(paymentInstruments, function (pi) {
            currentBasket.removePaymentInstrument(pi);
        });
        
        // var paymentInstrument = currentBasket.createPaymentInstrument('BANK_REFERENCED', currentBasket.totalGrossPrice);

        var paymentInstrument = currentBasket.createPaymentInstrument(PAYU_FACTORY.PAYMENT_METHODS.BANK_REFERENCED, currentBasket.totalGrossPrice);
    })

    return { fieldErrors: fieldErrors, serverErrors: serverErrors, error: false };
}

/**
 * Authorizes a payment using a credit card. Customizations may use other processors and custom
 *      logic to authorize credit card payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var error = false;
    var orderID = orderNumber;
    var pI = paymentInstrument;
    var pp = paymentProcessor;

    // var authorizationResponse = 
    try {
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setTransactionID(orderNumber);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        });
    } catch (e) {
        error = true;
        serverErrors.push(
            Resource.msg('error.technical', 'checkout', null)
        );
    }

    return { fieldErrors: fieldErrors, serverErrors: serverErrors, error: error };
}

exports.Handle = Handle;
exports.Authorize = Authorize;

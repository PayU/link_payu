'use strict';

var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var Logger = require('dw/system/Logger');
var Transaction = require('dw/system/Transaction');

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - The request object
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */

function processForm(req, paymentForm, viewData) {
    var array = require('*/cartridge/scripts/util/array');

    // var viewData = viewFormData;
    var creditCardErrors = {};
    var yapeErrors;

    if (viewData && viewData.paymentMethod && viewData.paymentMethod.value === 'YAPE') {
        yapeErrors = COHelpers.validateYapeForm(paymentForm);
        
        if (Object.keys(yapeErrors).length && Object.values(yapeErrors).some(value => value !== undefined && value !== null)) {
            return {
                fieldErrors: yapeErrors,
                error: true
            };
        }

        // Check for field Specific Errors

        var yapeFieldErrors = COHelpers.validateYapeFields(paymentForm);

        if (Object.keys(yapeFieldErrors).length && Object.values(yapeFieldErrors).some(value => value !== undefined && value !== null)) {
            return {
                fieldErrors: yapeFieldErrors,
                error: true
            };
        }

        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };

        viewData.paymentInformation = {
            yapePhoneNumber: {
                value: paymentForm.yapeFields.yapePhoneNumber.value,
                htmlName: paymentForm.yapeFields.yapePhoneNumber.htmlName
            },
            yapeCode: {
                value: paymentForm.yapeFields.yapeCode.value,
                htmlName: paymentForm.yapeFields.yapeCode.htmlName
            }
        }
    }

    return {
        error: false,
        viewData: viewData
    };
}

/**
 * Save the credit card information to login account if save card option is selected
 * @param {Object} req - The request object
 * @param {dw.order.Basket} basket - The current basket
 * @param {Object} billingData - payment information
 */

function savePaymentInformation(req, basket, billingData) {
    try {
        var PaymentMgr = require('dw/order/PaymentMgr');
        var billingAddress = basket.billingAddress;

        var paymentInstrument = basket.paymentInstrument;
        Transaction.wrap(function() {
            var paymentProcessor = PaymentMgr.getPaymentMethod(
                paymentInstrument.paymentMethod
            ).paymentProcessor;
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);

            paymentInstrument.custom.yapeCode = billingData.paymentInformation.yapeCode.value;
            paymentInstrument.custom.yapePhoneNumber = billingData.paymentInformation.yapePhoneNumber.value;
            billingAddress.custom.documentType = billingData.paymentInformation.documentType.value;
            billingAddress.custom.documentNumber = billingData.paymentInformation.documentNumber.value;
        });
    } catch (e) {
        Logger.error('Error: Yape : savePaymentInformation:  {0}', JSON.stringify(e));
    }
}
exports.processForm = processForm;
exports.savePaymentInformation = savePaymentInformation;
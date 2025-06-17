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
function processForm(req, paymentForm, viewFormData) {
    var array = require('*/cartridge/scripts/util/array');

    var viewData = viewFormData;
    var creditCardErrors = {};
    var payUCashErrors;

    if (viewData && viewData.paymentMethod && viewData.paymentMethod.value === 'EFECTY') {
        payUCashErrors = COHelpers.validateCashForm(paymentForm);

        // Validate Document Fields 
        payUCashErrors = COHelpers.validateDocumentFields(paymentForm, payUCashErrors, 'payUCashFields');
        if (Object.keys(payUCashErrors).length && Object.values(payUCashErrors).some(value => value !== undefined && value !== null)) {
            return {
                fieldErrors: payUCashErrors,
                error: true
            };
        }
        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };

        viewData.paymentInformation = {
            documentType: {
                value: paymentForm.creditCardFields.documentType.value,
                htmlName: paymentForm.creditCardFields.documentType.htmlName
            },
            documentNumber: {
                value: paymentForm.creditCardFields.documentNumber.value,
                htmlName: paymentForm.creditCardFields.documentNumber.htmlName
            }
        };
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
    var CustomerMgr = require('dw/customer/CustomerMgr');

    if (!billingData.storedPaymentUUID
        && req.currentCustomer.raw.authenticated
        && req.currentCustomer.raw.registered
    ) {
        var customer = CustomerMgr.getCustomerByCustomerNumber(
            req.currentCustomer.profile.customerNo
        );
        var payuCustomerId = customer.profile.custom.payUCustomerId;
        // var payuCustomerId = null;
        var isValidCustomer = false
        if (payuCustomerId) {
            // Validates Customer
            var retrieveCustomerResponse = payuHelpers.retrieveCustomer(payuCustomerId);

            if (retrieveCustomerResponse && retrieveCustomerResponse.customer_reference === customer.profile.customerNo) {
                isValidCustomer =  true;
            }
        }

        
        if (!payuCustomerId || !isValidCustomer) {
            var createCustomer = payuHelpers.createCustomer(req.currentCustomer);
            if (!createCustomer || createCustomer.error) {
                Logger.error('PAYU: Failed to create customer: {0}', JSON.stringify(createCustomer));
            } else {
                payuCustomerId = createCustomer.id;
                if (payuCustomerId) {
                    Transaction.wrap(function() {
                        customer.profile.custom.payUCustomerId = payuCustomerId;
                    })
                }
                isValidCustomer = true;

            }
        }
    }

    // Updating the document fields

    var billingAddress = basket.billingAddress;

    Transaction.wrap(function() {
        billingAddress.custom.documentType = billingData.paymentInformation.documentType.value;
        billingAddress.custom.documentNumber = billingData.paymentInformation.documentNumber.value;
    });
}

exports.processForm = processForm;
exports.savePaymentInformation = savePaymentInformation;

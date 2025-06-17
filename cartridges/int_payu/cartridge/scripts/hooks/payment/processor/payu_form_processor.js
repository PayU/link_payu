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
    var payUCashErrors = {};

    if (viewData && viewData.paymentMethod && (viewData.paymentMethod.value === 'PAY_U' || viewData.paymentMethod.value === 'CREDIT_CARD')) {
        var reqForm = req.form.storedPaymentUUID;
        if (!req.form.storedPaymentUUID) {
            // verify credit card form data
            creditCardErrors = COHelpers.validateCreditCard(paymentForm);
            creditCardErrors = COHelpers.validateDocumentFields(paymentForm, creditCardErrors, 'creditCardFields');
        }
    
        if (Object.keys(creditCardErrors).length) {
            return {
                fieldErrors: creditCardErrors,
                error: true
            };
        }
    
        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };
    
        viewData.paymentInformation = {
            cardType: {
                value: paymentForm.creditCardFields.cardType.value,
                htmlName: paymentForm.creditCardFields.cardType.htmlName
            },
            cardNumber: {
                value: paymentForm.creditCardFields.cardNumber.value,
                htmlName: paymentForm.creditCardFields.cardNumber.htmlName
            },
            securityCode: {
                value: paymentForm.creditCardFields.securityCode.value,
                htmlName: paymentForm.creditCardFields.securityCode.htmlName
            },
            expirationMonth: {
                value: parseInt(
                    paymentForm.creditCardFields.expirationMonth.selectedOption,
                    10
                ),
                htmlName: paymentForm.creditCardFields.expirationMonth.htmlName
            },
            expirationYear: {
                value: parseInt(paymentForm.creditCardFields.expirationYear.value, 10),
                htmlName: paymentForm.creditCardFields.expirationYear.htmlName
            },
            documentType: {
                value: paymentForm.creditCardFields.documentType.value,
                htmlName: paymentForm.creditCardFields.documentType.htmlName
            },
            documentNumber: {
                value: paymentForm.creditCardFields.documentNumber.value,
                htmlName: paymentForm.creditCardFields.documentNumber.htmlName
            },
            installments: {
                value: paymentForm.creditCardFields.installments.value,
                htmlName: paymentForm.creditCardFields.installments.htmlName
            }
        };
    
        if (req.form.storedPaymentUUID) {
            viewData.storedPaymentUUID = req.form.storedPaymentUUID;
        }
    
        viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;
    
        // process payment information
        if (viewData.storedPaymentUUID
            && req.currentCustomer.raw.authenticated
            && req.currentCustomer.raw.registered
        ) {
            var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
            var paymentInstrument = array.find(paymentInstruments, function (item) {
                return viewData.storedPaymentUUID === item.UUID;
            });
    
            viewData.paymentInformation.cardNumber.value = paymentInstrument.creditCardNumber;
            viewData.paymentInformation.cardType.value = paymentInstrument.creditCardType;
            viewData.paymentInformation.securityCode.value = req.form.securityCode;
            viewData.paymentInformation.expirationMonth.value = paymentInstrument.creditCardExpirationMonth;
            viewData.paymentInformation.expirationYear.value = paymentInstrument.creditCardExpirationYear;
            viewData.paymentInformation.creditCardToken = paymentInstrument.raw.creditCardToken;
        }
    } else if (viewData && viewData.paymentMethod && viewData.paymentMethod.value === 'PAY_U_CASH'){
        
        payUCashErrors = COHelpers.validateCashForm(paymentForm);
        if (Object.keys(creditCardErrors).length) {
            return {
                fieldErrors: creditCardErrors,
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
    var PaymentMgr = require('dw/order/PaymentMgr');

    if (!billingData.storedPaymentUUID
        && req.currentCustomer.raw.authenticated
        && req.currentCustomer.raw.registered
        && billingData.saveCard
        && (billingData.paymentMethod.value === 'CREDIT_CARD')
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
        var cardToken = basket.paymentInstrument.creditCardToken;
        var createPaymentMethodResponse = payuHelpers.createPaymentMethod(payuCustomerId, cardToken);
        // update the customerID
        
        billingData.paymentInformation.creditCardToken = createPaymentMethodResponse.token;
        var saveCardResult = COHelpers.savePaymentInstrumentToWallet(
            billingData,
            basket,
            customer
        );

        req.currentCustomer.wallet.paymentInstruments.push({
            creditCardHolder: saveCardResult.creditCardHolder,
            maskedCreditCardNumber: saveCardResult.maskedCreditCardNumber,
            creditCardType: saveCardResult.creditCardType,
            creditCardExpirationMonth: saveCardResult.creditCardExpirationMonth,
            creditCardExpirationYear: saveCardResult.creditCardExpirationYear,
            UUID: saveCardResult.UUID,
            creditCardNumber: saveCardResult.maskedCreditCardNumber,
            creditCardNumber: Object.hasOwnProperty.call(
                saveCardResult,
                'creditCardNumber'
            )
                ? saveCardResult.creditCardNumber
                : null,
            raw: saveCardResult
        });
    }

    var billingAddress = basket.billingAddress;

    Transaction.wrap(function() {

        var paymentInstrument = basket.paymentInstrument;
        var paymentProcessor = PaymentMgr.getPaymentMethod(
            paymentInstrument.paymentMethod
        ).paymentProcessor;
        paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);

        billingAddress.custom.documentType = billingData.paymentInformation.documentType.value;
        billingAddress.custom.documentNumber = billingData.paymentInformation.documentNumber.value;
    });
}

exports.processForm = processForm;
exports.savePaymentInformation = savePaymentInformation;

'use strict';

var base = module.superModule;

var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var OrderMgr = require('dw/order/OrderMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var Order = require('dw/order/Order');
var Status = require('dw/system/Status');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var PaymentService = require('*/cartridge/scripts/services/PaymentService');
var Logger = require('dw/system/Logger');
var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var AddressModel = require('*/cartridge/models/address');
var formErrors = require('*/cartridge/scripts/formErrors');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
var PAYU_FACTORY = require('*/cartridge/scripts/utils/PayuFactory');
/**
 * this method returns authorizationResult
 * @param {dw.order.PaymentProcessor} paymentProcessor - the paymentProcessor of the current payment
 * @param {string} orderNumber - The order number for the order
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to handle payment authorization
 * @returns {Object} returns a result object after the service call
 */
function getAuthResult(paymentProcessor, orderNumber, paymentInstrument) {
    var HookMgr = require('dw/system/HookMgr');
    var authorizationResult;
    if (
        HookMgr.hasHook(
            'app.payment.processor.' + paymentProcessor.ID.toLowerCase()
        )
    ) {
        authorizationResult = HookMgr.callHook(
            'app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
            'Authorize',
            orderNumber,
            paymentInstrument,
            paymentProcessor
        );
    } else {
        authorizationResult = HookMgr.callHook(
            'app.payment.processor.default',
            'Authorize'
        );
    }
    return authorizationResult;
}


/**
 * Builds a formatted order note object from a payment response.
 *
 * @param {Object} paymentResponse - The payment response from the provider.
 * @param {string} type - The type of the transaction (e.g., "Authorized", "Captured", etc").
 * @returns {{ title: string, message: string }} An object containing the order note title and message.
 */
function getPaymentTransactionOrderNotes (paymentResponse, type) {
    var transactionId = paymentResponse.provider_data.transaction_id || '';
    var amount = paymentResponse.amount;
    var eventDate = paymentResponse.created;
    var status = paymentResponse.result.status;
    var description = paymentResponse.provider_data.description;
    var orderNote =  'date: ' + eventDate + ' | trx_id: ' + transactionId + ' | trx_type: ' + type + ' | amount: ' + (amount ? amount : 'N/A') + ' | status: ' + status +  ' | description: ' + description;
    return {
        title: 'PAYMENT RESPONSE',
        message: orderNote
    }
}

/**
 * Saves payment information in the order's payment instrument.
 *
 * @param {Object} paymentResponse - The response object received from PayU API after processing payment.
 * @param {dw.order.Order} order - The order object containing the payment instrument to update.
 * @returns {boolean} Returns true after successfully updating the payment information.
 */
function savePaymentInformationInOrder(paymentResponse, order, type) {
    var paymentInstrument = order.paymentInstrument;
    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;

    Transaction.wrap(function () {
        // Erase security code from transaction for security reasons
        paymentInstrument.custom.payUCardSecurityCode = '';

        // Assign payment processor and transaction details
        paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentInstrument.paymentTransaction.setTransactionID(order.orderNo);
        paymentInstrument.custom.payUAuthorizationId = paymentResponse.id;

        // Set reconciliation ID only if it is not already present
        if (!paymentInstrument.custom.payUReconciliationId ||paymentInstrument.custom.payUReconciliationId === '') {
            paymentInstrument.custom.payUReconciliationId = paymentResponse.reconciliation_id;
        }

        // Store raw response in the order custom attribute
        order.custom.payURawResponse = JSON.stringify(paymentResponse);

        if (paymentResponse.provider_data) {
            var response  = JSON.parse(paymentResponse.provider_data.raw_response);

            if (paymentResponse.provider_data.raw_response) {
                var providerRawResponse = JSON.parse(paymentResponse.provider_data.raw_response);

                // Store provider operation details
                paymentInstrument.custom.payUProviderOperationDate = providerRawResponse.operationDate || '';
                
                paymentInstrument.custom.payUProviderAuthorizationCode = providerRawResponse.authorizationCode || '';
                
                paymentInstrument.custom.payUProviderNetworkResponseCode = providerRawResponse.paymentNetworkResponseCode || '';

                // Store network response message
                if (providerRawResponse && providerRawResponse.paymentNetworkResponseErrorMessage) {
                    paymentInstrument.custom.payUProviderNetworkResponseMessage = providerRawResponse.paymentNetworkResponseErrorMessage;
                } else if ( providerRawResponse.additionalInfo && providerRawResponse.additionalInfo.responseNetworkMessage) {
                    paymentInstrument.custom.payUProviderNetworkResponseMessage = providerRawResponse.additionalInfo.responseNetworkMessage;
                } else {
                    paymentInstrument.custom.payUProviderNetworkResponseMessage = '';
                }
            }
            // Assign provider-specific response data to the payment instrument
            paymentInstrument.custom.payUProviderName = paymentResponse.provider_data.provider_name || '';

            paymentInstrument.custom.payUProviderResponseCode = paymentResponse.provider_data.response_code || '';

            paymentInstrument.custom.payUProviderDescription = paymentResponse.provider_data.description || '';

            paymentInstrument.custom.payUOrderId = paymentResponse.provider_data.external_id || '';

            paymentInstrument.custom.payUProviderTransactionId = paymentResponse.provider_data.transaction_id || '';
            
            paymentInstrument.custom.payUProviderTransactionId = paymentResponse.provider_data.transaction_id;

            // [Updates Card Vendor]
            if (paymentResponse && paymentResponse.payment_method && paymentResponse.payment_method.vendor) {
                paymentInstrument.custom.payUCardVendor = paymentResponse.payment_method.vendor;
            }
        }

        var PAYMENT_STATUS = PayUFactory.PAYMENT_STATUS;
        if (type === 'Captured') {
            order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
            order.custom.pay_u_payment_status = PayUFactory.PAYMENT_STATUS.CAPTURED;
        } else if (type === 'Authorized') {
            order.custom.pay_u_payment_status = PayUFactory.PAYMENT_STATUS.AUTHORIZED;
        }

        // [added order note]
        var orderNote = getPaymentTransactionOrderNotes(paymentResponse, type);
        order.addNote(orderNote.title, orderNote.message);
    });

    return true;
}

function updateTimeOutPaymentInformation(order, type) {
    Transaction.wrap(function() {
        order.custom.pay_u_payment_status = PayUFactory.PAYMENT_STATUS.TIMEOUT
        var paymentInstrument = order.paymentInstrument;
        paymentInstrument.custom.payUCardSecurityCode = '';
        order.addNote('PAYU SERVER TIMEOUT', type + ' request timed out — no response from PayU.')
    });
}

function updateRequiredInformationOnError(order) {
    Transaction.wrap(function() {
        var paymentInstrument = order.paymentInstrument;
        paymentInstrument.custom.payUCardSecurityCode = '';
    });
}

/**
 * handles the payment authorization for each payment instrument
 * @param {dw.order.Order} order - the order object
 * @param {string} orderNumber - The order number for the order
 * @returns {Object} an error object
 */
function handlePayments(order, orderNumber) {
    var logger = Logger.getLogger('payu');
    var result = {};
    if (order.totalNetPrice !== 0.0) {
        var paymentInstruments = order.paymentInstruments;

        if (paymentInstruments.length === 0) {
            Transaction.wrap(function () {
                OrderMgr.failOrder(order, true);
            });
            result.error = true;
        }

        try {
            if (!result.error) {
                for (var i = 0; i < paymentInstruments.length; i++) {
                    var paymentInstrument = paymentInstruments[i];
                    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;
                    var authorizationResult;
                    if (paymentProcessor === null) {
                        Transaction.begin();
                        paymentInstrument.paymentTransaction.setTransactionID(orderNumber);
                        Transaction.commit();
                    } else {
                        var token = paymentInstruments[0].creditCardToken;
                        // Confirm If payment Already created.

                        var existingCreatedPaymentId =
                            order.paymentInstrument.custom.payUPaymentId;

                        var createPaymentResult;
                        if (!existingCreatedPaymentId || existingCreatedPaymentId === '') {
                            createPaymentResult = payuHelpers.createPayment(order);

                            // error handling for create payment.
                            if (
                                !createPaymentResult ||
                                (createPaymentResult && createPaymentResult.error)
                            ) {
                                Logger.error('Payment Creation failed: ' + JSON.stringify(createPaymentResult));
                                Transaction.wrap(function () {
                                    OrderMgr.failOrder(order, true);
                                });
                                result.error = true;
                                break;
                            } else {
                                Transaction.wrap(function () {
                                    var paymentID = createPaymentResult.id;
                                    order.custom.payUPaymentId = paymentID;
                                    order.custom.pay_u_payment_status = 'Initialized';
                                    order.paymentInstrument.custom.payUPaymentId = paymentID;
                                });
                            }
                        }

                        if (existingCreatedPaymentId) {
                            var paymentDetails = payuHelpers.retrievePayment(
                                existingCreatedPaymentId
                            );
                        }

                        var paymentId = createPaymentResult.id;

                        var paymentInfoObj = {};
                        // Step 2: Authorize Payment

                        var authorizeResult = {};
                        var encounterTimeOutError = false;
                        if (paymentProcessor.ID === 'PAY_U') {
                         
                            var paymentFlow = PayUFactory.CONFIGS.PAYMENT_FLOW.value;

                            if (paymentFlow === '1') {
                                var chargeResult = {};
                                if (HookMgr.hasHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase())) {
                                    chargeResult = HookMgr.callHook(
                                        'app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
                                        'Charge',
                                        orderNumber,
                                        paymentInstrument,
                                        paymentProcessor,
                                        order
                                    );
                                    if (!chargeResult || (chargeResult && chargeResult.error)) {

                                        if (chargeResult.timeout) {
                                            encounterTimeOutError = true;
                                            updateTimeOutPaymentInformation(order, 'Charge')
                                            result.success = true;
                                            break;
                                        } else {
                                            var paymentId = order.custom.payUPaymentId;
                                            session.privacy.payUPaymentId = paymentId;
                                            Logger.error('Payment Charge failed: ' + JSON.stringify(chargeResult));
                                            Transaction.wrap(function () {
                                                OrderMgr.failOrder(order, true);
                                            });
                                            result.error = true;
                                            break;
                                        }
                                    } else {
                                        result = chargeResult;
                                        savePaymentInformationInOrder(chargeResult, order, 'Captured');
                                    }

                                    if (threeDSSettings === 'ENABLED' || threeDSSettings === 'INTERNAL') {
                                        var threeDSResult = chargeResult.three_d_secure_result;
                                        if (threeDSResult) {
                                            if (threeDSResult.result.status === 'Cancelled') {
                                                updateOrderStatusToFailed(order);
                                                result.error = true;
                                                break;
                                            }
                                        }
                                        result.success = true;
                                    }
                                }
                            } else if (paymentFlow === '2') {
                                if (HookMgr.hasHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase())) {
                                    authorizeResult = HookMgr.callHook(
                                        'app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
                                        'Authorize',
                                        orderNumber,
                                        paymentInstrument,
                                        paymentProcessor,
                                        order
                                    );
                                } else {
                                    authorizeResult = HookMgr.callHook(
                                        'app.payment.processor.default',
                                        'Authorize'
                                    );
                                }
    
                                // error handling for authorization.
                                if (!authorizeResult || (authorizeResult && authorizeResult.error)) {

                                    if (authorizeResult.timeout) {
                                        encounterTimeOutError = true;
                                        updateTimeOutPaymentInformation(order, 'Authorization')
                                        result.success = true;
                                        break;
                                    } else {
                                        var paymentId = order.custom.payUPaymentId;
                                        session.privacy.payUPaymentId = paymentId;
                                        Logger.error('Payment authorization failed: ' + JSON.stringify(authorizeResult));
                                        Transaction.wrap(function () {
                                            var paymentInstrument = order.paymentInstrument;
                                            paymentInstrument.custom.payUCardSecurityCode = '';
                                            OrderMgr.failOrder(order, true);
                                        });
                                        result.error = true;
                                        break;
                                    }
                                } else {
                                    result = authorizeResult;
                                    savePaymentInformationInOrder(authorizeResult, order, 'Authorized');
                                }
    
                                var threeDSSettings = PayUFactory.CONFIGS.THREE_D_S_CONFIG.value
    
                                if (threeDSSettings === 'ENABLED') {
                                    var threeDSResult = authorizeResult.three_d_secure_result;
                                    if (threeDSResult) {
                                        if (threeDSResult.result.status === 'Cancelled') {
                                            updateOrderStatusToFailed(order);
                                            result.error = true;
                                            break;
                                        }
                                    }
                                    result.success = true;
                                } else if (threeDSSettings === 'INTERNAL' && authorizeResult.three_d_secure_result && authorizeResult.three_d_secure_result.result.status === 'Pending' && authorizeResult.redirection) {
                                   break;
                                } else if (result.result.status !== 'Pending' 
                                    && (threeDSSettings === 'DISABLED' 
                                        || (threeDSSettings === 'INTERNAL' 
                                            && authorizeResult.three_d_secure_result.result.status === 'Cancelled'
                                        )
                                    )) {
                                    var isImmediateCaptureEnabled = PayUFactory.CONFIGS.ENABLE_IMMEDIATE_CAPTURE
                                    if (isImmediateCaptureEnabled) {
                                        // Step 3: Capture Payment (If Needed)
                                        var captureResult = payuHelpers.capturePayment(paymentId);
                                        // var captureResult = null;
        
                                        // error handling for capture payment.
                                        if (!captureResult || (captureResult && captureResult.error)) {
                                            Logger.error('Payment capture failed: ' + JSON.stringify(captureResult));
                                            updateOrderStatusToFailed(order);
                                            result.error = true;
                                            break;
                                        } else {
                                            savePaymentInformationInOrder(captureResult, order, 'Captured');
                                        }
                                    }
                                }
                            }
                        }  else if (payuHelpers.isCashPaymentMethod(paymentProcessor.ID)) {
                            var idempotencyKey;

                            if (session.privacy.payUCashIdempotencyKey) {
                                idempotencyKey = session.privacy.payUCashIdempotencyKey;
                            } else {
                                idempotencyKey = getIdempotencyKey(order);
                                if (idempotencyKey) {
                                    session.privacy.payUCashIdempotencyKey = idempotencyKey;
                                }
                            }
                            var chargeResponse = payuHelpers.charge(
                                order,
                                paymentProcessor.ID,
                                idempotencyKey
                            );                            


                            if (!chargeResponse || (chargeResponse && chargeResponse.error)) {
                                
                                Logger.error('Payment charge failed: ' + JSON.stringify(chargeResponse));

                                Transaction.wrap(function () {
                                    OrderMgr.failOrder(order, true);
                                });
                                result.error = true;
                                break;
                            } else {
                                updatePayUCashInformation(order, chargeResponse, paymentProcessor);
                                session.privacy.payUCashIdempotencyKey = null;
                            }
                        } else if (paymentProcessor.ID === 'YAPE') {
                            var idempotencyKey = getIdempotencyKey(order);
                            var chargeResponse = payuHelpers.charge(
                                order,
                                'YAPE',
                                idempotencyKey
                            );

                            if (!chargeResponse || (chargeResponse && chargeResponse.error)) {
                                
                                Logger.error('Payment capture failed: ' + JSON.stringify(chargeResponse));

                                Transaction.wrap(function () {
                                    OrderMgr.failOrder(order, true);
                                });
                                result.error = true;
                                break;
                            } else if (chargeResponse && chargeResponse.result && chargeResponse.result.status === 'Failed') {
                                // Transaction.wrap(function () {
                                //     OrderMgr.failOrder(order, true);
                                // });
                                updateOrderStatusToFailed(order);
                                result.error = true;
                                break;
                            } else {
                                updateYapePaymentInformation(order, chargeResponse);
                            }
                        }
                        result.success = true;
                    }
                }
            }
        } catch (e) {
            var err = e;
            logger.error('handlePayments(): Error: {0}', e.toString());
            updateOrderStatusToFailed(order);
            result.error = true;
        }
    }
    return result;
}



function getIdempotencyKey(order) {
    var uniqueKey = Math.random().toString(36).substr(2);
    var orderId = order.orderNo;
    return 'Order_' + orderId + '_' + uniqueKey;
}

function updatePayUCashInformation(order, chargeResponse, paymentProcessor) {
    var response = JSON.parse(chargeResponse.provider_data.raw_response);
    
    Transaction.wrap(function () {
        var paymentInstrument = order.paymentInstrument;
        var paymentTransaction = paymentInstrument.getPaymentTransaction();
        order.custom.payURawResponse = JSON.stringify(chargeResponse);
        
        order.custom.payUCashPaymentCode = chargeResponse.provider_data && chargeResponse.provider_data.additional_information ? chargeResponse.provider_data.additional_information.barcode : '';
        
        paymentInstrument.custom.payUCIP = chargeResponse.provider_data && chargeResponse.provider_data.additional_information ? chargeResponse.provider_data.additional_information.barcode : '';
        
        order.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
        
        paymentInstrument.custom.payUOrderId = response.orderId;
        
        paymentInstrument.custom.payUProviderAuthorizationCode = response.authorizationCode || '';

        paymentInstrument.custom.payUProviderNetworkResponseCode = response.paymentNetworkResponseCode || '';

        paymentInstrument.custom.payUProviderOperationDate = response.operationDate || ''

        paymentInstrument.custom.payUProviderDescription = (chargeResponse.provider_data && chargeResponse.provider_data.description) ? chargeResponse.provider_data.description : '';

        paymentInstrument.custom.payUProviderResponseCode = (chargeResponse.provider_data && chargeResponse.provider_data.response_code) ? chargeResponse.provider_data.response_code : '';

        paymentInstrument.custom.payUProviderName = (chargeResponse.provider_data && chargeResponse.provider_data.provider_name) ? chargeResponse.provider_data.provider_name : '';

        paymentInstrument.custom.payUReconciliationId = chargeResponse.reconciliation_id ? chargeResponse.reconciliation_id : '';
        
        paymentInstrument.custom.payUProviderTransactionId = response.transactionId || '';

        paymentInstrument.custom.payUCashReceiptPdfUrl = response.URL_PAYMENT_RECEIPT_PDF || '';
        
        paymentInstrument.custom.payUCashReceiptHtmlUrl = response.URL_PAYMENT_RECEIPT_HTML || '';
        
        paymentInstrument.custom.payUCashExpiration = response.EXPIRATION_DATE || '';
        
        paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        
        paymentInstrument.paymentTransaction.setTransactionID(order.orderNo);

        var PAYMENT_STATUS = PayUFactory.PAYMENT_STATUS;

        var chargePaymentResponse = chargeResponse.result.status;

        if (chargePaymentResponse === PAYMENT_STATUS.PENDING) {
            order.custom.pay_u_payment_status = PAYMENT_STATUS.PENDING;
        } else {
            order.custom.pay_u_payment_status = chargePaymentResponse;
        }
    });
}

/**
 * saves payment instruemnt to customers wallet
 * @param {Object} billingData - billing information entered by the user
 * @param {dw.order.Basket} currentBasket - The current basket
 * @param {dw.customer.Customer} customer - The current customer
 * @returns {dw.customer.CustomerPaymentInstrument} newly stored payment Instrument
 */
function savePaymentInstrumentToWallet(billingData, currentBasket, customer) {
    var wallet = customer.getProfile().getWallet();

    return Transaction.wrap(function () {
        var storedPaymentInstrument = wallet.createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD);

        storedPaymentInstrument.setCreditCardHolder(currentBasket.billingAddress.fullName);

        storedPaymentInstrument.setCreditCardNumber(billingData.paymentInformation.cardNumber.value);

        storedPaymentInstrument.setCreditCardType(billingData.paymentInformation.cardType.value);

        storedPaymentInstrument.setCreditCardExpirationMonth(billingData.paymentInformation.expirationMonth.value);
        
        storedPaymentInstrument.setCreditCardExpirationYear(billingData.paymentInformation.expirationYear.value);

        var processor = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD).getPaymentProcessor();
        
        var token = billingData.paymentInformation.creditCardToken;

        storedPaymentInstrument.setCreditCardToken(token);

        return storedPaymentInstrument;
    });
}

/**
 * Validate billing form
 * @param {Object} form - the form object with pre-validated form fields
 * @returns {Object} the names of the invalid form fields
 */
function validateFields(form) {
    var formErrors = require('*/cartridge/scripts/formErrors');
    return formErrors.getFormErrors(form);
}

/**
 * Validates the document number field based on the selected document type.
 * If the document type is 'DNI', the document number must be exactly 8 numeric digits.
 * If validation fails, an error message is added to the result object.
 *
 * @param {Object} form - The form object containing document fields.
 * @param {Object} result - An object to store validation errors.
 * @param {string} formName - The name of the form group containing document fields.
 * @returns {Object} The updated result object with validation errors (if any).
 */
function validateDocumentFields(form, result, formName) {

    // [Skip DNI Validations]
    // if (
    //     form[formName].documentType &&
    //     form[formName].documentType.htmlValue === 'DNI' &&
    //     form[formName].documentNumber &&
    //     !!form[formName].documentNumber.htmlValue
    // ) {
    //     var dniRegex = /^\d{8}$/;

    //     if (!dniRegex.test(form[formName].documentNumber.htmlValue)) {
    //         result[form[formName].documentNumber.htmlName] = Resource.msg('error.message.invalid.dni', 'forms', null);
    //     }
    // } else 
    if (
        form[formName].documentType &&
        form[formName].documentType.htmlValue === 'CPF' &&
        form[formName].documentNumber &&
        !!form[formName].documentNumber.htmlValue
    ) {
        const cpfPattern = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

        if (!cpfPattern.test(form[formName].documentNumber.htmlValue)) {
            result[form[formName].documentNumber.htmlName] = Resource.msg('error.message.invalid.cpf', 'forms', null);
        }
    }  else if (
        form[formName].documentType &&
        form[formName].documentType.htmlValue === 'CNPJ' &&
        form[formName].documentNumber &&
        !!form[formName].documentNumber.htmlValue
    ) {
        const cnpjPattern = /^\d{14}$/;;

        if (!cnpjPattern.test(form[formName].documentNumber.htmlValue)) {
            result[form[formName].documentNumber.htmlName] = Resource.msg('error.message.invalid.cnpj', 'forms', null);
        }
    }
    
    return result;
}

/**
 * Validate credit card form fields
 * @param {Object} form - the form object with pre-validated form fields
 * @returns {Object} the names of the invalid form fields
 */
function validateCreditCard(form) {
    var result = {};
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!form.paymentMethod.value) {
        if (currentBasket.totalGrossPrice.value > 0) {
            result[form.paymentMethod.htmlName] = Resource.msg(
                'error.no.selected.payment.method',
                'creditCard',
                null
            );
        }
        return result;
    }
    return validateFields(form);
}
/**
 * Generates an MD5 hash from a given string.
 *
 * @param {string} string - The input string to hash.
 * @returns {string} - The MD5 hashed value in hexadecimal format.
 */
function md5(string) {
    var Bytes = require('dw/util/Bytes');
    var Encoding = require('dw/crypto/Encoding');
    var MessageDigest = require('dw/crypto/WeakMessageDigest');
    var bytes = new Bytes(string);
    var alg = new MessageDigest('MD5');
    return Encoding.toHex(alg.digestBytes(bytes));
}

/**
 * Generates a unique device fingerprint using session ID and timestamp.
 *
 * @returns {string} - The generated device fingerprint.
 */
function generateDeviceFingerPrint() {
    var timestamp = new Date().getTime().toString();
    var encryptedId = md5(request.session.sessionID + timestamp);
    return encryptedId;
}

function validateCashForm(form) {
    var stringifyForm = JSON.stringify(form);
    return validateFields(form);
}

function validateYapeForm(form) {
    return validateFields(form);
}

function updateOrderInformation3ds(order, paymentInfo, authorizationIfo) {
    var logger = Logger.getLogger('payu');
    try {

        var paymentInstrument = order.paymentInstrument;
        var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;
        var authorizationProviderRawData = JSON.parse(authorizationIfo.provider_data.raw_response);

        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setPaymentProcessor( paymentProcessor);

            paymentInstrument.paymentTransaction.setTransactionID(order.orderNo);

            paymentInstrument.custom.payUAuthorizationId = authorizationIfo.id;
            
            paymentInstrument.custom.payUProviderTransactionId = authorizationProviderRawData.transaction_id;
            
            paymentInstrument.custom.payUReconciliationId = authorizationIfo.reconciliation_id;
            
            paymentInstrument.custom.payUProviderName = authorizationIfo.provider_data.provider_name;
            
            paymentInstrument.custom.payUProviderResponseCode = authorizationProviderRawData.responseCode;
            
            paymentInstrument.custom.payUProviderDescription = authorizationIfo.provider_data.description;
            
            paymentInstrument.custom.payUOrderId = authorizationProviderRawData.orderId;
            
            paymentInstrument.custom.payUProviderOperationDate = authorizationProviderRawData.operationDate;
            
            paymentInstrument.custom.payUProviderAuthorizationCode = authorizationProviderRawData.authorizationCode;
            
            paymentInstrument.custom.payUProviderNetworkResponseCode = authorizationProviderRawData.paymentNetworkResponseCode;

            if (authorizationProviderRawData && authorizationProviderRawData.paymentNetworkResponseErrorMessage) {
                paymentInstrument.custom.payUProviderNetworkResponseMessage = authorizationProviderRawData.paymentNetworkResponseErrorMessage;
            } else if (authorizationProviderRawData.additionalInfo && authorizationProviderRawData.additionalInfo.responseNetworkMessage) {
                paymentInstrument.custom.payUProviderNetworkResponseMessage = authorizationProviderRawData.additionalInfo.responseNetworkMessage;
            } else {
                paymentInstrument.custom.payUProviderNetworkResponseMessage = '';
            }

            order.custom.pay_u_payment_status = paymentInfo.status;
            order.custom.payURawResponse = JSON.stringify(authorizationIfo);
        });
    } catch (e) {
        logger.error('PAYU: updateOrderInformation3ds(): Error: {0}', e.toString());
    }
    return true;
}

function handle3dsRedirect(req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var URLUtils = require('dw/web/URLUtils');
    var query = req.querystring;
    var logger = Logger.getLogger('payu');
    var result = {
        error: false,
        message: '',
    };

    var status = query.status;

    if (!status || status === PAYU_FACTORY.STATUS.RESPONSE.FAILED) {
        // updateOrderStatusToFailed(order);
        res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'payment', 'placeerror', Resource.msg('error.message.technical.3ds', 'payu', null)));
        return next();
    }

    var authorizationId = query.authorization_id;
    var paymentId = query.payment_id;
    var chargeId = query.charge_id;

    var paymentInfo = payuHelpers.retrievePayment(paymentId);

    var authorizationResult = payuHelpers.retrieveAuthorization(authorizationId, paymentId);

    var orderId = paymentInfo.order.id;
    if (!orderId) {
        logger.error('handle3dsRedirect() Failed. Order Number is not available.');
        res.redirect(
            URLUtils.url(
                'Cart-Show',
                'placeerror',
                Resource.msg('error.message.technical.3ds', 'payu', null)
            )
        );
        return next();
    }

    var order = OrderMgr.getOrder(orderId);

    if (!order) {
        logger.error('handle3dsRedirect() Failed. Unable to complete 3D Secure authentication. Order not found.');
        res.redirect(URLUtils.url('Cart-Show', 'placeerror', Resource.msg('error.message.technical.3ds', 'payu', null)));
        return next();
    }


    if (authorizationId && (!authorizationResult || authorizationResult.error)) {
        // updateOrderStatusToFailed(order);
        res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'payment', 'placeerror', Resource.msg('error.message.technical.3ds', 'payu', null)));
        return next();
    }


    // var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    if (authorizationId && authorizationResult && !authorizationResult.error) {
        // var result3ds = authorizationResult.three_d_secure_result;

        // if (result3ds.result && result3ds.result.status === 'Succeed' && paymentInfo.status === 'Authorized') {
        if (
            authorizationResult.result.status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED 
            && (paymentInfo.status === PAYU_FACTORY.PAYMENT_STATUS.AUTHORIZED || paymentInfo.status === PAYU_FACTORY.PAYMENT_STATUS.CAPTURED)
        ) {
            
            var placeOrderResult = base.placeOrder(order, {});

            if (placeOrderResult.error) {
                res.redirect(URLUtils.url('Checkout-Begin', 'placeerror', Resource.msg('error.technical', 'checkout', null) ));
                return next();
            }

            res.render('/checkout/orderConfirmForm3ds', {
                error: false,
                orderID: order.orderNo,
                orderToken: order.orderToken,
                continueUrl: URLUtils.url('Order-Confirm').toString(),
            });
        } else {
            // updateOrderStatusToFailed(order);
            res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'payment', 'placeerror', Resource.msg('error.message.technical.3ds', 'payu', null)));
            return next();
        }

    } else if (chargeId) {

        // [One-Step Flow]
        if (paymentInfo.status === PAYU_FACTORY.PAYMENT_STATUS.CAPTURED
            && status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED
        ) {
            var placeOrderResult = base.placeOrder(order, {});
            if (placeOrderResult.error) {
                res.redirect(URLUtils.url('Checkout-Begin', 'placeerror', Resource.msg('error.technical', 'checkout', null) ));
                return next();
            }

            res.render('/checkout/orderConfirmForm3ds', {
                error: false,
                orderID: order.orderNo,
                orderToken: order.orderToken,
                continueUrl: URLUtils.url('Order-Confirm').toString(),
            });
        } else {
            res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'payment', 'placeerror', Resource.msg('error.message.technical.3ds', 'payu', null)));
            return next();
        }
    }
    return result;
}


function updateYapePaymentInformation(order, chargeResponse) {

    if (!order) return;
    // return true;

    var paymentInstruments = order.paymentInstruments;

    for (var i = 0; i < paymentInstruments.length; i++) {
        var paymentInstrument = paymentInstruments[i];
        var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;

        if (paymentProcessor.ID === 'YAPE') {

            Transaction.wrap(function () {
                order.custom.pay_u_payment_status = 'Captured';
                order.custom.payURawResponse = JSON.stringify(chargeResponse);
                paymentInstrument.custom.yapeCode = '';
                order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
            });
            break;
        }
    }

    return true;
}

function updateOrderStatusToFailed(order) {
    if (!order) return;

    var paymentInstruments = order.paymentInstruments;
    
    Transaction.wrap(function () {
        OrderMgr.failOrder(order, true);
    });

    for (var i = 0; i < paymentInstruments.length; i++) {
        var paymentInstrument = paymentInstruments[i];

        
        var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;

        if (paymentProcessor.ID === 'PAY_U') {
            Transaction.wrap(function() {
                paymentInstrument.custom.payUCardSecurityCode = '';
            });
            
            var paymentId = paymentInstrument.custom.payUPaymentId;

            if (!paymentId) {
                paymentId = order.custom.payUPaymentId;
            }

            var orderPaymentStatus = order.custom.pay_u_payment_status;

            // if (!orderPaymentStatus || orderPaymentStatus === "") {
            //     // retrieve the payment to check the current status
            //     var paymentInfo = payuHelpers.retrievePayment(paymentId);
            //     var voidPaymentResult
            //     // [Void the payment if status is Authorized]
            //     if (paymentInfo && paymentInfo.status === 'Authorized') {
            //         voidPaymentResult = payuHelpers.void(paymentId);
            //     }
            // } else if (orderPaymentStatus === 'Authorized') {
            //     voidPaymentResult = payuHelpers.void(paymentId);
            // }

            // if (voidPaymentResult && voidPaymentResult.result && voidPaymentResult.result.status === 'Succeed') {
            //     Transaction.wrap(function() {
            //         order.custom.pay_u_payment_status = 'Voided';
            //         order.custom.payURawResponse = JSON.stringify(voidPaymentResult);
            //     })
            // } else if (voidPaymentResult) {
            //     Transaction.wrap(function() {
            //         order.custom.payURawResponse = JSON.stringify(voidPaymentResult);
            //     })
            // }
        } else if (paymentProcessor.ID === 'YAPE') {
            Transaction.wrap(function() {
                paymentInstrument.custom.yapeCode = '';
            });
        }
    }   
}

function validateYapeFields(form) {
    var result = {};

    // Validations for Document Type & Number
    if (
        form['yapeFields'].documentType &&
        form['yapeFields'].documentType.htmlValue === 'DNI' &&
        form['yapeFields'].documentNumber &&
        !!form['yapeFields'].documentNumber.htmlValue
    ) {
        var dniRegex = /^\d{8}$/;

        if (!dniRegex.test(form['yapeFields'].documentNumber.htmlValue)) {
            result[form['yapeFields'].documentNumber.htmlName] = Resource.msg('error.message.invalid.dni', 'forms', null);
        }
    }

    // Validations for Phone & Authorization Code

    if (
        !!form['yapeFields'].yapePhoneNumber && form['yapeFields'].yapePhoneNumber.htmlValue
    ) {
        var yapePhoneRegex = /^\d+$/;
        
        if (!yapePhoneRegex.test(form['yapeFields'].yapePhoneNumber.htmlValue)) {
            result[form['yapeFields'].yapePhoneNumber.htmlName] = Resource.msg('error.message.invalid.yapePhone', 'forms', null);
        }
    }


    if (
        !!form['yapeFields'].yapeCode && form['yapeFields'].yapeCode.htmlValue
    ) {
        var yapePhoneRegex = /^\d+$/;
        
        if (!yapePhoneRegex.test(form['yapeFields'].yapeCode.htmlValue)) {
            result[form['yapeFields'].yapeCode.htmlName] = Resource.msg('error.message.invalid.yapeCode', 'forms', null);
        }
    }
    return result;
}


function allowedInstallmentZero () {
    var zeroInstallmentAllowedCountries = ['PER'];
    var country = PayUFactory.CONFIGS.COUNTRY;
    var isAllowed = zeroInstallmentAllowedCountries.includes(country)
    return isAllowed;
}

base.savePaymentInstrumentToWallet = savePaymentInstrumentToWallet;
base.handlePayments = handlePayments;
base.validateCashForm = validateCashForm;
base.validateCreditCard = validateCreditCard;
base.validateDocumentFields = validateDocumentFields;
base.validateYapeForm = validateYapeForm;
base.generateDeviceFingerPrint = generateDeviceFingerPrint;
base.handle3dsRedirect = handle3dsRedirect;
base.validateYapeFields = validateYapeFields;
base.allowedInstallmentZero = allowedInstallmentZero;
base.getPaymentTransactionOrderNotes = getPaymentTransactionOrderNotes;
base.savePaymentInformationInOrder = savePaymentInformationInOrder;
module.exports = base;

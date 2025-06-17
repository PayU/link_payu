'use strict'
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var Logger = require('dw/system/Logger');
var OrderMgr = require('dw/order/OrderMgr');
var PAYU_FACTORY = require('*/cartridge/scripts/utils/PayuFactory');
var Resource = require('dw/web/Resource');
var Money = require('dw/value/Money');
/**
 * Handles PayU capture notification webhook and updates the order/payment status accordingly.
 *
 * @param {string} event - Webhook event type (e.g., "capture.succeeded")
 * @param {Object} payload - Parsed JSON payload received from PayU
 * @param {dw.order.Order} order - The SFCC Order object to update
 * @returns {Object} Result object with error status and message
 */
function handleCaptureNotification(event, payload, order, paymentInfo) {
    var OrderMgr = require('dw/order/OrderMgr');

    try {
        if (!payload || !payload.data) {
            return {
                error: true,
                message: Resource.msg('message.request.data.invalid', 'payu', null)
            };
        }

        var response = payload.data;
        var status = response.result.status;
        var providerData = JSON.parse(response.provider_data.raw_response);
        // var providerConfiguration = response.provider_configuration;
        var paymentInstrument = order.paymentInstrument;

        // Common provider data updates
        updateOrderPaymentInstrumentRequiredAttributes(paymentInstrument, providerData);

        order.custom.payURawResponse = JSON.stringify(response);
        // order.custom.captureRawResponse = JSON.stringify(response)
        // Handle capture status
        switch (status) {
            case 'Succeed':
				if (paymentInfo.status === PAYU_FACTORY.PAYMENT_STATUS.CAPTURED) {
					order.custom.pay_u_payment_status = PAYU_FACTORY.PAYMENT_STATUS.CAPTURED;
					order.custom.payuCaptureStatus = payload.data.result.status;
					order.setPaymentStatus(order.PAYMENT_STATUS_PAID);
				} else {
					order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
				}
                break;

            case 'Failed':
                OrderMgr.failOrder(order, true);
                break;

            default:
                order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                break;
        }

        return {
            error: false,
            message: Resource.msg('message.capture.success', 'payu', null)
        };

    } catch (e) {
		var err = e;
        return {
            error: true,
            message: 'Exception in handleCaptureNotification: ' + e.toString()
        };
    }
}

function getOrderNoteForTransaction(response, type) {
    var status = response.data.result.status || '';
    var description = response.data.provider_data.description || '';
    var eventDate = response.data.created || '';
    var transactionId = response.data.provider_data.transaction_id || '';
    var amount = response.data.amount || '';
    return {
        title: 'PAYMENT RESPONSE - WEBHOOK',
        message: 'date: ' + eventDate + ' | trx_id: ' + transactionId + ' | event: ' + type + ' | amount: ' + (amount ? amount : 'N/A') + ' | status: ' + status +  ' | description: ' + description
    }
}

function updateWebhookNotificationOrderNote(type, response, order) {
    var orderNote = getOrderNoteForTransaction(response, type);
    order.addNote(orderNote.title, orderNote.message);
}

function isProviderResponseApproved(providerData) {
    var isApproved = providerData && providerData.response_code === PAYU_FACTORY.STATUS.PROVIDER_RESPONSE.APPROVED;
    return isApproved;
}
/**
 * Handles PayU charge notification webhook and updates the order/payment status accordingly.
 *
 * @param {string} event - Webhook event type (e.g., "charge.succeeded")
 * @param {Object} requestBody - The parsed JSON payload received from PayU
 * @param {dw.order.Order} order - The SFCC Order object to update
 * @returns {Object} Result object with error status and message
 */
function handleChargeNotification(event, requestBody, order) {
    var OrderMgr = require('dw/order/OrderMgr');
    var PaymentMgr = require('dw/order/PaymentMgr');

    try {
        var status = requestBody.data.result.status;
        var providerData = JSON.parse(requestBody.data.provider_data.raw_response);
        var providerDetails = requestBody.data.provider_data;

        var stringifyRequestBody = JSON.stringify(requestBody);
        var paymentInstrument = order.paymentInstrument;
        var transactionWasInPendingStatus = isTransactionWasInPendingStatus(paymentInstrument);
        var isProviderApprovedTransaction = isProviderResponseApproved(providerDetails);
        if (transactionWasInPendingStatus && isProviderApprovedTransaction) {
            // [Transaction Approved - Update using different Attributes.]
            updateOrderPaymentInstrumentRequiredAttributesAfterApproved(paymentInstrument, providerData);
        } else {
            updateOrderPaymentInstrumentRequiredAttributes(paymentInstrument, providerData);
        }

        paymentInstrument.custom.payUProviderName = providerDetails.provider_name || '';

        order.custom.payURawResponse = JSON.stringify(requestBody);
        // TODO: Will have to rewrite this logic once we start supporting multiple payment instruments for same order
        var orderTotal = order.totalGrossPrice;
        
        // Handle each charge status
        switch (status) {
			case PAYU_FACTORY.STATUS.RESPONSE.SUCCEED:
                // Set payment status as paid
                order.custom.pay_u_payment_status = PAYU_FACTORY.PAYMENT_STATUS.CAPTURED;
				order.custom.payuCaptureStatus = requestBody.data.result.status;
                var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;
                paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
                var orderTotal = order.totalGrossPrice;
                paymentInstrument.paymentTransaction.setAmount(new Money(orderTotal.value, orderTotal.currencyCode));
                order.setPaymentStatus(order.PAYMENT_STATUS_PAID);
                break;

            case PAYU_FACTORY.STATUS.RESPONSE.FAILED:
                order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                break;

            case PAYU_FACTORY.STATUS.RESPONSE.PENDING:
                // Set payment status as not paid
                order.custom.pay_u_payment_status =  PAYU_FACTORY.PAYMENT_STATUS.PENDING;
                order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                break;

            default:
                // Unknown status - log or handle if needed
                return {
                    error: true,
                    message: 'Unhandled charge status: ' + status
                };
        }

        return {
            error: false,
            message: Resource.msg('message.charge.success', 'payu', null)
        };

    } catch (e) {
        // Log error and return failure
        return {
            error: true,
            message: 'Exception in handleChargeNotification: ' + e.toString()
        };
    }
}



/**
 * Retrieves all refunds for a given payment ID and calculates the
 * total refunded amount with successful status.
 *
 * @param {string} paymentId - Unique identifier for the payment.
 * @returns {number} Total refunded amount (in minor units).
 */
function getTotalRefundedAmountAfterRefund(paymentId) {
    var allRefunds =  payuHelpers.retrieveRefunds(paymentId);
    var totalAmount = payuHelpers.getTotalRefundAmount(allRefunds);
    return totalAmount;
}

/**
 * Handles PayU refund notification webhook and updates order/payment status accordingly.
 *
 * @param {string} event - Webhook event type (e.g., "refund.succeeded")
 * @param {Object} requestBody - Parsed JSON payload received from PayU
 * @param {dw.order.Order} order - The SFCC Order object to update
 * @returns {Object} Result object indicating success or failure
 */
function handleRefundNotification(event, requestBody, order) {
    var PAYU_FACTORY = require('*/cartridge/scripts/utils/PayuFactory');
    var Order = require('dw/order/Order');

    try {
        if (!requestBody || !requestBody.data) {
            return {
                error: true,
                message: Resource.msg('message.request.data.invalid', 'payu', null)
            };
        }
		var data = requestBody.data;
        var status = data.result.status;
        var providerData = JSON.parse(data.provider_data.raw_response || '{}');
        var providerDetails = data.provider_data;
        var paymentInstrument = order.paymentInstrument;
		
        if (status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED) {
            var paymentId = requestBody.payment_id;
            var paymentInfo = payuHelpers.retrievePayment(paymentId); // Retrieves payment info from PaymentsOS

            updateOrderPaymentInstrumentRequiredAttributes(paymentInstrument, providerData);
            // Confirm refund was successful
            if (data.result.status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED 
                && paymentInfo.status === PAYU_FACTORY.PAYMENT_STATUS.REFUNDED
            ) {
                var totalRefundedAmount = getTotalRefundedAmountAfterRefund(paymentId);
                // Update order payment and custom status
                order.custom.pay_u_payment_status = PAYU_FACTORY.PAYMENT_STATUS.REFUNDED;
				order.custom.pay_u_refund_amount = PAYU_FACTORY.convertToMajorUnits(totalRefundedAmount);
				order.custom.pay_u_refund_reason = data.reason;
				
				order.custom.pay_u_refund_status = status;
                order.custom.pay_u_refund_id = data.id;
                return {
                    error: false,
                    message: Resource.msg('message.refund.success', 'payu', null)
                };
            } else {
                return {
                    error: true,
                    message: Resource.msg('message.refund.status.mismatch', 'payu', null)
                };
            }
        } else if (status === PAYU_FACTORY.STATUS.RESPONSE.PENDING) {
            // [Updated order attributes for pending status of refund.]
            var paymentId = requestBody.payment_id;
            var totalRefundedAmount = getTotalRefundedAmountAfterRefund(paymentId);
            order.custom.pay_u_refund_amount = PAYU_FACTORY.convertToMajorUnits(totalRefundedAmount);
            order.custom.pay_u_refund_reason = data.reason;
            order.custom.pay_u_refund_status = data.result.status;
            order.custom.pay_u_refund_id = data.id;
            return {
                error: false,
                message: Resource.msg('message.refund.success', 'payu', null)
            };
        } else {
            return {
                error: true,
                message: Resource.msg('message.refund.error', 'payu', null)
            };
        }
    } catch (e) {
        var err= e;
        return {
            error: true,
            message: 'Exception in handleRefundNotification: ' + e.toString()
        };
    }
}


/**
 * Utility function to generate HMAC-SHA256 hash
 */
function generateSignature(dataString, secretKey) {
	var Mac = require('dw/crypto/Mac');
    var Encoding = require('dw/crypto/Encoding');
    var Bytes = require('dw/util/Bytes');
    var mac = new Mac(Mac.HMAC_SHA_256);
    var keyBytes = new Bytes(secretKey, 'UTF-8');
    var dataBytes = new Bytes(dataString, 'UTF-8');
    
    var hashBytes = mac.digest(dataBytes, keyBytes);
    return Encoding.toHex(hashBytes); // Convert to Base64 or Hex as required
}


function handleVoidNotification(event, requestBody, order) {
    var PAYU_FACTORY = require('*/cartridge/scripts/utils/PayuFactory');


    if (!PAYU_FACTORY.CONFIGS.IS_VOID_ALLOWED) {
        return {error: true, message: 'Void transactions are not permitted on this site.'};
    }

    var OrderMgr = require('dw/order/OrderMgr');
    var logger = Logger.getLogger('PayU', 'PayUWebhook');
    try {
        var status = requestBody.data.result.status;
        var providerData = JSON.parse(requestBody.data.provider_data.raw_response);
        var providerDetails = requestBody.data.provider_data;
        var paymentInstrument = order.paymentInstrument;

        // Common fields to update regardless of status
        updateOrderPaymentInstrumentRequiredAttributes(paymentInstrument, providerData);

        order.custom.payURawResponse = JSON.stringify(requestBody);
        order.custom.pay_u_payment_status = PAYU_FACTORY.PAYMENT_STATUS.VOIDED;

        return {
            error: false
        }
    } catch (e) {
        logger.error('Exception in handleChargeNotification: ' + e.toString());
        // Log error and return failure
        return {
            error: true,
            message: 'Exception in handleChargeNotification: ' + e.toString()
        };
    }
}

/**
 * Maps PayU provider response data to custom fields on the payment instrument.
 * Each field is conditionally assigned if the corresponding property exists in the providerData object.
 *
 * Custom Fields:
 * - payUProviderResponseCode:     Provider response code.
 * - payUProviderDescription:      Description or message from the provider.
 * - payUOrderId:                  Unique PayU order identifier.
 * - payUProviderTransactionId:    Transaction ID assigned by the provider.
 * - payUProviderOperationDate:    Timestamp of the provider operation.
 * - payUProviderNetworkResponseCode: Response code from the payment network.
 * - payUProviderNetworkResponseMessage: Message from the payment network.
 * - payUTrazabilityCode:          Traceability code for transaction tracking.
 */
function updateOrderPaymentInstrumentRequiredAttributes(paymentInstrument, providerData) {
    // [Provider Response Code]
    if (providerData.responseCode) paymentInstrument.custom.payUProviderResponseCode = providerData.responseCode;

    // [Provider Description]
    if (providerData.description) paymentInstrument.custom.payUProviderDescription = providerData.description;

    // [ PayU Order ID ]
    if (providerData.orderId) paymentInstrument.custom.payUOrderId = providerData.orderId;

    // [Provider Transaction ID]
    if (providerData.transactionId) paymentInstrument.custom.payUProviderTransactionId = providerData.transactionId;

    // [Provider Operation Date]
    if (providerData.operationDate) paymentInstrument.custom.payUProviderOperationDate = providerData.operationDate;

    // [Provider Network Response Code]
    if (providerData.paymentNetworkResponseCode) paymentInstrument.custom.payUProviderNetworkResponseCode = providerData.paymentNetworkResponseCode;

    // [Provider Network Response Message]
    if (providerData.paymentNetworkResponseErrorMessage) paymentInstrument.custom.payUProviderNetworkResponseMessage = providerData.paymentNetworkResponseErrorMessage;
    
    // [ Provider Network Traceability Code ]
    if (providerData.trazabilityCode) paymentInstrument.custom.payUTrazabilityCode = providerData.trazabilityCode;

    // [ Make sure to Erase sensitive Information]
    paymentInstrument.custom.payUCardSecurityCode = '';
}

function updateOrderPaymentInstrumentRequiredAttributesAfterApproved(paymentInstrument, providerData) {
    // [Provider Response Code]
    if (providerData.response_message_pol) paymentInstrument.custom.payUProviderResponseCode = providerData.response_message_pol;
    
    // // paymentInstrument.custom.payUProviderResponseCode = providerData.responseCode || '';

    // // [Provider Description]
    if (providerData.description) paymentInstrument.custom.payUProviderDescription = providerData.description;

    // // [ PayU Order ID ]
    if (providerData.orderId) paymentInstrument.custom.payUOrderId = providerData.orderId;

    // // [Provider Transaction ID]
    if (providerData.transaction_id) paymentInstrument.custom.payUProviderTransactionId = providerData.transactionId;

    // // [Provider Operation Date]
    if (providerData.operationDate) paymentInstrument.custom.payUProviderOperationDate = providerData.operationDate;

    // // [Provider Network Response Code]
    if (providerData.paymentNetworkResponseCode) paymentInstrument.custom.payUProviderNetworkResponseCode = providerData.paymentNetworkResponseCode;

    // // [Provider Network Response Message]
    if (providerData.paymentNetworkResponseErrorMessage) paymentInstrument.custom.payUProviderNetworkResponseMessage = providerData.paymentNetworkResponseErrorMessage;
    
    // // [ Provider Network Traceability Code ]
    if (providerData.trazabilityCode) paymentInstrument.custom.payUTrazabilityCode = providerData.trazabilityCode;

    // [ Make sure to Erase sensitive Information]
    paymentInstrument.custom.payUCardSecurityCode = '';


}

/**
 * Checks if the transaction was previously in a 'Pending Review' status.
 *
 * @param {dw.order.PaymentInstrument} paymentInstrument - The payment instrument object from the order.
 * @returns {boolean} True if the transaction was in pending review status, false otherwise.
 */
function isTransactionWasInPendingStatus (paymentInstrument) {
    var pendingResponse = [PAYU_FACTORY.STATUS.PROVIDER_RESPONSE.PENDING_TRANSACTION_REVIEW, PAYU_FACTORY.STATUS.PROVIDER_RESPONSE.PENDING_THREEDS_CALLBACK]
    var transactionWasInPendingStatus = paymentInstrument.custom.payUProviderResponseCode && pendingResponse.includes(paymentInstrument.custom.payUProviderResponseCode) 
    return transactionWasInPendingStatus;
}

/**
 * Captures the payment after it has been authorized.
 *
 * @param {dw.order.Order} order - The order object to process.
 */
function captureAfterApprovedAuthorization(order, paymentDetails) {
    var paymentId = order.custom.payUPaymentId;
    if (paymentDetails.status === 'Authorized') {
        // [After Authorization: Capture the Payment]
        var captureResult = payuHelpers.capturePayment(paymentId);
        if (!captureResult || (captureResult && captureResult.error)) {
            logger.error('Payment capture failed: ' + JSON.stringify(captureResult));
        } else {
            var rawResponse = JSON.parse(captureResult.provider_data.raw_response);
            if (rawResponse.responseCode === 'APPROVED') {
                // updateOrderInformation(captureResult, order);
            }   
        }
    }
}


function updateOrderInformationAfter3dsResult(requestBody, order) {
    var providerData = JSON.parse(requestBody.data.provider_data.raw_response)

    var paymentInstrument = order.paymentInstrument;
    // [Provider Response Code]
    if (providerData.response_message_pol) paymentInstrument.custom.payUProviderResponseCode = providerData.response_message_pol;
    
    // // paymentInstrument.custom.payUProviderResponseCode = providerData.responseCode || '';
  
    // // [Provider Description]
    if (providerData.description) paymentInstrument.custom.payUProviderDescription = providerData.description;
  
    // // [ PayU Order ID ]
    if (providerData.orderId) paymentInstrument.custom.payUOrderId = providerData.orderId;
  
      // // [Provider Transaction ID]
    if (providerData.transaction_id) paymentInstrument.custom.payUProviderTransactionId = providerData.transactionId;
  
      // // [Provider Operation Date]
    if (providerData.operationDate) paymentInstrument.custom.payUProviderOperationDate = providerData.operationDate;
  
      // // [Provider Network Response Code]
    if (providerData.paymentNetworkResponseCode) paymentInstrument.custom.payUProviderNetworkResponseCode = providerData.paymentNetworkResponseCode;
  
      // // [Provider Network Response Message]
    if (providerData.paymentNetworkResponseErrorMessage) paymentInstrument.custom.payUProviderNetworkResponseMessage = providerData.paymentNetworkResponseErrorMessage;
      
      // // [ Provider Network Traceability Code ]
    if (providerData.trazabilityCode) paymentInstrument.custom.payUTrazabilityCode = providerData.trazabilityCode;
  
      // [ Make sure to Erase sensitive Information]
    paymentInstrument.custom.payUCardSecurityCode = '';
    order.custom.pay_u_payment_status = PAYU_FACTORY.STATUS.PAYMENT.INITIALIZED;

    order.addNote(
        'PAYU: 3DS AUTHENTICATION FAILED',
        'Payment ID: ' + requestBody.payment_id
    );
}


function markOrderAuthorizationFailed(requestBody, order) {
    var OrderMgr = require('dw/order/OrderMgr');
    OrderMgr.failOrder(order, true);
    var providerResponseCode = requestBody.data.provider_data.response_code;
    if (providerResponseCode === PAYU_FACTORY.STATUS.PROVIDER_RESPONSE.THREEDS_REJECTED) {
        // [Update Attributes for THREEDS_REJECTED]
        updateOrderInformationAfter3dsResult(requestBody, order);
    }

}


/**
 * Processes PayU authorization notification and updates the order status.
 *
 * - Updates payment instrument with provider data.
 * - Sets order status based on payment result: Succeed, Failed, or Pending.
 * - Saves raw response for reference or debugging.
 */
function handleAuthorizationNotification(event, requestBody, order) {

    try {

        if (order.custom.pay_u_payment_status === PAYU_FACTORY.PAYMENT_STATUS.CAPTURED) return {error: false, message: 'payment was already captured. No need to consume authorization event.'}
        var OrderMgr = require('dw/order/OrderMgr');
        var logger = Logger.getLogger('PayU', 'PayUWebhook');
        var status = requestBody.data.result.status;
        var providerData = JSON.parse(requestBody.data.provider_data.raw_response);
        var providerDetails = requestBody.data.provider_data;

        var paymentInstrument = order.paymentInstrument;

        var transactionWasInPendingStatus = isTransactionWasInPendingStatus(paymentInstrument);
        var isProviderApprovedTransaction = isProviderResponseApproved(providerDetails);
        var isCaptureRequired = false;
        var paymentId = order.custom.payUPaymentId;
        var paymentDetails = payuHelpers.retrievePayment(paymentId);
        if (transactionWasInPendingStatus && isProviderApprovedTransaction) {

            // [Transaction Approved - Update using different Attributes.]

            // [TODO : Capture if enable immediate Capture.]
            var immediateCaptureAllowed = PAYU_FACTORY.CONFIGS.ENABLE_IMMEDIATE_CAPTURE;
            if (immediateCaptureAllowed 
                && order.custom.pay_u_payment_status !== PAYU_FACTORY.PAYMENT_STATUS.CAPTURED
                && paymentDetails.status === PAYU_FACTORY.PAYMENT_STATUS.AUTHORIZED
            ) {
                isCaptureRequired = true;
                captureAfterApprovedAuthorization(order, paymentDetails);
            } else {
                updateOrderPaymentInstrumentRequiredAttributesAfterApproved(paymentInstrument, providerData);
            }
        } else {
            // Common fields to update regardless of status
            updateOrderPaymentInstrumentRequiredAttributes(paymentInstrument, providerData);
        }
        if (!isCaptureRequired) {
            paymentInstrument.custom.payUProviderName = providerDetails.provider_name || '';
            order.custom.payURawResponse = JSON.stringify(requestBody);
        }
        

        switch (status) {
			case 'Succeed':
                if (!isCaptureRequired) {
                    order.custom.pay_u_payment_status = PAYU_FACTORY.PAYMENT_STATUS.AUTHORIZED;
                }
                
                break;

            case 'Failed':
                markOrderAuthorizationFailed(requestBody, order);
                // Mark the order as failed in SFCC
                OrderMgr.failOrder(order, true);
                break;

            case 'Pending':
                
                // Set payment status as not paid
                order.custom.pay_u_payment_status =  PAYU_FACTORY.PAYMENT_STATUS.PENDING;
                order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                break;

            default:
                // Unknown status - log or handle if needed
                return {
                    error: true,
                    message: 'Unhandled Authorization status: ' + status
                };
        }
        return {error: false, message: 'event processed successfully.'};
    } catch (e) {
        // Log error and return failure
        return {
            error: true,
            message: 'Exception in handleAuthorizationNotification: ' + e.toString()
        };
    }
}

/**
 * Updates order and payment instrument information after a successful payment capture.
 *
 * @param {Object} paymentResponse - The payment response object from the provider.
 * @param {dw.order.Order} order - The order object to update.
 */
function updateOrderInformation(paymentResponse, order) {
	var Transaction = require('dw/system/Transaction');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var Order = require('dw/order/Order');
    var paymentInstrument = order.paymentInstrument;
    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;
    Transaction.wrap(function () {
        paymentInstrument.custom.payUCardSecurityCode = '';
        paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentInstrument.paymentTransaction.setTransactionID(order.orderNo);
        paymentInstrument.custom.payUAuthorizationId = paymentResponse.id;
        order.custom.payURawResponse = JSON.stringify(paymentResponse);
        order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
        order.custom.pay_u_payment_status = PAYU_FACTORY.PAYMENT_STATUS.CAPTURED;
    });
    return;
}

function wait(seconds) {
    var now = new Date().getTime();
    var end = now + seconds * 1000;
    while (new Date().getTime() < end) {
        // Busy-wait loop
    }
}
/**
 * Main webhook handler function
 * @param {Object} requestBody - Parsed request body JSON
 * @param {Object} headers - HTTP headers (from req.httpHeaders)
 * @returns {{ status: number, response: Object }}
 */
function handlePayUWebhook(requestBody, headers) {
	var PAYU_FACTORY = require('*/cartridge/scripts/utils/PayuFactory');
    wait(PAYU_FACTORY.CONSTANTS.WEBHOOK_DELAY); // Wait 15 seconds
	var Site = require('dw/system/Site');
	var Transaction = require('dw/system/Transaction');
	var OrderMgr = require('dw/order/OrderMgr');
	var Mac = require('dw/crypto/Mac');
	var Encoding = require('dw/crypto/Encoding');
	var Bytes = require('dw/util/Bytes');
	var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
    var Logger = require('dw/system/Logger');
    var logger = Logger.getLogger('PayU', 'PayUWebhook');

    if (!requestBody || !requestBody.id || !headers['event-type'] || !headers['signature']) {
        return { status: 400, response: { error: 'Missing data or headers' } };
    }

    var eventType = headers['event-type'];
    var signatureHeader = headers['signature'];
    var secretKey = PAYU_FACTORY.CONFIGS.PRIVATE_KEY;

    var dataFields = [
        eventType,
        requestBody.id,
        requestBody.account_id,
        requestBody.payment_id,
        requestBody.created,
        requestBody.app_id,
        requestBody.data.id,
        (requestBody.data.result && requestBody.data.result.status) ? requestBody.data.result.status : '',
        (requestBody.data.result && requestBody.data.result.category) ? requestBody.data.result.category : '',
        (requestBody.data.result && requestBody.data.result.sub_category) ? requestBody.data.result.sub_category : '',
        (requestBody.data.provider_data && requestBody.data.provider_data.response_code) ? requestBody.data.provider_data.response_code : '',
        requestBody.data.reconciliation_id ? requestBody.data.reconciliation_id : '',
        requestBody.data.amount ? requestBody.data.amount : '',
        requestBody.data.currency ? requestBody.data.currency : ''
    ];

    var concatenatedString = dataFields.join(',');
    var expectedSignature = generateSignature(concatenatedString, secretKey);
    var receivedSignature = signatureHeader.split('=')[1];

    if (expectedSignature !== receivedSignature) {
        logger.error('Signature mismatch. Received: {0}, Expected: {1}', receivedSignature, expectedSignature);
        return { status: 403, response: { error: 'Invalid signature' } };
    }

    var paymentId = requestBody.payment_id;
    var order = null;
    var orderId
    if (paymentId) {
        var paymentInfo = payuHelpers.retrievePayment(paymentId);
        orderId = paymentInfo && paymentInfo.order && paymentInfo.order.id ? paymentInfo.order.id : null;
        if (orderId) {
            order = OrderMgr.getOrder(orderId);
        }
    }

    if (!order) {
        logger.error('Order not found for Payment ID: {0}', paymentId);
        return { status: 404, response: { error: 'Order not found' } };
    }

    var orderPaymentId = order.custom.payUPaymentId;

    // [check to confirm if the valid order for webhook event]
    if (paymentId !== orderPaymentId) {
        return { 
            status: 403, 
            response: { 
                error: 'The provided payment ID does not match the payment ID associated with this order.'
            }
        };
    }    

    var EVENT = PAYU_FACTORY.WEBHOOK_EVENTS;
    var result = { success: true };
    var wehookUpdateResult;
    try {
        Transaction.wrap(function () {
            switch (eventType) {

                case EVENT.CHARGE.CREATE:
                case EVENT.CHARGE.UPDATE:
                    wehookUpdateResult = handleChargeNotification(eventType, requestBody, order);
                    break;

                case EVENT.CAPTURE.CREATE:
                case EVENT.CAPTURE.UPDATE:
                    wehookUpdateResult = handleCaptureNotification(eventType, requestBody, order, paymentInfo);
                    break;

                case EVENT.REFUND.CREATE:
                case EVENT.REFUND.UPDATE:
                    wehookUpdateResult = handleRefundNotification(eventType, requestBody, order);
                    break;

                case EVENT.VOID.UPDATE:
                case EVENT.VOID.CREATE:
                    wehookUpdateResult = handleVoidNotification(eventType, requestBody, order);
                    break;

                case EVENT.AUTHORIZATION.CREATE:
                case EVENT.AUTHORIZATION.UPDATE:
                    wehookUpdateResult = handleAuthorizationNotification(eventType, requestBody, order);
                    break;

                default:
                    logger.warn('Unhandled event type: {0}', eventType);
                    wehookUpdateResult = {error:true};
                    break;
            }
            updateWebhookNotificationOrderNote(eventType, requestBody, order);
        });

        // Return HTTP 500 with a descriptive error message in the response body.
        if (wehookUpdateResult && wehookUpdateResult.error) {
            return { status: 500, response: { error: 'Internal server error' } };
        } 

        // If the webhook event was processed successfully, return HTTP 200.
        return { status: 200 }
    } catch (e) {
        logger.error('Webhook processing failed. OrderID : {0} Event: {1}, Error: {2}', orderId, eventType, e.toString());
        return { status: 500, response: { error: 'Internal server error' } };
    }
}

module.exports = {
	handlePayUWebhook: handlePayUWebhook
}
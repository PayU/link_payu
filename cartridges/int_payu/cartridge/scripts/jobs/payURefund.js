'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');
var PAYU_FACTORY = require('*/cartridge/scripts/utils/PayuFactory');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

function updateRefundOrderNote(response, order) {
    var orderNote = COHelpers.getPaymentTransactionOrderNotes(response, 'refund');
    order.addNote(orderNote.title, orderNote.message);
}

/**
 * Processes a refund for a given Order ID via PayU PaymentsOS
 * @param {Object} parameters - The job parameters, expecting orderId
 * @returns {Status} - Status object indicating the success or failure of the refund
 */
function processRefund(parameters) {
    var log = Logger.getLogger('PAYU', 'PayURefundJob');
    log.info('Starting PayU Refund Job');

    var orderId = parameters.orderId;
    if (!orderId) {
        log.error('No Order ID provided.');
        return new Status(Status.ERROR, 'NO_ORDER_ID', 'Please provide an Order ID.');
    }

    var order = OrderMgr.getOrder(orderId);
    if (!order) {
        log.error('Order not found - {0}', orderId);
        return new Status(Status.ERROR, 'ORDER_NOT_FOUND', 'Order not found.');
    }

    if (order.custom.pay_u_payment_status !== PAYU_FACTORY.PAYMENT_STATUS.CAPTURED) {
        log.error('Payment status error: Order {0} is not in CAPTURED status.', orderId);
        return new Status(Status.ERROR, 'PAYMENT_NOT_CAPTURED', 'Payment Not Captured.');
    }

    if (order.custom.pay_u_refund_status === 'APPROVED') {
        log.warn('Order {0} is already refunded.', orderId);
        return new Status(Status.OK, 'ALREADY_REFUNDED', 'Order already refunded.');
    }

    try {
        var paymentInstrument = order.getPaymentInstruments()[0];
        if (!paymentInstrument) {
            log.error('No payment instrument found for order {0}', orderId);
            return new Status(Status.ERROR, 'NO_PAYMENT', 'No payment instrument found.');
        }

        var paymentId = paymentInstrument.custom.payUPaymentId;
        if (!paymentId) {
            log.error('No PayU Payment ID found for order {0}', orderId);
            return new Status(Status.ERROR, 'NO_PAYU_ID', 'No PayU Payment ID found.');
        }

        var paymentResponse = payuHelpers.retrievePayment(paymentId);
        if (!paymentResponse || paymentResponse.error) {
            log.error('Failed to retrieve payment for order {0}: {1}', orderId, JSON.stringify(paymentResponse));
            return new Status(Status.ERROR, 'INVALID_PAYMENT', 'Invalid Payment');
        }

        if (paymentResponse.status !== 'Captured') {
            log.error('Refund failed: Payment status is not Captured for order {0}', orderId);
            return new Status(Status.ERROR, 'INVALID_PAYMENT_STATUS', 'Payment is not in Captured status.');
        }

        var refundReason = parameters.refundReason || 'Customer Requested Refund';
        // Initiating refund
        var refundResponse = payuHelpers.initiateRefund(paymentId, refundReason);
        if (!refundResponse || refundResponse.error) {
            log.error('Refund initiation failed for order {0}: {1}', orderId, JSON.stringify(refundResponse));
            return new Status(Status.ERROR, 'REFUND_FAILED', 'Refund initiation failed.');
        }

        if (refundResponse.result.status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED
            || refundResponse.result.status === PAYU_FACTORY.STATUS.RESPONSE.PENDING) {
            Transaction.wrap(function () {
                order.custom.pay_u_refund_status = refundResponse.provider_data.response_code;
                order.custom.pay_u_refund_id = refundResponse.id;
                order.custom.pay_u_refund_amount = refundResponse.amount;
                order.custom.pay_u_refund_reason = refundReason;
                order.custom.pay_u_payment_status = 'Refunded';
                updateRefundOrderNote(refundResponse, order);
            });
            log.info('Refund processed successfully for order {0}', orderId);
            return new Status(Status.OK, 'SUCCESS', 'Refund processed successfully.');
        }

        log.error('Unexpected refund response for order {0}: {1}', orderId, JSON.stringify(refundResponse));
        return new Status(Status.ERROR, 'REFUND_FAILED', 'Unexpected refund response.');

    } catch (e) {
        log.error('Exception occurred while processing refund for order {0}: {1}', orderId, e.message);
        return new Status(Status.ERROR, 'EXCEPTION', 'Exception occurred: ' + e.message);
    }
}


function isPaymentEligibleForRefund(paymentResponse) {
    return paymentResponse.status === PAYU_FACTORY.STATUS.PAYMENT.CAPTURED;
}

function anyRefundInPendingStatus(refunds) {
    var anyRefundInPendingStatus = false;
    for (var i=0; i<refunds.length; i++) {
        if (refunds[i].result.status === PAYU_FACTORY.STATUS.RESPONSE.PENDING) {
            anyRefundInPendingStatus = true;
            break;
        }
    }

    return anyRefundInPendingStatus;
}

function isEligibleForPartialRefund(order, paymentResponse, requestedAmount) {
    var result = {
        status: false,
        msg: 'Not Eligible'
    };
    var paymentId = order.custom.payUPaymentId;
    var statusAllowedForPartialRefund = [PAYU_FACTORY.PAYMENT_STATUS.CAPTURED, PAYU_FACTORY.PAYMENT_STATUS.REFUNDED];
    var isPaymentEligibleForRefund = statusAllowedForPartialRefund.includes(paymentResponse.status);
    if (!isPaymentEligibleForRefund) {
        result.msg = 'Refund request denied: Payment is not in a valid status for refund processing.';
        return result;
    }


    var previousRefunds = payuHelpers.retrieveRefunds(paymentId);
    if (previousRefunds && previousRefunds.length === 0) {
        // [If no refund has been processed yet]
        result.status = true;
        result.msg = 'Refund available for this payment.'
        return result;
    }

    if (previousRefunds && previousRefunds.length > 0) {
        // If Refunds processed ALready, Need to verify the refund amount is not equal to the order amount.

        // [Check if there is any Pending Refund]

        var isAnyRefundInPendingStatus = anyRefundInPendingStatus(previousRefunds);

        if (isAnyRefundInPendingStatus) {
            result.status = false;
            result.msg = 'Refund is currently pending and cannot be requested again.';
            return result;
        }

        var totalRefundAmount = payuHelpers.getTotalRefundAmount(previousRefunds);
        var paidAmount = paymentResponse.amount;
        var remainingAmount = paidAmount - totalRefundAmount;
        
        if (
            totalRefundAmount < paidAmount &&
            requestedAmount <= remainingAmount &&
            requestedAmount <= paidAmount
        ) {
            result.status = true;
            result.msg = 'Refund available for this payment.'
            return result;
        } else {
            result.status = false;
            result.msg = 'Requested refund amount exceeds the available refundable balance.';
        }
    }

    return result;
}


/**
 * Processes a refund for a given Order ID via PayU PaymentsOS
 * @param {Object} parameters - The job parameters, expecting orderId
 * @returns {Status} - Status object indicating the success or failure of the refund
 */
function processPartialRefund(parameters) {
    var log = Logger.getLogger('PAYU', 'PayURefundJob');
    log.info('Starting PayU Refund Job');

    var orderId = parameters.orderId;
    var amount = Math.round(parseFloat(parameters.amount) * 100);
    if (!orderId) {
        log.error('No Order ID provided.');
        return new Status(Status.ERROR, 'NO_ORDER_ID', 'Please provide an Order ID.');
    }

    if (!amount) {
        log.error('No Amount provided.');
        return new Status(Status.ERROR, 'NO_AMOUNT', 'Please provide amount.');
    }

    var order = OrderMgr.getOrder(orderId);
    if (!order) {
        log.error('Order not found - {0}', orderId);
        return new Status(Status.ERROR, 'ORDER_NOT_FOUND', 'Order not found.');
    }

    try {
        var paymentInstrument = order.getPaymentInstruments()[0];
        if (!paymentInstrument) {
            log.error('No payment instrument found for order {0}', orderId);
            return new Status(Status.ERROR, 'NO_PAYMENT', 'No payment instrument found.');
        }

        var paymentId = paymentInstrument.custom.payUPaymentId;
        if (!paymentId) {
            log.error('No PayU Payment ID found for order {0}', orderId);
            return new Status(Status.ERROR, 'NO_PAYU_ID', 'No PayU Payment ID found.');
        }

        var paymentResponse = payuHelpers.retrievePayment(paymentId);
        if (!paymentResponse || paymentResponse.error) {
            log.error('Failed to retrieve payment for order {0}: {1}', orderId, JSON.stringify(paymentResponse));
            return new Status(Status.ERROR, 'INVALID_PAYMENT', 'Invalid Payment');
        }

        var result = isEligibleForPartialRefund(order, paymentResponse, amount);


        if (!result.status) {
            log.error('Refund failed: Order ID : {0} || Reason : {1}', orderId, result.msg);
            return new Status(Status.ERROR, 'NOT_ELIGIBLE_FOR_REFUND : ' + result.msg);
        }

        // [Logic To Process Refund]
        var refundReason = parameters.refundReason || 'Refund Initiated.';
        // // Initiating refund
        var refundResponse = payuHelpers.initiatePartialRefund(paymentId, amount, refundReason);
        if (!refundResponse || refundResponse.error) {
            log.error('Refund initiation failed for order {0}: {1}', orderId, JSON.stringify(refundResponse));
            return new Status(Status.ERROR, 'REFUND_FAILED' + 'Refund initiation failed.');
        }


        if (refundResponse.result.status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED
            || refundResponse.result.status === PAYU_FACTORY.STATUS.RESPONSE.PENDING
        ) {
            // Need to update the total Refund Amount

            var totalRefundedAmount = getTotalRefundedAmountAfterRefund(paymentId);

            Transaction.wrap(function () {
                order.custom.pay_u_refund_status = refundResponse.result.status;
                order.custom.pay_u_refund_id = refundResponse.id;
                order.custom.pay_u_refund_amount = payuHelpers.convertToMajorUnits(totalRefundedAmount);
                order.custom.pay_u_refund_reason = refundReason;
                updateRefundOrderNote(refundResponse, order);
            });

            if (refundResponse.result.status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED) {
                log.info('Refund processed successfully for order {0}', orderId);
            } else {
                log.info('Refund is pending for order {0}', orderId);
            }
            
            return new Status(Status.OK, 'SUCCESS', 'Refund processed successfully.');
        } 
        // else if (refundResponse.result.status === PAYU_FACTORY.STATUS.RESPONSE.PENDING) {
        //     var test = 1
        //     // var totalRefundedAmount = getTotalRefundedAmountAfterRefund(paymentId);
        //     // Transaction.wrap(function () {
        //     //     order.custom.pay_u_refund_status = refundResponse.result.status;
        //     //     order.custom.pay_u_refund_id = refundResponse.id;
        //     //     order.custom.pay_u_refund_amount = payuHelpers.convertToMajorUnits(totalRefundedAmount);
        //     //     order.custom.pay_u_refund_reason = refundReason;
        //     // });
        // }

        log.error('Unexpected refund response for order {0}: {1}', orderId, JSON.stringify(refundResponse));
        return new Status(Status.ERROR, 'REFUND_FAILED', 'Unexpected refund response.');

    } catch (e) {
        var err = e;
        log.error('Exception occurred while processing refund for order {0}: {1}', orderId, e.message);
        return new Status(Status.ERROR, 'EXCEPTION', 'Exception occurred: ' + e.message);
    }
}


function getTotalRefundedAmountAfterRefund(paymentId) {
    var allRefunds =  payuHelpers.retrieveRefunds(paymentId);
    var totalAmount = payuHelpers.getTotalRefundAmount(allRefunds);

    return totalAmount;
}

module.exports.processRefund = processRefund;
module.exports.processPartialRefund = processPartialRefund
